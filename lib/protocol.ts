import type { AppError } from "./errors";
import type { NormalizationIssue } from "./normalize";
import type { Itinerary } from "./schema";

/**
 * The client/server wire protocol: newline-delimited JSON over a streaming
 * response.
 *
 * Why not Server-Sent Events? SSE is a GET-shaped protocol with a text framing
 * that we'd have to escape around. This endpoint is a POST with a JSON body, and
 * NDJSON is trivially parseable with a split on "\n" — one less thing to get
 * subtly wrong.
 *
 * The important design decision: **the server is authoritative**. Deltas exist
 * only so the UI can show progress. The `result` event carries the parsed,
 * validated, normalised itinerary, so the client never has to trust its own
 * optimistic partial parse.
 */

export type RequestMode = "generate" | "refine";

export type StreamStage = "generating" | "repairing" | "validating";

export type ServerEvent =
  | { type: "meta"; model: string; mode: RequestMode }
  | { type: "delta"; text: string }
  | { type: "status"; stage: StreamStage }
  | {
      type: "result";
      itinerary: Itinerary;
      issues: NormalizationIssue[];
      /** JSON repairs that were required to read the response. */
      repairs: string[];
      /** True when the itinerary is usable but something was lost getting here. */
      degraded: boolean;
    }
  | { type: "error"; error: AppError };

export function encodeEvent(event: ServerEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Incremental NDJSON decoder. Chunk boundaries fall wherever the network decides,
 * so we buffer until we actually have a newline.
 */
export function createEventDecoder() {
  let buffer = "";

  return {
    push(chunk: string): ServerEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      const events: ServerEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as ServerEvent);
        } catch {
          // A malformed frame is not worth failing the whole stream over.
        }
      }
      return events;
    },
    /** Flush any trailing frame that arrived without a newline. */
    flush(): ServerEvent[] {
      const trimmed = buffer.trim();
      buffer = "";
      if (!trimmed) return [];
      try {
        return [JSON.parse(trimmed) as ServerEvent];
      } catch {
        return [];
      }
    },
  };
}
