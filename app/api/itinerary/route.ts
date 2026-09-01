import { NextRequest } from "next/server";
import { z } from "zod";

import { classifyThrown, makeError, statusForKind, type ErrorKind } from "@/lib/errors";
import { getGeminiClient, getModelName, repairJson, streamItinerary } from "@/lib/gemini";
import { normalizeItinerary, type NormalizationIssue } from "@/lib/normalize";
import { parseLoose } from "@/lib/partial-json";
import { buildGeneratePrompt, buildRefinePrompt } from "@/lib/prompt";
import { encodeEvent, type ServerEvent } from "@/lib/protocol";
import type { Itinerary } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const TIMEOUT_MS = 70_000;

const BodySchema = z.object({
  mode: z.enum(["generate", "refine"]).default("generate"),
  prompt: z.string().trim().min(3, "Describe your trip in a little more detail.").max(4000),
  /** Present only for refinements — the itinerary currently on screen. */
  itinerary: z.record(z.unknown()).optional(),
});

function jsonError(kind: ErrorKind, detail?: string) {
  const error = makeError(kind, detail ? { message: detail } : {});
  return Response.json({ type: "error", error } satisfies ServerEvent, {
    status: statusForKind(kind),
  });
}

type BuildOutcome =
  | { ok: true; itinerary: Itinerary; issues: NormalizationIssue[]; repairs: string[] }
  | { ok: false; kind: ErrorKind; problem: string; repairs: string[] };

/** parse -> validate -> normalise, mapping each failure onto the error taxonomy. */
function buildResult(raw: string, sourcePrompt: string, id: string): BuildOutcome {
  if (!raw.trim()) {
    return { ok: false, kind: "empty_response", problem: "The response was empty.", repairs: [] };
  }

  const parsed = parseLoose(raw);
  if (!parsed.ok) {
    return { ok: false, kind: "unparseable", problem: parsed.error, repairs: parsed.repairs };
  }

  const normalized = normalizeItinerary(parsed.value, { id, sourcePrompt });
  if (!normalized.ok) {
    return {
      ok: false,
      kind: normalized.reason === "no-days" ? "no_days" : "bad_shape",
      problem: normalized.message,
      repairs: parsed.repairs,
    };
  }

  const issues = [...normalized.issues];
  if (parsed.truncated) {
    issues.push({
      path: "$",
      message: "The model's response was cut short; the tail was reconstructed.",
      severity: "repaired",
    });
  }

  return { ok: true, itinerary: normalized.itinerary, issues, repairs: parsed.repairs };
}

export async function POST(request: NextRequest) {
  // --- Pre-flight. These fail with a real HTTP status, before any stream opens. ---
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_input", "The request body wasn't valid JSON.");
  }

  const body = BodySchema.safeParse(rawBody);
  if (!body.success) {
    return jsonError("invalid_input", body.error.issues[0]?.message ?? "Invalid request.");
  }

  if (!getGeminiClient()) return jsonError("missing_key");

  const { mode, prompt, itinerary } = body.data;
  if (mode === "refine" && !itinerary) {
    return jsonError("invalid_input", "Refinement needs an existing itinerary to edit.");
  }

  const modelPrompt =
    mode === "refine"
      ? buildRefinePrompt(itinerary as unknown as Itinerary, prompt)
      : buildGeneratePrompt(prompt);

  const itineraryId = crypto.randomUUID();
  const encoder = new TextEncoder();

  // --- Streaming phase. Failures from here on are delivered as `error` events. ---
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ServerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          closed = true;
        }
      };

      const abort = new AbortController();
      const onClientDisconnect = () => abort.abort();
      request.signal.addEventListener("abort", onClientDisconnect);
      const timer = setTimeout(
        () => abort.abort(new DOMException("Generation timed out", "TimeoutError")),
        TIMEOUT_MS,
      );

      try {
        send({ type: "meta", model: getModelName(), mode });
        send({ type: "status", stage: "generating" });

        let raw = "";
        let finishReason: string | undefined;
        let servedBy: string | undefined;

        let restarts = 0;

        for await (const chunk of streamItinerary(modelPrompt, abort.signal)) {
          if (chunk.reset) {
            // A previous attempt died mid-stream. Drop what both ends hold.
            raw = "";
            restarts++;
            send({ type: "reset" });
            continue;
          }
          if (chunk.text) {
            raw += chunk.text;
            send({ type: "delta", text: chunk.text });
          }
          if (chunk.finishReason) finishReason = chunk.finishReason;
          servedBy = chunk.model;
        }

        // The user navigated away or typed a new prompt — stop doing work.
        if (request.signal.aborted) return;

        if (finishReason && /SAFETY|PROHIBITED|BLOCK|RECITATION/i.test(finishReason)) {
          send({ type: "error", error: makeError("blocked") });
          return;
        }

        send({ type: "status", stage: "validating" });
        let outcome = buildResult(raw, prompt, itineraryId);

        // One repair round-trip before giving up. Cheap relative to a user retry,
        // and it converts most "unparseable" failures into a usable itinerary.
        if (!outcome.ok && outcome.kind !== "empty_response") {
          send({ type: "status", stage: "repairing" });
          try {
            const repaired = await repairJson(raw, outcome.problem, abort.signal);
            const second = buildResult(repaired, prompt, itineraryId);
            if (second.ok) {
              second.repairs.push("asked the model to fix its own malformed output");
              outcome = second;
            }
          } catch {
            // Keep the original, more specific failure.
          }
        }

        if (!outcome.ok) {
          send({
            type: "error",
            error: makeError(outcome.kind, {
              message: outcome.problem,
              repairs: outcome.repairs,
            }),
          });
          return;
        }

        if (restarts > 0) {
          outcome.issues.push({
            path: "$",
            message: `The connection dropped mid-response ${restarts === 1 ? "once" : `${restarts} times`}; the itinerary was regenerated.`,
            severity: "repaired",
          });
        }

        // Be transparent when congestion pushed us onto a different model.
        if (servedBy && servedBy !== getModelName()) {
          outcome.issues.push({
            path: "$",
            message: `${getModelName()} was unavailable, so this was planned by ${servedBy}.`,
            severity: "repaired",
          });
        }

        const truncatedByLimit = finishReason === "MAX_TOKENS";
        if (truncatedByLimit) {
          outcome.issues.push({
            path: "$",
            message: "The itinerary hit the model's output limit, so it may be shorter than asked.",
            severity: "repaired",
          });
        }

        send({
          type: "result",
          itinerary: outcome.itinerary,
          issues: outcome.issues,
          repairs: outcome.repairs,
          degraded: outcome.issues.length > 0 || outcome.repairs.length > 0,
        });
      } catch (error) {
        if (request.signal.aborted) return;
        const kind = classifyThrown(error);
        if (process.env.NODE_ENV !== "production") {
          console.error(`[itinerary] ${kind}:`, error);
        }
        send({ type: "error", error: makeError(kind) });
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onClientDisconnect);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Tell nginx-style proxies not to buffer, or streaming silently degrades.
      "X-Accel-Buffering": "no",
    },
  });
}
