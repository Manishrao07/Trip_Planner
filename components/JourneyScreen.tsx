"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Square, TrainFront } from "lucide-react";

import { centroidOf, collectGeoStops } from "@/lib/globe";
import type { StreamStage } from "@/lib/protocol";
import type { Itinerary } from "@/lib/schema";
import Globe from "./globe/Globe";

type Props = {
  stage: StreamStage | null;
  /** The optimistic parse of whatever has streamed in so far. */
  preview: Itinerary | null;
  prompt: string;
  onCancel: () => void;
};

const STAGE_COPY: Record<StreamStage, string> = {
  generating: "Plotting the route",
  validating: "Checking the connections",
  // Surfaced deliberately rather than hidden behind a generic spinner.
  repairing: "The line came back garbled — repairing",
};

/**
 * The journey: the loading state as a place rather than a spinner.
 *
 * It earns its screen by showing real progress, not theatre. The globe focuses
 * the moment coordinates arrive, and each day appears on the departure board as
 * it finishes streaming — so the wait is legible, and a slow response looks
 * slow rather than broken.
 */
export default function JourneyScreen({ stage, preview, prompt, onCancel }: Props) {
  const stops = preview ? collectGeoStops(preview.days) : [];
  const focus =
    preview && typeof preview.lat === "number" && typeof preview.lng === "number"
      ? { lat: preview.lat, lng: preview.lng }
      : centroidOf(stops);

  const destination = preview?.destination;

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* The train runs its circuit while we wait. */}
      <Globe
        focus={focus}
        stops={stops}
        journeying
        className="globe-layer globe-layer--journey"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em] text-fg-faint"
        >
          <TrainFront size={13} strokeWidth={1.75} aria-hidden="true" />
          En route
        </motion.p>

        {/* Destination lands as soon as the model names it — usually seconds
            before the first day is finished. */}
        <div className="mt-4 min-h-[4.5rem] sm:min-h-[6rem]">
          <AnimatePresence mode="wait">
            <motion.h2
              key={destination ?? "pending"}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="hero-display text-[clamp(2rem,7vw,3.6rem)] text-fg"
            >
              {destination ?? (
                <span className="text-fg-faint">Finding your destination…</span>
              )}
            </motion.h2>
          </AnimatePresence>
        </div>

        <p className="mt-1 line-clamp-2 max-w-md text-[13px] leading-relaxed text-fg-faint">
          {prompt}
        </p>

        {/* Departure board — days arrive here one at a time as they stream. */}
        <div className="mt-9 w-full max-w-md">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
                Itinerary
              </span>
              <span
                className="tabular text-[10px] uppercase tracking-[0.18em] text-[var(--primary)]"
                role="status"
                aria-live="polite"
              >
                {preview?.days.length
                  ? `${preview.days.length} day${preview.days.length === 1 ? "" : "s"} boarded`
                  : "Boarding"}
              </span>
            </div>

            <ul className="min-h-[7.5rem] divide-y divide-[color:var(--border)]">
              <AnimatePresence initial={false}>
                {preview?.days.map((day) => (
                  <motion.li
                    key={day.id}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <span className="tabular w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--primary)]">
                      D{day.dayNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                      {day.title}
                    </span>
                    <span className="tabular shrink-0 text-[11px] text-fg-faint">
                      {day.stops.length}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>

              {!preview?.days.length && (
                <li className="flex h-[7.5rem] items-center justify-center px-4">
                  <span className="flex gap-1.5" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18 }}
                        className="size-1.5 rounded-full bg-[var(--primary)]"
                      />
                    ))}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <p
          className="mt-5 text-[13px] text-fg-muted"
          role="status"
          aria-live="polite"
        >
          {STAGE_COPY[stage ?? "generating"]}
          <span aria-hidden="true">…</span>
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Square size={11} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
          Stop
        </button>
      </div>
    </div>
  );
}
