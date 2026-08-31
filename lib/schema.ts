import { z } from "zod";

/**
 * The itinerary contract.
 *
 * This file is the single source of truth, and it is deliberately used three times:
 *   1. `geminiResponseSchema` — sent to the model so it *tries* to emit the right shape.
 *   2. `ItinerarySchema`      — validates what actually came back (the model can and does ignore #1).
 *   3. `Itinerary` (type)     — the shape the UI is allowed to assume.
 *
 * Rule of thumb applied throughout: be strict about the skeleton (a day must have
 * stops, a stop must have a name), lenient about the trimmings (a missing cost or
 * time is a rendering detail, not a reason to throw away a good itinerary).
 */

export const STOP_KINDS = [
  "sight",
  "food",
  "transport",
  "stay",
  "experience",
  "free",
] as const;

export type StopKind = (typeof STOP_KINDS)[number];

export const PACE_LEVELS = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACE_LEVELS)[number];

/** Trim, collapse whitespace, and treat empty strings as absent. */
const looseText = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string());

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => {
    const cleaned = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
    return cleaned.length > 0 ? cleaned : undefined;
  });

/**
 * Models are wildly inconsistent about numbers: 1200, "1200", "$1,200", "~1200",
 * "1200 INR", "free". Coerce what we reasonably can, drop what we can't, and never
 * let a bad number take down the stop that contains it.
 */
const looseNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v !== "string") return undefined;
    const normalized = v.toLowerCase().trim();
    if (normalized === "free" || normalized === "n/a" || normalized === "") return 0;
    const match = normalized.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!match) return undefined;
    const parsed = Number.parseFloat(match[0]);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
  });

/** Accepts "9:00", "09:00", "9am", "9:30 PM", "0900". Returns "HH:MM" or undefined. */
const looseTime = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (typeof v !== "string") return undefined;
    const raw = v.trim().toLowerCase();
    if (!raw) return undefined;

    const meridiem = /(am|pm)/.exec(raw)?.[1];
    const digits = raw.replace(/[^\d:]/g, "");
    if (!digits) return undefined;

    let hours: number;
    let minutes: number;

    if (digits.includes(":")) {
      const [h, m] = digits.split(":");
      hours = Number.parseInt(h, 10);
      minutes = Number.parseInt(m ?? "0", 10);
    } else if (digits.length >= 3) {
      hours = Number.parseInt(digits.slice(0, digits.length - 2), 10);
      minutes = Number.parseInt(digits.slice(-2), 10);
    } else {
      hours = Number.parseInt(digits, 10);
      minutes = 0;
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  });

/** Models return `null`, a bare string, or an array here. Normalise all three. */
const looseStringArray = z
  .union([z.array(z.unknown()), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const source = typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
    return source
      .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
      .filter((item) => item.length > 0)
      .slice(0, 6);
  });

/**
 * Latitude/longitude, if the model knows it.
 *
 * Coordinates are what let the globe be driven by real data rather than being
 * decoration — a stop without them simply isn't plotted. Out-of-range values are
 * dropped rather than clamped: a clamped coordinate is a confidently wrong pin
 * on the map, which is worse than no pin.
 */
const looseLatitude = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
    return Number.isFinite(n) && n >= -90 && n <= 90 ? n : undefined;
  });

const looseLongitude = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
    return Number.isFinite(n) && n >= -180 && n <= 180 ? n : undefined;
  });

const looseBoolean = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return ["true", "yes", "y", "1"].includes(v.toLowerCase().trim());
    return false;
  });

export const StopSchema = z.object({
  /** The model isn't asked for ids; we mint stable ones during normalisation. */
  id: z.string().optional(),
  name: looseText.pipe(z.string().min(1, "stop needs a name").max(160)),
  kind: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v): StopKind => {
      const candidate = typeof v === "string" ? v.toLowerCase().trim() : "";
      return (STOP_KINDS as readonly string[]).includes(candidate)
        ? (candidate as StopKind)
        : "sight";
    }),
  description: optionalText,
  location: optionalText,
  startTime: looseTime,
  durationMinutes: looseNumber.transform((n) =>
    n === undefined ? undefined : Math.min(24 * 60, Math.round(n)),
  ),
  estimatedCost: looseNumber,
  bookingRequired: looseBoolean,
  lat: looseLatitude,
  lng: looseLongitude,
  tips: looseStringArray,
});

export const DaySchema = z.object({
  id: z.string().optional(),
  dayNumber: looseNumber,
  title: looseText.pipe(z.string().min(1, "day needs a title").max(160)),
  summary: optionalText,
  /** A day with zero usable stops is dropped during normalisation, not rejected here. */
  stops: z.array(z.unknown()).optional(),
  tips: looseStringArray,
});

export const ItinerarySchema = z.object({
  title: looseText.pipe(z.string().min(1, "itinerary needs a title").max(160)),
  destination: looseText.pipe(z.string().min(1, "itinerary needs a destination").max(160)),
  summary: optionalText,
  currency: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const code = typeof v === "string" ? v.toUpperCase().replace(/[^A-Z]/g, "") : "";
      return code.length === 3 ? code : "USD";
    }),
  pace: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v): Pace => {
      const candidate = typeof v === "string" ? v.toLowerCase().trim() : "";
      return (PACE_LEVELS as readonly string[]).includes(candidate)
        ? (candidate as Pace)
        : "balanced";
    }),
  travelTips: looseStringArray,
  lat: looseLatitude,
  lng: looseLongitude,
  days: z.array(z.unknown()).optional(),
});

/** Post-normalisation types — what the UI actually renders. */
export type Stop = Omit<z.infer<typeof StopSchema>, "id"> & { id: string };
export type Day = Omit<z.infer<typeof DaySchema>, "id" | "stops" | "dayNumber"> & {
  id: string;
  dayNumber: number;
  stops: Stop[];
};
export type Itinerary = Omit<z.infer<typeof ItinerarySchema>, "days"> & {
  id: string;
  days: Day[];
  createdAt: number;
  /** The prompt that produced this, kept for refinement + session replay. */
  sourcePrompt: string;
};

/**
 * The schema handed to Gemini's structured-output mode.
 *
 * This is an OpenAPI subset, NOT the Zod schema — it's a strong hint, not a
 * guarantee. Everything it produces still goes through `ItinerarySchema` above.
 * Note `propertyOrdering`: Gemini emits keys in this order, which makes the
 * streaming partial-parse in lib/partial-json.ts far more useful (a stop's
 * `name` and `kind` land before its long `description`, so cards can render early).
 */
export const geminiResponseSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Evocative trip title, max 6 words." },
    destination: { type: "string", description: "Primary destination, e.g. 'Kyoto, Japan'." },
    summary: { type: "string", description: "Two sentences on the shape of the trip." },
    currency: { type: "string", description: "ISO 4217 code, e.g. USD, EUR, INR, JPY." },
    pace: { type: "string", enum: [...PACE_LEVELS] },
    lat: { type: "number", description: "Decimal latitude of the destination's centre." },
    lng: { type: "number", description: "Decimal longitude of the destination's centre." },
    travelTips: {
      type: "array",
      description: "3-5 practical, destination-specific tips.",
      items: { type: "string" },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayNumber: { type: "integer" },
          title: { type: "string", description: "Short day title, max 6 words." },
          summary: { type: "string", description: "One sentence on the day's arc." },
          stops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                kind: { type: "string", enum: [...STOP_KINDS] },
                startTime: { type: "string", description: "24-hour HH:MM." },
                durationMinutes: { type: "integer" },
                location: { type: "string", description: "Neighbourhood or address." },
                estimatedCost: {
                  type: "number",
                  description: "Per person, in the trip currency. 0 if free.",
                },
                bookingRequired: { type: "boolean" },
                lat: { type: "number", description: "Decimal latitude of this exact place." },
                lng: { type: "number", description: "Decimal longitude of this exact place." },
                description: { type: "string", description: "1-2 sentences, concrete and specific." },
                tips: { type: "array", items: { type: "string" } },
              },
              required: ["name", "kind", "description"],
              propertyOrdering: [
                "name",
                "kind",
                "startTime",
                "durationMinutes",
                "location",
                "estimatedCost",
                "bookingRequired",
                "lat",
                "lng",
                "description",
                "tips",
              ],
            },
          },
          tips: { type: "array", items: { type: "string" } },
        },
        required: ["dayNumber", "title", "stops"],
        propertyOrdering: ["dayNumber", "title", "summary", "stops", "tips"],
      },
    },
  },
  required: ["title", "destination", "days"],
  propertyOrdering: [
    "title",
    "destination",
    "summary",
    "currency",
    "pace",
    "lat",
    "lng",
    "days",
    "travelTips",
  ],
} as const;
