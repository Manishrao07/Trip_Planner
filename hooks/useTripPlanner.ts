"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { makeError, type AppError, type ErrorKind } from "@/lib/errors";
import { normalizePartialItinerary, type NormalizationIssue } from "@/lib/normalize";
import { parseStreamingSnapshot } from "@/lib/partial-json";
import { createEventDecoder, type RequestMode, type StreamStage } from "@/lib/protocol";
import type { Day, Itinerary, Stop } from "@/lib/schema";

/**
 * The planner's single state machine: one request in flight at a time, one
 * reducer for both network transitions and user edits.
 *
 * ## Two independent guards against a stale response winning
 *
 * 1. **Sequence numbers.** Every request captures `seq`. Before any dispatch, it
 *    checks that it is still the newest request. A response from an older request
 *    is computed but discarded.
 * 2. **AbortController.** Starting a request aborts the previous one, so the old
 *    stream stops consuming tokens rather than merely being ignored.
 *
 * Belt and braces on purpose: (1) is what makes correctness airtight even if an
 * abort lands late or a microtask is already queued; (2) is what stops us paying
 * for work nobody will see.
 */

const CLIENT_TIMEOUT_MS = 90_000;
/** Re-parsing the whole buffer on every token is wasteful; 100ms is imperceptible. */
const PREVIEW_THROTTLE_MS = 100;

export type PlannerStatus = "idle" | "loading" | "success" | "error";

type PendingRequest = {
  mode: RequestMode;
  prompt: string;
  itinerary?: Itinerary;
};

type Removal =
  | { kind: "stop"; dayId: string; index: number; stop: Stop; label: string }
  | { kind: "day"; index: number; day: Day; label: string };

export type PlannerState = {
  status: PlannerStatus;
  /** Sub-phase while loading, so the UI can say what it's actually doing. */
  stage: StreamStage | null;
  /** The committed, server-validated itinerary. */
  itinerary: Itinerary | null;
  /** Optimistic render of a partially-received stream. Never committed. */
  preview: Itinerary | null;
  issues: NormalizationIssue[];
  repairs: string[];
  degraded: boolean;
  error: AppError | null;
  lastRequest: PendingRequest | null;
  lastRemoval: Removal | null;
  /** Bumped on every successful load so views can re-run entrance animations. */
  revision: number;
};

const initialState: PlannerState = {
  status: "idle",
  stage: null,
  itinerary: null,
  preview: null,
  issues: [],
  repairs: [],
  degraded: false,
  error: null,
  lastRequest: null,
  lastRemoval: null,
  revision: 0,
};

type Action =
  | { type: "request/start"; request: PendingRequest }
  | { type: "request/stage"; stage: StreamStage }
  | { type: "request/preview"; preview: Itinerary }
  | {
      type: "request/success";
      itinerary: Itinerary;
      issues: NormalizationIssue[];
      repairs: string[];
      degraded: boolean;
    }
  | { type: "request/error"; error: AppError }
  | { type: "request/cancel" }
  | { type: "notice/dismiss" }
  | { type: "session/load"; itinerary: Itinerary }
  | { type: "session/reset" }
  | { type: "stops/reorder"; dayId: string; stops: Stop[] }
  | { type: "stops/move"; dayId: string; stopId: string; direction: -1 | 1 }
  | { type: "stops/moveToDay"; fromDayId: string; stopId: string; toDayId: string }
  | { type: "stops/remove"; dayId: string; stopId: string }
  | { type: "days/remove"; dayId: string }
  | { type: "edit/undo" }
  | { type: "edit/clearUndo" };

function withDays(itinerary: Itinerary, days: Day[]): Itinerary {
  return { ...itinerary, days };
}

function renumber(days: Day[]): Day[] {
  return days.map((day, index) => ({ ...day, dayNumber: index + 1 }));
}

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case "request/start":
      return {
        ...state,
        status: "loading",
        stage: "generating",
        error: null,
        // A refinement keeps the current itinerary on screen; a fresh generation
        // clears it so the user isn't looking at a trip they've abandoned.
        itinerary: action.request.mode === "refine" ? state.itinerary : null,
        preview: null,
        issues: [],
        repairs: [],
        degraded: false,
        lastRequest: action.request,
        lastRemoval: null,
      };

    case "request/stage":
      return state.status === "loading" ? { ...state, stage: action.stage } : state;

    case "request/preview":
      return state.status === "loading" ? { ...state, preview: action.preview } : state;

    case "request/success":
      return {
        ...state,
        status: "success",
        stage: null,
        itinerary: action.itinerary,
        preview: null,
        issues: action.issues,
        repairs: action.repairs,
        degraded: action.degraded,
        error: null,
        revision: state.revision + 1,
      };

    case "request/error":
      return {
        ...state,
        status: "error",
        stage: null,
        preview: null,
        error: action.error,
      };

    case "request/cancel":
      return {
        ...state,
        status: state.itinerary ? "success" : "idle",
        stage: null,
        preview: null,
      };

    case "notice/dismiss":
      return { ...state, issues: [], repairs: [], degraded: false };

    case "session/load":
      return {
        ...initialState,
        status: "success",
        itinerary: action.itinerary,
        lastRequest: { mode: "generate", prompt: action.itinerary.sourcePrompt },
        revision: state.revision + 1,
      };

    case "session/reset":
      return { ...initialState, revision: state.revision + 1 };

    case "stops/reorder": {
      if (!state.itinerary) return state;
      const days = state.itinerary.days.map((day) =>
        day.id === action.dayId ? { ...day, stops: action.stops } : day,
      );
      return { ...state, itinerary: withDays(state.itinerary, days) };
    }

    case "stops/move": {
      if (!state.itinerary) return state;
      const days = state.itinerary.days.map((day) => {
        if (day.id !== action.dayId) return day;
        const from = day.stops.findIndex((s) => s.id === action.stopId);
        const to = from + action.direction;
        if (from === -1 || to < 0 || to >= day.stops.length) return day;
        const stops = [...day.stops];
        [stops[from], stops[to]] = [stops[to], stops[from]];
        return { ...day, stops };
      });
      return { ...state, itinerary: withDays(state.itinerary, days) };
    }

    case "stops/moveToDay": {
      if (!state.itinerary || action.fromDayId === action.toDayId) return state;
      const source = state.itinerary.days.find((d) => d.id === action.fromDayId);
      const stop = source?.stops.find((s) => s.id === action.stopId);
      if (!stop) return state;

      const days = state.itinerary.days.map((day) => {
        if (day.id === action.fromDayId) {
          return { ...day, stops: day.stops.filter((s) => s.id !== action.stopId) };
        }
        if (day.id === action.toDayId) {
          return { ...day, stops: [...day.stops, stop] };
        }
        return day;
      });
      return { ...state, itinerary: withDays(state.itinerary, days) };
    }

    case "stops/remove": {
      if (!state.itinerary) return state;
      const day = state.itinerary.days.find((d) => d.id === action.dayId);
      const index = day?.stops.findIndex((s) => s.id === action.stopId) ?? -1;
      if (!day || index === -1) return state;

      const stop = day.stops[index];
      const days = state.itinerary.days.map((d) =>
        d.id === action.dayId ? { ...d, stops: d.stops.filter((s) => s.id !== action.stopId) } : d,
      );

      return {
        ...state,
        itinerary: withDays(state.itinerary, days),
        lastRemoval: { kind: "stop", dayId: action.dayId, index, stop, label: stop.name },
      };
    }

    case "days/remove": {
      if (!state.itinerary) return state;
      const index = state.itinerary.days.findIndex((d) => d.id === action.dayId);
      if (index === -1) return state;

      const day = state.itinerary.days[index];
      const days = state.itinerary.days.filter((d) => d.id !== action.dayId);

      return {
        ...state,
        itinerary: withDays(state.itinerary, renumber(days)),
        lastRemoval: { kind: "day", index, day, label: day.title },
      };
    }

    case "edit/undo": {
      const removal = state.lastRemoval;
      if (!state.itinerary || !removal) return state;

      if (removal.kind === "stop") {
        const days = state.itinerary.days.map((day) => {
          if (day.id !== removal.dayId) return day;
          const stops = [...day.stops];
          stops.splice(Math.min(removal.index, stops.length), 0, removal.stop);
          return { ...day, stops };
        });
        return { ...state, itinerary: withDays(state.itinerary, days), lastRemoval: null };
      }

      const days = [...state.itinerary.days];
      days.splice(Math.min(removal.index, days.length), 0, removal.day);
      return {
        ...state,
        itinerary: withDays(state.itinerary, renumber(days)),
        lastRemoval: null,
      };
    }

    case "edit/clearUndo":
      return { ...state, lastRemoval: null };

    default:
      return state;
  }
}

function kindForStatus(status: number): ErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 504) return "timeout";
  if (status === 502 || status === 503) return "provider_error";
  if (status >= 500) return "provider_error";
  return "unknown";
}

export function useTripPlanner() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request if the component goes away mid-stream.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (request: PendingRequest) => {
    const seq = ++seqRef.current;
    /** Every dispatch is gated on still being the newest request. */
    const isCurrent = () => seqRef.current === seq;
    const commit = (action: Action) => {
      if (isCurrent()) dispatch(action);
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    dispatch({ type: "request/start", request });

    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: request.mode,
          prompt: request.prompt,
          itinerary: request.itinerary,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: AppError }
          | null;
        commit({
          type: "request/error",
          error: payload?.error ?? makeError(kindForStatus(response.status)),
        });
        return;
      }

      if (!response.body) {
        commit({ type: "request/error", error: makeError("network") });
        return;
      }

      const reader = response.body.getReader();
      const textDecoder = new TextDecoder();
      const events = createEventDecoder();

      let buffer = "";
      let lastPreviewAt = 0;
      let settled = false;

      const renderPreview = (force: boolean) => {
        const now = Date.now();
        if (!force && now - lastPreviewAt < PREVIEW_THROTTLE_MS) return;
        lastPreviewAt = now;

        const snapshot = parseStreamingSnapshot(buffer);
        if (!snapshot) return;
        const preview = normalizePartialItinerary(snapshot, {
          id: `preview-${seq}`,
          sourcePrompt: request.prompt,
        });
        if (preview) commit({ type: "request/preview", preview });
      };

      const handle = (event: ReturnType<typeof events.push>[number]) => {
        switch (event.type) {
          case "status":
            commit({ type: "request/stage", stage: event.stage });
            break;
          case "reset":
            // The server restarted generation; everything buffered is stale.
            buffer = "";
            lastPreviewAt = 0;
            commit({ type: "request/stage", stage: "generating" });
            break;
          case "delta":
            buffer += event.text;
            renderPreview(false);
            break;
          case "result":
            settled = true;
            commit({
              type: "request/success",
              itinerary: event.itinerary,
              issues: event.issues,
              repairs: event.repairs,
              degraded: event.degraded,
            });
            break;
          case "error":
            settled = true;
            commit({ type: "request/error", error: event.error });
            break;
          default:
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Bail out early rather than decoding bytes for a superseded request.
        if (!isCurrent()) {
          controller.abort();
          return;
        }
        for (const event of events.push(textDecoder.decode(value, { stream: true }))) {
          handle(event);
        }
      }
      for (const event of events.flush()) handle(event);

      // Stream ended without a terminal event — the connection dropped mid-flight.
      if (!settled) {
        commit({ type: "request/error", error: makeError("network") });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // Superseded by a newer request, or the user cancelled. Not an error.
        if (isCurrent()) dispatch({ type: "request/cancel" });
        return;
      }
      commit({ type: "request/error", error: makeError("network") });
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const generate = useCallback(
    (prompt: string) => run({ mode: "generate", prompt }),
    [run],
  );

  const refine = useCallback(
    (instruction: string) => {
      if (!state.itinerary) return Promise.resolve();
      return run({ mode: "refine", prompt: instruction, itinerary: state.itinerary });
    },
    [run, state.itinerary],
  );

  const retry = useCallback(() => {
    if (state.lastRequest) return run(state.lastRequest);
    return Promise.resolve();
  }, [run, state.lastRequest]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "request/cancel" });
  }, []);

  /** What to render right now: the committed trip, or the streaming preview. */
  const visible = useMemo(
    () => state.itinerary ?? state.preview,
    [state.itinerary, state.preview],
  );

  return { state, visible, dispatch, generate, refine, retry, cancel };
}

export type PlannerDispatch = ReturnType<typeof useTripPlanner>["dispatch"];
