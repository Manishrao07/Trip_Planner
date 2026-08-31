"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookmarkCheck, BookmarkPlus, Compass, Lightbulb, Printer } from "lucide-react";
import { useCallback, useRef } from "react";

import type { PlannerDispatch } from "@/hooks/useTripPlanner";
import type { Itinerary } from "@/lib/schema";
import DayRail from "./DayRail";
import DaySection from "./DaySection";
import TripStats from "./TripStats";

type Props = {
  itinerary: Itinerary;
  dispatch: PlannerDispatch;
  onSave: () => void;
  isSaved: boolean;
  /** True while a stream is still filling this in — edits stay disabled. */
  isPreview: boolean;
};

export default function ItineraryView({
  itinerary,
  dispatch,
  onSave,
  isSaved,
  isPreview,
}: Props) {
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerDay = useCallback((dayId: string, node: HTMLDivElement | null) => {
    if (node) dayRefs.current.set(dayId, node);
    else dayRefs.current.delete(dayId);
  }, []);

  const scrollToDay = useCallback((dayId: string) => {
    dayRefs.current.get(dayId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-5">
      {/* --- Trip header ---------------------------------------------------- */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-fg-faint">
          <Compass size={12} strokeWidth={2} aria-hidden="true" />
          {itinerary.destination}
        </p>

        <h2 className="hero-display mt-2.5 text-[clamp(2.1rem,6.5vw,3.6rem)] text-fg">
          {itinerary.title}
        </h2>

        {itinerary.summary && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            {itinerary.summary}
          </p>
        )}

        {!isPreview && (
          <div className="no-print mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaved}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-60"
            >
              {isSaved ? (
                <>
                  <BookmarkCheck size={14} strokeWidth={2} aria-hidden="true" />
                  Saved
                </>
              ) : (
                <>
                  <BookmarkPlus size={14} strokeWidth={2} aria-hidden="true" />
                  Save trip
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Printer size={14} strokeWidth={2} aria-hidden="true" />
              Print
            </button>
          </div>
        )}
      </motion.header>

      <TripStats itinerary={itinerary} />

      {!isPreview && (
        <div className="no-print">
          <DayRail days={itinerary.days} currency={itinerary.currency} onSelect={scrollToDay} />
        </div>
      )}

      {/* --- Days ----------------------------------------------------------- */}
      <div className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {itinerary.days.map((day, index) => (
            <div key={day.id} ref={(node) => registerDay(day.id, node)} className="scroll-mt-24">
              <DaySection
                day={day}
                days={itinerary.days}
                destination={itinerary.destination}
                currency={itinerary.currency}
                index={index}
                onReorder={(stops) => dispatch({ type: "stops/reorder", dayId: day.id, stops })}
                onMoveStop={(stopId, direction) =>
                  dispatch({ type: "stops/move", dayId: day.id, stopId, direction })
                }
                onMoveStopToDay={(stopId, targetDayId) =>
                  dispatch({
                    type: "stops/moveToDay",
                    fromDayId: day.id,
                    stopId,
                    toDayId: targetDayId,
                  })
                }
                onRemoveStop={(stopId) =>
                  dispatch({ type: "stops/remove", dayId: day.id, stopId })
                }
                onRemoveDay={() => dispatch({ type: "days/remove", dayId: day.id })}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* --- Trip-level tips ------------------------------------------------- */}
      {itinerary.travelTips.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          aria-labelledby="trip-tips-heading"
          className="sheen relative overflow-hidden rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-5 backdrop-blur-xl"
        >
          <h3
            id="trip-tips-heading"
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint"
          >
            <Lightbulb size={12} strokeWidth={2} aria-hidden="true" />
            Before you go
          </h3>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {itinerary.travelTips.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg-muted">
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--primary)]"
                />
                {tip}
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </div>
  );
}
