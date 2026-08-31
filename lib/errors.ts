/**
 * One error vocabulary, shared by the route handler and the UI.
 *
 * "Something went wrong" is a non-answer. Every failure mode gets a specific
 * cause and a specific way out, so the user always knows whether to retry, edit
 * their prompt, wait, or fix their config.
 */

export type ErrorKind =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "network"
  | "blocked"
  | "invalid_input"
  | "input_too_long"
  | "empty_response"
  | "unparseable"
  | "bad_shape"
  | "no_days"
  | "unknown";

export type AppError = {
  kind: ErrorKind;
  /** Short headline shown in the error card. */
  title: string;
  /** What actually happened, in the user's terms. */
  message: string;
  /** The concrete next step. */
  hint: string;
  /** Whether re-running the identical request is worth offering. */
  retryable: boolean;
  /** Repairs that were attempted before giving up — shown in the details toggle. */
  repairs?: string[];
};

const CATALOG: Record<ErrorKind, Omit<AppError, "kind" | "repairs">> = {
  missing_key: {
    title: "No API key configured",
    message: "The server doesn't have a Gemini API key, so it can't reach the model.",
    hint: "Add GEMINI_API_KEY to .env.local and restart the dev server. See the README.",
    retryable: false,
  },
  invalid_key: {
    title: "API key rejected",
    message: "Gemini refused the key this server is using.",
    hint: "Check GEMINI_API_KEY in .env.local — it may be expired, revoked, or missing API access.",
    retryable: false,
  },
  rate_limited: {
    title: "Rate limit reached",
    message: "You've sent requests faster than the free tier allows.",
    hint: "Wait about a minute and try again. Shorter trips use fewer tokens.",
    retryable: true,
  },
  provider_error: {
    title: "The model is having a moment",
    message: "Gemini returned a server error. This is on their end, not yours.",
    hint: "Retrying usually works — these are typically brief.",
    retryable: true,
  },
  timeout: {
    title: "The request took too long",
    message: "The model didn't finish within the time budget.",
    hint: "Try again, or ask for a shorter trip — long itineraries take longer to generate.",
    retryable: true,
  },
  network: {
    title: "Couldn't reach the server",
    message: "The request never made it there, or the connection dropped mid-flight.",
    hint: "Check your connection and make sure the dev server is still running.",
    retryable: true,
  },
  blocked: {
    title: "The model declined this request",
    message: "Gemini's safety filters stopped the response before it finished.",
    hint: "Rephrase the trip description and try again.",
    retryable: false,
  },
  invalid_input: {
    title: "That request couldn't be read",
    message: "The trip description was missing, too short, or didn't arrive intact.",
    hint: "Write at least a few words about where you want to go and for how long.",
    retryable: false,
  },
  input_too_long: {
    title: "That description is very long",
    message: "The prompt exceeded what the model will accept in one request.",
    hint: "Trim it to the essentials — destination, length, interests, and budget are what matter.",
    retryable: false,
  },
  empty_response: {
    title: "The model returned nothing",
    message: "The request succeeded but the response body was empty.",
    hint: "This is usually transient. Retry, or add a little more detail to your description.",
    retryable: true,
  },
  unparseable: {
    title: "The model's response wasn't valid JSON",
    message:
      "We repaired what we could — fences, trailing commas, truncation — and it still wouldn't parse.",
    hint: "Retrying almost always fixes this; the model produces a fresh response each time.",
    retryable: true,
  },
  bad_shape: {
    title: "The itinerary was the wrong shape",
    message: "Valid JSON came back, but it was missing fields the planner needs.",
    hint: "Retry to get a fresh response, or describe the trip a little more concretely.",
    retryable: true,
  },
  no_days: {
    title: "No usable days came back",
    message: "The response parsed, but every day in it was empty or malformed.",
    hint: "Try naming a destination and a number of days explicitly, e.g. '4 days in Lisbon'.",
    retryable: true,
  },
  unknown: {
    title: "Something unexpected happened",
    message: "The request failed in a way the app doesn't have a specific handler for.",
    hint: "Retry once. If it keeps happening, check the dev server console for details.",
    retryable: true,
  },
};

export function makeError(kind: ErrorKind, overrides: Partial<AppError> = {}): AppError {
  return { kind, ...CATALOG[kind], ...overrides };
}

/** Map a provider/transport exception onto the taxonomy. */
export function classifyThrown(error: unknown): ErrorKind {
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";

  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const text = raw.toLowerCase();

  if (text.includes("api key not valid") || text.includes("api_key_invalid")) return "invalid_key";
  if (text.includes("permission_denied") || text.includes("403")) return "invalid_key";
  if (text.includes("unauthenticated") || text.includes("401")) return "invalid_key";
  if (text.includes("resource_exhausted") || text.includes("429") || text.includes("quota")) {
    return "rate_limited";
  }
  if (text.includes("deadline") || text.includes("timeout") || text.includes("etimedout")) {
    return "timeout";
  }
  if (text.includes("safety") || text.includes("blocked") || text.includes("recitation")) {
    return "blocked";
  }
  if (text.includes("too many tokens") || text.includes("token count") || text.includes("400 invalid_argument")) {
    return "input_too_long";
  }
  if (text.includes("fetch failed") || text.includes("econnrefused") || text.includes("enotfound")) {
    return "network";
  }
  if (/50\d/.test(text) || text.includes("internal") || text.includes("unavailable")) {
    return "provider_error";
  }

  return "unknown";
}

/** HTTP status to return for a given failure — used by the route handler. */
export function statusForKind(kind: ErrorKind): number {
  switch (kind) {
    case "missing_key":
    case "invalid_key":
      return 500;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "provider_error":
    case "network":
      return 502;
    case "blocked":
    case "invalid_input":
    case "input_too_long":
      return 400;
    default:
      return 422;
  }
}
