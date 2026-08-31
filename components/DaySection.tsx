"use client";

import { AnimatePresence, Reorder, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Compass, Lightbulb, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { formatCurrency, pluralize } from "@/lib/format";
import type { Day, Stop } from "@/lib/schema";
import StopCard from "./StopCard";

type Props = {
  day: Day;
  days: Day[];
  destination: string;
  currency: string;
  index: number;
  onReorder: (stops: Stop[]) => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onMoveStopToDay: (stopId: string, targetDayId: string) => void;
  onRemoveStop: (stopId: string) => void;
  onRemoveDay: () => void;
};

export default function DaySection({
  day,
  days,
  destination,
  currency,
  index,
  onReorder,
  onMoveStop,
  onMoveStopToDay,
  onRemoveStop,
  onRemoveDay,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  const dayCost = useMemo(
    () => day.stops.reduce((sum, stop) => sum + (stop.estimatedCost ?? 0), 0),
    [day.stops],
  );

  return (
    <motion.section
      layout={reduceMotion ? false : "position"}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
      transition={{
        duration: 0.42,
        ease: [0.22, 1, 0.36, 1],
        // Days cascade in rather than appearing as a block.
        delay: reduceMotion ? 0 : Math.min(index * 0.06, 0.4),
      }}
      aria-labelledby={`${panelId}-heading`}
      className="sheen relative overflow-hidden rounded-[var(--radius-xl)] border border-border-subtle bg-surface shadow-[var(--shadow-card)] backdrop-blur-xl"
    >
      <header className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <div className="grid shrink-0 place-items-center rounded-[var(--radius-md)] border border-border-subtle bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-2.5 py-1.5 text-center">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
              Day
            </span>
            <span className="tabular text-lg font-semibold leading-none text-[var(--primary)]">
              {day.dayNumber}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              id={`${panelId}-heading`}
              className="text-[17px] font-semibold leading-snug text-fg [text-wrap:balance] sm:text-lg"
            >
              {day.title}
            </h3>
            {day.summary && (
              <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{day.summary}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-faint">
              <span className="tabular">{pluralize(day.stops.length, "stop")}</span>
              {dayCost > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular">{formatCurrency(dayCost, currency)} per person</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRemoveDay}
            aria-label={`Remove day ${day.dayNumber}: ${day.title}`}
            className="grid size-10 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-[var(--danger)]"
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-controls={panelId}
            aria-label={collapsed ? `Expand day ${day.dayNumber}` : `Collapse day ${day.dayNumber}`}
            className="grid size-10 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <motion.span
              animate={{ rotate: collapsed ? -90 : 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid place-items-center"
            >
              <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
            </motion.span>
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            id={panelId}
            key="stops"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: reduceMotion ? 0 : 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <Reorder.Group
                axis="y"
                values={day.stops}
                onReorder={onReorder}
                as="ul"
                className="space-y-3"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {day.stops.map((stop, stopIndex) => (
                    <StopCard
                      key={stop.id}
                      stop={stop}
                      dayId={day.id}
                      days={days}
                      destination={destination}
                      currency={currency}
                      index={stopIndex}
                      total={day.stops.length}
                      onMove={(direction) => onMoveStop(stop.id, direction)}
                      onMoveToDay={(targetDayId) => onMoveStopToDay(stop.id, targetDayId)}
                      onRemove={() => onRemoveStop(stop.id)}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>

              {day.stops.length === 0 && (
                <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-dashed border-border-strong px-4 py-5 text-[13px] text-fg-faint">
                  <Compass size={15} strokeWidth={2} aria-hidden="true" />
                  Every stop on this day was removed. Undo, or delete the day.
                </div>
              )}

              {day.tips.length > 0 && (
                <ul className="mt-4 space-y-1.5 rounded-[var(--radius-md)] border border-border-subtle bg-[color-mix(in_oklab,var(--warn)_6%,transparent)] p-3">
                  {day.tips.map((tip) => (
                    <li key={tip} className="flex gap-2 text-[12.5px] leading-relaxed text-fg-muted">
                      <Lightbulb
                        size={12}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="mt-[3px] shrink-0 text-[var(--warn)]"
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
