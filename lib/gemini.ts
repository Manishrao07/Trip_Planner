import { GoogleGenAI, type Schema } from "@google/genai";
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

export const DEFAULT_MODEL = "gemini-2.5-flash";

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
  // 2.5-flash thinks before it speaks by default, which means ~10s of silence
  // followed by a dump. Disabling it trades a little planning depth for a stream
  // that actually starts streaming — the system instruction carries the quality.
  thinkingConfig: { thinkingBudget: 0 },
};

export type StreamChunk = {
  text: string;
  finishReason?: string;
};

/** Streams raw model text. The caller owns parsing. */
export async function* streamItinerary(
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const client = getGeminiClient();
  if (!client) throw new Error("MISSING_API_KEY");

  const stream = await client.models.generateContentStream({
    model: getModelName(),
    contents: prompt,
    config: { ...baseConfig, abortSignal: signal },
  });

  for await (const chunk of stream) {
    if (signal.aborted) return;
    yield {
      text: chunk.text ?? "",
      finishReason: chunk.candidates?.[0]?.finishReason ?? undefined,
    };
  }
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
