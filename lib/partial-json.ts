/**
 * A tolerant JSON layer.
 *
 * Two jobs, one body of code:
 *
 *   1. **Damage control.** Even in JSON mode, models emit code fences, a sentence
 *      of preamble, trailing commas, or `NaN`. We try progressively more invasive
 *      repairs and stop at the first one that parses.
 *
 *   2. **Streaming.** A half-received response is just malformed JSON with a very
 *      specific defect: it's truncated. `completeTruncatedJson` rewinds to the last
 *      structurally safe point and closes the open containers, which turns every
 *      intermediate chunk into a valid document we can render.
 *
 * Everything here is pure and synchronous so it can be unit-reasoned about and run
 * on both the server and the client.
 */

export type LooseParseResult =
  | { ok: true; value: unknown; repairs: string[]; truncated: boolean }
  | { ok: false; error: string; repairs: string[] };

/** Strip ```json fences and any prose before/after the JSON body. */
export function stripCodeFences(text: string): string {
  let out = text.trim();

  const fence = /^\s*```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```\s*$/.exec(out);
  if (fence) return fence[1].trim();

  // Unterminated fence — common while streaming.
  const openFence = /^\s*```(?:json|JSON)?\s*\n?([\s\S]*)$/.exec(out);
  if (openFence) out = openFence[1].trim();

  return out;
}

/** Narrow to the outermost JSON value, discarding any conversational padding. */
export function sliceToJsonBody(text: string): string {
  const start = text.search(/[{[]/);
  if (start === -1) return text.trim();

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);

  // No closer yet => still streaming; take everything we have.
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

type Scan = { safeEnd: number; openContainers: string[] };

/** Tracks whether the next string inside a container is a key or a value. */
type Frame = { type: "{" | "["; expecting: "key" | "value" };

/**
 * Single pass over the text, tracking string/escape state, container depth, and
 * key-vs-value position. Records the last index at which the document could be
 * legally closed without inventing data.
 *
 * Two judgement calls encoded here:
 *
 * - **A terminated string in value position is safe.** Its closing quote proves
 *   it's complete, so a stop's `name` becomes renderable the instant it lands
 *   rather than waiting for the enclosing object to close. This is what makes
 *   the streaming preview fill in smoothly instead of a day at a time.
 * - **A trailing bare scalar is not.** `…"cost":2` might be a complete `2` or
 *   the first digit of `250`; nothing in the text distinguishes them. Numbers
 *   are therefore only trusted once a delimiter proves the token ended. Dropping
 *   one costs an undefined field for a few milliseconds; keeping one risks
 *   rendering a confidently wrong price.
 */
function scanStructure(text: string): Scan {
  const stack: Frame[] = [];
  let safeEnd = -1;
  let safeStack: string[] = [];
  let inString = false;
  let escaped = false;
  let stringIsValue = false;

  const mark = (index: number) => {
    safeEnd = index;
    safeStack = stack.map((frame) => frame.type);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        if (stringIsValue) mark(i + 1);
      }
      continue;
    }

    const frame = stack[stack.length - 1];

    if (ch === '"') {
      inString = true;
      stringIsValue = !frame || frame.expecting === "value";
    } else if (ch === "{" || ch === "[") {
      stack.push({ type: ch, expecting: ch === "{" ? "key" : "value" });
      mark(i + 1); // an empty container is itself a valid document
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      mark(i + 1);
    } else if (ch === ",") {
      if (frame) frame.expecting = frame.type === "{" ? "key" : "value";
      mark(i + 1); // the comma itself gets trimmed when we rebuild
    } else if (ch === ":") {
      if (frame) frame.expecting = "value";
    }
  }

  return { safeEnd, openContainers: safeStack };
}

/**
 * Turn a truncated JSON document into a valid one by rewinding to the last
 * complete element and closing every container still open at that point.
 * Returns null when there is nothing salvageable yet.
 */
export function completeTruncatedJson(text: string): string | null {
  const { safeEnd, openContainers } = scanStructure(text);
  if (safeEnd <= 0) return null;

  let body = text.slice(0, safeEnd).replace(/,\s*$/, "");
  for (let i = openContainers.length - 1; i >= 0; i--) {
    body += openContainers[i] === "{" ? "}" : "]";
  }
  return body;
}

/** Remove commas that sit immediately before a closing brace/bracket. */
export function removeTrailingCommas(text: string): string {
  const out: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      out.push(ch);
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      // Walk back over whitespace; drop one comma if we find it.
      let i = out.length - 1;
      while (i >= 0 && /\s/.test(out[i])) i--;
      if (i >= 0 && out[i] === ",") out.splice(i, 1);
    }

    out.push(ch);
  }

  return out.join("");
}

/** Replace JS-only literals that are invalid JSON. */
function replaceInvalidLiterals(text: string): string {
  return text.replace(/:\s*(NaN|Infinity|-Infinity|undefined)\s*(?=[,}\]])/g, ": null");
}

/** Last resort: models occasionally use typographic quotes as delimiters. */
function normalizeSmartQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

/**
 * Parse `text` as JSON, applying repairs in increasing order of invasiveness and
 * reporting which ones were needed (surfaced in the UI as a transparency note).
 */
export function parseLoose(text: string): LooseParseResult {
  const repairs: string[] = [];

  if (!text || !text.trim()) {
    return { ok: false, error: "The model returned an empty response.", repairs };
  }

  const attempt = (candidate: string, truncated: boolean): LooseParseResult | null => {
    if (!candidate.trim()) return null;
    try {
      return { ok: true, value: JSON.parse(candidate), repairs: [...repairs], truncated };
    } catch {
      return null;
    }
  };

  // 0. Straight parse.
  const direct = attempt(text, false);
  if (direct) return direct;

  // 1. Drop code fences and surrounding prose.
  const fenced = stripCodeFences(text);
  if (fenced !== text.trim()) repairs.push("removed markdown code fence");
  const sliced = sliceToJsonBody(fenced);
  if (sliced !== fenced) repairs.push("discarded text around the JSON body");

  const afterSlice = attempt(sliced, false);
  if (afterSlice) return afterSlice;

  // 2. Fix common syntax slips.
  let repaired = removeTrailingCommas(sliced);
  if (repaired !== sliced) repairs.push("removed trailing commas");

  const withoutLiterals = replaceInvalidLiterals(repaired);
  if (withoutLiterals !== repaired) repairs.push("replaced NaN/undefined with null");
  repaired = withoutLiterals;

  const afterRepair = attempt(repaired, false);
  if (afterRepair) return afterRepair;

  // 3. Assume truncation and close the open containers.
  const completed = completeTruncatedJson(repaired);
  if (completed) {
    const afterComplete = attempt(completed, true);
    if (afterComplete) {
      afterComplete.repairs.push("closed an incomplete JSON structure");
      return afterComplete;
    }
  }

  // 4. Typographic quotes.
  const straightened = removeTrailingCommas(normalizeSmartQuotes(repaired));
  if (straightened !== repaired) {
    const afterQuotes =
      attempt(straightened, false) ??
      (() => {
        const c = completeTruncatedJson(straightened);
        return c ? attempt(c, true) : null;
      })();
    if (afterQuotes) {
      afterQuotes.repairs.push("normalised typographic quotes");
      return afterQuotes;
    }
  }

  return {
    ok: false,
    error: "The response was not valid JSON, even after repair attempts.",
    repairs,
  };
}

/**
 * Streaming entry point: parse whatever has arrived so far, tolerating truncation.
 * Returns null when the buffer isn't yet structurally meaningful.
 */
export function parseStreamingSnapshot(buffer: string): unknown | null {
  const sliced = sliceToJsonBody(stripCodeFences(buffer));
  if (!sliced.trim()) return null;

  try {
    return JSON.parse(sliced);
  } catch {
    // expected for every chunk but the last
  }

  const completed = completeTruncatedJson(removeTrailingCommas(sliced));
  if (!completed) return null;

  try {
    return JSON.parse(completed);
  } catch {
    return null;
  }
}
