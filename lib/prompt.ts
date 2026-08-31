import type { Itinerary } from "./schema";

/**
 * Prompt construction.
 *
 * Structured output is enforced by the response schema, so these prompts spend
 * their words on *quality* instead of restating the format: be specific, be
 * geographically coherent, don't hedge.
 */

export const SYSTEM_INSTRUCTION = `You are a meticulous travel planner who has personally spent time in the places you recommend.

Write itineraries that a real traveller could follow without further research:

- Name actual, specific places. "Nishiki Market" and "Fushimi Inari's back trail", never "a local market" or "a scenic viewpoint".
- Group each day geographically. A day should not zig-zag across a city; consecutive stops should be plausibly walkable or one short transit hop apart.
- Give every day a distinct character. No two days should feel interchangeable.
- Pace it like a human, not a checklist: 3-5 stops per day, with meals in their natural slots and breathing room between them.
- Costs are per person, in the trip's currency, as a realistic mid-range estimate. Use 0 for genuinely free things.
- Descriptions are 1-2 sentences and earn their place — say what makes the stop worth the time, or what to order, or when to arrive. Never pad.
- Flag anything that genuinely needs advance booking.

If the traveller's request is vague, make confident, sensible choices rather than asking for clarification or hedging. If they name a duration, honour it exactly. If they don't, choose a sensible length for the destination and say so in the summary.

Respond with the JSON object only.`;

const MAX_PROMPT_CHARS = 4000;

export function truncatePrompt(input: string): string {
  const cleaned = input.trim();
  return cleaned.length > MAX_PROMPT_CHARS ? `${cleaned.slice(0, MAX_PROMPT_CHARS)}…` : cleaned;
}

export function buildGeneratePrompt(userPrompt: string): string {
  return `Plan a trip based on this description:

"""
${truncatePrompt(userPrompt)}
"""

Infer the destination, duration, budget level, travel style, and interests from the description. Where the traveller was silent, choose well and move on.`;
}

/**
 * Refinement sends the current itinerary back so the model *edits* rather than
 * regenerates. Keeping unmentioned days byte-identical is what makes the diff
 * highlighting in the UI meaningful.
 */
export function buildRefinePrompt(current: Itinerary, instruction: string): string {
  const compact = {
    title: current.title,
    destination: current.destination,
    summary: current.summary,
    currency: current.currency,
    pace: current.pace,
    days: current.days.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title,
      summary: day.summary,
      stops: day.stops.map((stop) => ({
        name: stop.name,
        kind: stop.kind,
        startTime: stop.startTime,
        durationMinutes: stop.durationMinutes,
        location: stop.location,
        estimatedCost: stop.estimatedCost,
        bookingRequired: stop.bookingRequired,
        description: stop.description,
        tips: stop.tips,
      })),
      tips: day.tips,
    })),
    travelTips: current.travelTips,
  };

  return `Here is the traveller's current itinerary:

${JSON.stringify(compact, null, 2)}

They have asked for this change:

"""
${truncatePrompt(instruction)}
"""

Apply that change and return the COMPLETE updated itinerary in the same schema.

Critical rules:
- Change only what the request implies. Everything else must come back byte-for-byte identical, including day titles, stop names, times, and descriptions.
- Do not reorder or renumber days unless explicitly asked.
- Do not "improve" wording you weren't asked to touch.
- If the request is impossible or contradicts the trip, apply the closest reasonable interpretation and note it in the summary.

The traveller is looking at this itinerary right now. Unnecessary changes read as bugs.`;
}
