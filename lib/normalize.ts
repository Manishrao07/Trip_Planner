import {
  DaySchema,
  ItinerarySchema,
  StopSchema,
  type Day,
  type Itinerary,
  type Stop,
} from "./schema";

/**
 * Turn an arbitrary parsed value into an `Itinerary` the UI can render.
 *
 * The governing principle is **salvage over reject**. If the model returns eight
 * good days and one malformed one, the user should see eight days and a quiet
 * note about the ninth — not an error screen. We only fail outright when there is
 * genuinely nothing to show.
 *
 * Every drop and coercion is recorded in `issues` so the UI can be honest about
 * what happened instead of silently hiding it.
 */

export type IssueSeverity = "dropped" | "repaired";

export type NormalizationIssue = {
  path: string;
  message: string;
  severity: IssueSeverity;
};

export type NormalizeResult =
  | { ok: true; itinerary: Itinerary; issues: NormalizationIssue[] }
  | { ok: false; reason: "not-an-object" | "no-days" | "bad-shape"; message: string; issues: NormalizationIssue[] };

export type NormalizeMeta = {
  id: string;
  sourcePrompt: string;
  createdAt?: number;
};

function firstZodMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  }
  return "did not match the expected shape";
}

function normalizeStop(raw: unknown, dayIndex: number, stopIndex: number): Stop | null {
  const parsed = StopSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    ...parsed.data,
    id: `d${dayIndex}s${stopIndex}`,
  };
}

function normalizeDay(
  raw: unknown,
  dayIndex: number,
  issues: NormalizationIssue[],
): Day | null {
  const parsed = DaySchema.safeParse(raw);
  if (!parsed.success) {
    issues.push({
      path: `days[${dayIndex}]`,
      message: `Day ${dayIndex + 1} was dropped — ${firstZodMessage(parsed.error)}.`,
      severity: "dropped",
    });
    return null;
  }

  const rawStops = Array.isArray(parsed.data.stops) ? parsed.data.stops : [];
  const stops: Stop[] = [];
  let droppedStops = 0;

  for (const rawStop of rawStops) {
    const stop = normalizeStop(rawStop, dayIndex, stops.length);
    if (stop) stops.push(stop);
    else droppedStops++;
  }

  if (droppedStops > 0) {
    issues.push({
      path: `days[${dayIndex}].stops`,
      message: `${droppedStops} stop${droppedStops === 1 ? "" : "s"} on day ${
        dayIndex + 1
      } ${droppedStops === 1 ? "was" : "were"} unreadable and skipped.`,
      severity: "dropped",
    });
  }

  // A day with no salvageable stops has nothing to render or interact with.
  if (stops.length === 0) {
    issues.push({
      path: `days[${dayIndex}]`,
      message: `Day ${dayIndex + 1} had no usable stops and was removed.`,
      severity: "dropped",
    });
    return null;
  }

  const dayNumber =
    typeof parsed.data.dayNumber === "number" && parsed.data.dayNumber > 0
      ? Math.round(parsed.data.dayNumber)
      : dayIndex + 1;

  return {
    id: `d${dayIndex}`,
    dayNumber,
    title: parsed.data.title,
    summary: parsed.data.summary,
    tips: parsed.data.tips,
    stops,
  };
}

export function normalizeItinerary(raw: unknown, meta: NormalizeMeta): NormalizeResult {
  const issues: NormalizationIssue[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      reason: "not-an-object",
      message: "The model returned something that isn't an itinerary object.",
      issues,
    };
  }

  const parsed = ItinerarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "bad-shape",
      message: `The itinerary was missing required fields — ${firstZodMessage(parsed.error)}.`,
      issues,
    };
  }

  const rawDays = Array.isArray(parsed.data.days) ? parsed.data.days : [];
  const days: Day[] = [];

  for (let i = 0; i < rawDays.length; i++) {
    const day = normalizeDay(rawDays[i], i, issues);
    if (day) days.push(day);
  }

  if (days.length === 0) {
    return {
      ok: false,
      reason: "no-days",
      message: "The model didn't return any usable days for this trip.",
      issues,
    };
  }

  // Renumber so the UI never shows "Day 1, Day 3, Day 3" after drops.
  const renumbered = days.map((day, index) => ({ ...day, dayNumber: index + 1 }));

  return {
    ok: true,
    issues,
    itinerary: {
      id: meta.id,
      createdAt: meta.createdAt ?? Date.now(),
      sourcePrompt: meta.sourcePrompt,
      title: parsed.data.title,
      destination: parsed.data.destination,
      summary: parsed.data.summary,
      currency: parsed.data.currency,
      pace: parsed.data.pace,
      travelTips: parsed.data.travelTips,
      days: renumbered,
    },
  };
}

/**
 * Streaming variant: same salvage logic, but silent about issues and willing to
 * accept a skeleton (title only, no days yet) so the header can render before the
 * first day finishes arriving. Never throws.
 */
export function normalizePartialItinerary(
  raw: unknown,
  meta: NormalizeMeta,
): Itinerary | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const destination = typeof source.destination === "string" ? source.destination.trim() : "";

  // Wait until we at least know where we're going.
  if (!title && !destination) return null;

  const throwaway: NormalizationIssue[] = [];
  const rawDays = Array.isArray(source.days) ? source.days : [];
  const days: Day[] = [];

  for (let i = 0; i < rawDays.length; i++) {
    const day = normalizeDay(rawDays[i], i, throwaway);
    if (day) days.push(day);
  }

  const currency =
    typeof source.currency === "string" && /^[A-Za-z]{3}$/.test(source.currency.trim())
      ? source.currency.trim().toUpperCase()
      : "USD";

  return {
    id: meta.id,
    createdAt: meta.createdAt ?? Date.now(),
    sourcePrompt: meta.sourcePrompt,
    title: title || destination || "Planning your trip",
    destination: destination || title,
    summary: typeof source.summary === "string" ? source.summary.trim() || undefined : undefined,
    currency,
    pace: "balanced",
    travelTips: Array.isArray(source.travelTips)
      ? source.travelTips.filter((t): t is string => typeof t === "string")
      : [],
    days: days.map((day, index) => ({ ...day, dayNumber: index + 1 })),
  };
}
