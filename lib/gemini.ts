import { GoogleGenAI, ThinkingLevel, type Schema } from "@google/genai";
import { geminiResponseSchema } from "./schema";
import { SYSTEM_INSTRUCTION } from "./prompt";

/**
 * Server-only Gemini access.
 *
 * The API key is read from the environment here and nowhere else. There is no
 * NEXT_PUBLIC_ variable anywhere in this project, so the key cannot reach the
 * client bundle — the browser only ever talks to /api/itinerary.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/gemini.ts must never be imported into client code.");
}

/**
 * Kept current deliberately. Google retires models for *new* API keys while
 * still listing them on /models, so a stale default fails only for people who
 * signed up recently — the worst kind of bug to inherit.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash";

export function getModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

let cached: GoogleGenAI | null = null;

/** Returns null when no key is configured, so the caller can raise `missing_key`. */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cached) cached = new GoogleGenAI({ apiKey });
  return cached;
}

const baseConfig = {
  systemInstruction: SYSTEM_INSTRUCTION,
  responseMimeType: "application/json",
  responseSchema: geminiResponseSchema as unknown as Schema,
  temperature: 0.85,
  topP: 0.95,
  maxOutputTokens: 8192,
  // Gemini 3.x thinks before it speaks, and at the default depth that means
  // ~64s of silence followed by the entire response in a single chunk — which
  // defeats streaming entirely and nearly trips the request timeout.
  //
  // `thinkingLevel: "low"` takes first-token latency from ~64s to ~2s and turns
  // one chunk into ~107, so the UI fills in progressively. Note that 3.x rejects
  // `thinkingBudget: 0` outright (400) — thinking can be shortened, not skipped.
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
};

export type StreamChunk = {
  text: string;
  finishReason?: string;
  /** Which model actually served this chunk — may not be the configured one. */
  model: string;
  /**
   * Discard everything received so far: the previous attempt died part-way and
   * a fresh one is starting. Splicing two partial responses together would
   * produce JSON that parses into nonsense, so the buffer must be reset rather
   * than appended to.
   */
  reset?: boolean;
};

/**
 * Models newer than about a quarter old are frequently saturated: a plain 503
 * "experiencing high demand" is the single most common way this app fails, and
 * it has nothing to do with the request. So the primary model is tried twice
 * with backoff, then we move down a chain of progressively less fashionable —
 * and therefore less contended — models.
 */
const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview"];

function modelChain(): string[] {
  const primary = getModelName();
  return [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
}

/** Congestion and transport hiccups are worth another go; a 400 is not. */
function isTransient(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    text.includes("unavailable") ||
    text.includes("high demand") ||
    text.includes("overloaded") ||
    text.includes("terminated") ||
    text.includes("econnreset") ||
    text.includes("fetch failed") ||
    /"code":\s*(429|500|502|503|504)/.test(text) ||
    /\b(429|503)\b/.test(text)
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Total generation attempts across all models before giving up. */
const MAX_ATTEMPTS = 4;

/**
 * Streams raw model text, retrying and falling back on congestion.
 *
 * Under load this provider frequently accepts a connection, sends part of a
 * response, then drops it — so retrying only *before* the first byte would
 * leave the most common failure unhandled. Instead a restart is always allowed,
 * and it emits `reset: true` first so the consumer discards the partial text.
 * Appending a second attempt to the first would splice two different responses
 * into one buffer and parse into nonsense.
 *
 * The attempt budget is global rather than per-model, so a wholly unavailable
 * provider fails in seconds instead of grinding through the entire chain twice.
 */
export async function* streamItinerary(
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const client = getGeminiClient();
  if (!client) throw new Error("MISSING_API_KEY");

  const chain = modelChain();
  let lastError: unknown = new Error("No model produced a response.");
  let attempts = 0;
  let dirty = false; // whether the consumer holds text from a failed attempt

  for (const model of chain) {
    // Two goes at each model: congestion is usually momentary.
    for (let perModel = 0; perModel < 2 && attempts < MAX_ATTEMPTS; perModel++) {
      attempts++;
      try {
        const stream = await client.models.generateContentStream({
          model,
          contents: prompt,
          config: { ...baseConfig, abortSignal: signal },
        });

        let first = true;
        for await (const chunk of stream) {
          if (signal.aborted) return;
          const text = chunk.text ?? "";

          // Tell the consumer to drop the previous attempt's partial text
          // before any of this attempt's text reaches it.
          if (first && dirty) {
            yield { text: "", model, reset: true };
            dirty = false;
          }
          if (text) first = false;

          yield {
            text,
            finishReason: chunk.candidates?.[0]?.finishReason ?? undefined,
            model,
          };
        }
        return; // completed cleanly
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        dirty = true;
        if (!isTransient(error)) break; // a real error: move to the next model
        await sleep(500 * perModel + 400, signal);
      }
    }
  }

  throw lastError;
}

/**
 * Second-chance repair: hand the model its own broken output plus the parser's
 * complaint and ask for a corrected document. Non-streaming and low-temperature —
 * this is a transcription task, not a creative one.
 */
export async function repairJson(
  brokenOutput: string,
  problem: string,
  signal: AbortSignal,
): Promise<string> {
  const client = getGeminiClient();
  if (!client) throw new Error("MISSING_API_KEY");

  const response = await client.models.generateContent({
    model: getModelName(),
    contents: `Your previous response could not be used.

Problem: ${problem}

Previous response:
"""
${brokenOutput.slice(0, 12000)}
"""

Return the same itinerary as a single valid JSON object matching the required schema. Preserve every place name, time, and description exactly as written — this is a formatting fix, not a rewrite. If the response was cut off, complete it plausibly in the same style. Output JSON only.`,
    config: {
      ...baseConfig,
      temperature: 0.1,
      abortSignal: signal,
    },
  });

  return response.text ?? "";
}
