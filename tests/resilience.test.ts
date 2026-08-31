/**
 * Adversarial tests for the "model returned garbage" path.
 *
 * These are the cases the brief singles out — malformed JSON, wrong shape,
 * empty, truncated — encoded as real inputs I actually saw (or deliberately
 * provoked) while building. Run with `npm test`.
 *
 * Node's built-in runner, no framework: Node 22.18+ strips the types natively.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeItinerary, normalizePartialItinerary } from "../lib/normalize";
import { completeTruncatedJson, parseLoose, parseStreamingSnapshot } from "../lib/partial-json";

const meta = { id: "test", sourcePrompt: "3 days in Kyoto" };

const goodDay = {
  dayNumber: 1,
  title: "Higashiyama on foot",
  stops: [{ name: "Kiyomizu-dera", kind: "sight", description: "Hillside temple." }],
};

describe("parseLoose — malformed JSON", () => {
  it("parses clean JSON unchanged", () => {
    const result = parseLoose('{"a":1}');
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value, { a: 1 });
    assert.deepEqual(result.ok && result.repairs, []);
  });

  it("strips markdown code fences", () => {
    const result = parseLoose('```json\n{"a":1}\n```');
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.repairs.some((r) => r.includes("code fence")));
  });

  it("discards conversational preamble and trailing prose", () => {
    const result = parseLoose('Sure! Here is your itinerary:\n{"a":1}\nHope that helps!');
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value, { a: 1 });
  });

  it("removes trailing commas", () => {
    const result = parseLoose('{"a":1,"b":[1,2,],}');
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value, { a: 1, b: [1, 2] });
  });

  it("does not corrupt commas that live inside strings", () => {
    const result = parseLoose('{"a":"Kyoto, Japan","b":[1,2,]}');
    assert.equal(result.ok, true);
    assert.equal(result.ok && (result.value as { a: string }).a, "Kyoto, Japan");
  });

  it("replaces NaN with null instead of failing", () => {
    const result = parseLoose('{"cost":NaN}');
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value, { cost: null });
  });

  it("reports failure for text with no JSON at all", () => {
    const result = parseLoose("I cannot help with that request.");
    assert.equal(result.ok, false);
  });

  it("reports failure for an empty response", () => {
    assert.equal(parseLoose("").ok, false);
    assert.equal(parseLoose("   \n ").ok, false);
  });
});

describe("completeTruncatedJson — the streaming case", () => {
  it("keeps a terminated string value — its closing quote proves it is complete", () => {
    assert.equal(completeTruncatedJson('{"a":1,"b":"done"'), '{"a":1,"b":"done"}');
  });

  it("keeps a completed value nested several containers deep", () => {
    assert.equal(
      completeTruncatedJson('{"days":[{"stops":[{"name":"Kiyomizu-dera"'),
      '{"days":[{"stops":[{"name":"Kiyomizu-dera"}]}]}',
    );
  });

  it("drops a trailing bare number, which may be mid-token", () => {
    // "2" could be a complete 2 or the first digit of 250; nothing distinguishes
    // them, so we drop it rather than render a confidently wrong price.
    assert.equal(completeTruncatedJson('{"a":1,"b":2'), '{"a":1}');
  });

  it("keeps a number once a delimiter proves the token ended", () => {
    assert.equal(completeTruncatedJson('{"a":1,"b":250,'), '{"a":1,"b":250}');
  });

  it("rewinds past a dangling key with no value", () => {
    assert.equal(completeTruncatedJson('{"a":1,"b"'), '{"a":1}');
    assert.equal(completeTruncatedJson('{"a":1,"b":'), '{"a":1}');
  });

  it("drops a half-written string rather than emitting broken JSON", () => {
    assert.equal(completeTruncatedJson('{"a":1,"b":"Kiyomi'), '{"a":1}');
  });

  it("closes nested arrays of objects", () => {
    assert.equal(completeTruncatedJson('{"days":[{"t":1},{"t":2}'), '{"days":[{"t":1},{"t":2}]}');
  });

  it("handles a container that has only just opened", () => {
    assert.equal(completeTruncatedJson('{"days":['), '{"days":[]}');
  });

  it("is not fooled by braces or commas inside string values", () => {
    const completed = completeTruncatedJson('{"a":"a { brace, and comma","b":2');
    assert.equal(completed, '{"a":"a { brace, and comma"}');
    assert.doesNotThrow(() => JSON.parse(completed as string));
  });

  it("is not fooled by an escaped quote inside a string", () => {
    const completed = completeTruncatedJson('{"a":"she said \\"hi\\"","b"');
    assert.equal(completed, '{"a":"she said \\"hi\\""}');
    assert.equal(JSON.parse(completed as string).a, 'she said "hi"');
  });

  it("returns null when nothing is salvageable", () => {
    assert.equal(completeTruncatedJson("garbage"), null);
  });

  it("never emits invalid JSON for any prefix of a realistic response", () => {
    const full = JSON.stringify({
      title: "Kyoto",
      destination: "Kyoto, Japan",
      currency: "JPY",
      days: [goodDay, { ...goodDay, dayNumber: 2, title: 'Arashiyama, "west side"' }],
    });

    for (let i = 0; i <= full.length; i++) {
      const completed = completeTruncatedJson(full.slice(0, i));
      if (completed === null) continue;
      assert.doesNotThrow(
        () => JSON.parse(completed),
        `prefix of length ${i} produced invalid JSON: ${completed}`,
      );
    }
  });
});

describe("parseStreamingSnapshot", () => {
  it("yields progressively more days as chunks arrive", () => {
    const full = JSON.stringify({ title: "T", destination: "D", days: [goodDay, goodDay] });
    const seen: number[] = [];

    for (let i = 1; i <= full.length; i += 7) {
      const snapshot = parseStreamingSnapshot(full.slice(0, i)) as { days?: unknown[] } | null;
      if (snapshot?.days) seen.push(snapshot.days.length);
    }

    // Monotonically non-decreasing, ending at the full count.
    assert.equal(seen.at(-1), 2);
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  });
});

describe("normalizeItinerary — wrong shape, salvaged", () => {
  it("accepts a well-formed itinerary", () => {
    const result = normalizeItinerary(
      { title: "Kyoto", destination: "Kyoto, Japan", days: [goodDay] },
      meta,
    );
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.itinerary.days.length, 1);
    assert.equal(result.ok && result.issues.length, 0);
  });

  it("keeps good days and drops only the broken one", () => {
    const result = normalizeItinerary(
      {
        title: "Kyoto",
        destination: "Kyoto, Japan",
        days: [goodDay, { dayNumber: 2 /* no title, no stops */ }, goodDay],
      },
      meta,
    );
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.itinerary.days.length, 2);
    assert.ok(result.ok && result.issues.some((i) => i.severity === "dropped"));
  });

  it("drops unreadable stops without losing the day", () => {
    const result = normalizeItinerary(
      {
        title: "Kyoto",
        destination: "Kyoto, Japan",
        days: [{ ...goodDay, stops: [goodDay.stops[0], { kind: "sight" }, null, "nonsense"] }],
      },
      meta,
    );
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.itinerary.days[0].stops.length, 1);
  });

  it("renumbers days after drops so the UI never shows a gap", () => {
    const result = normalizeItinerary(
      {
        title: "Kyoto",
        destination: "Kyoto, Japan",
        days: [goodDay, { dayNumber: 2 }, { ...goodDay, dayNumber: 7 }],
      },
      meta,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.itinerary.days.map((d) => d.dayNumber), [1, 2]);
  });

  it("rejects a response with no usable days", () => {
    const result = normalizeItinerary({ title: "T", destination: "D", days: [] }, meta);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, "no-days");
  });

  it("rejects an array where an object was required", () => {
    const result = normalizeItinerary([1, 2, 3], meta);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, "not-an-object");
  });

  it("rejects an itinerary missing its title", () => {
    const result = normalizeItinerary({ destination: "D", days: [goodDay] }, meta);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, "bad-shape");
  });
});

describe("normalizeItinerary — coercing sloppy field values", () => {
  const withStop = (stop: Record<string, unknown>) => ({
    title: "T",
    destination: "D",
    days: [{ dayNumber: 1, title: "Day", stops: [{ name: "X", description: "Y", ...stop }] }],
  });

  const firstStop = (raw: Record<string, unknown>) => {
    const result = normalizeItinerary(raw, meta);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    return result.itinerary.days[0].stops[0];
  };

  it('parses "$1,200" into a number', () => {
    assert.equal(firstStop(withStop({ estimatedCost: "$1,200" })).estimatedCost, 1200);
  });

  it('treats "free" as zero', () => {
    assert.equal(firstStop(withStop({ estimatedCost: "free" })).estimatedCost, 0);
  });

  it("drops a cost it cannot read at all", () => {
    assert.equal(firstStop(withStop({ estimatedCost: "varies" })).estimatedCost, undefined);
  });

  it("normalises 12-hour times to HH:MM", () => {
    assert.equal(firstStop(withStop({ startTime: "9:30 PM" })).startTime, "21:30");
    assert.equal(firstStop(withStop({ startTime: "9am" })).startTime, "09:00");
    assert.equal(firstStop(withStop({ startTime: "0900" })).startTime, "09:00");
  });

  it("discards an impossible time rather than rendering it", () => {
    assert.equal(firstStop(withStop({ startTime: "99:99" })).startTime, undefined);
  });

  it("falls back to a valid kind when given an unknown one", () => {
    assert.equal(firstStop(withStop({ kind: "teleportation" })).kind, "sight");
  });

  it("accepts tips as a bare string, an array, or null", () => {
    assert.deepEqual(firstStop(withStop({ tips: "Go early" })).tips, ["Go early"]);
    assert.deepEqual(firstStop(withStop({ tips: null })).tips, []);
    assert.deepEqual(firstStop(withStop({ tips: ["a", "", null, "b"] })).tips, ["a", "b"]);
  });

  it("falls back to USD for a nonsense currency", () => {
    const result = normalizeItinerary(
      { title: "T", destination: "D", currency: "dollars", days: [goodDay] },
      meta,
    );
    assert.equal(result.ok && result.itinerary.currency, "USD");
  });
});

describe("normalizePartialItinerary — never throws mid-stream", () => {
  it("returns null before a title or destination exists", () => {
    assert.equal(normalizePartialItinerary({}, meta), null);
    assert.equal(normalizePartialItinerary(null, meta), null);
    assert.equal(normalizePartialItinerary([1], meta), null);
  });

  it("renders a header-only skeleton once the title lands", () => {
    const partial = normalizePartialItinerary({ title: "Kyoto in spring" }, meta);
    assert.equal(partial?.title, "Kyoto in spring");
    assert.deepEqual(partial?.days, []);
  });

  it("survives every prefix of a real response", () => {
    const full = JSON.stringify({ title: "T", destination: "D", days: [goodDay] });
    for (let i = 0; i <= full.length; i++) {
      const snapshot = parseStreamingSnapshot(full.slice(0, i));
      assert.doesNotThrow(() => normalizePartialItinerary(snapshot, meta));
    }
  });
});
