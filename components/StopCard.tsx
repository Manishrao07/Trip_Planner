"use client";

import { AnimatePresence, Reorder, motion, useDragControls, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Lightbulb,
  MapPin,
  Ticket,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";

import { formatCurrency, formatDuration, formatTime, mapsSearchUrl } from "@/lib/format";
import { kindMeta } from "@/lib/kinds";
import type { Day, Stop } from "@/lib/schema";

type Props = {
  stop: Stop;
  dayId: string;
  destination: string;
  currency: string;
  index: number;
  total: number;
  days: Day[];
  onMove: (direction: -1 | 1) => void;
  onMoveToDay: (targetDayId: string) => void;
  onRemove: () => void;
};

export default function StopCard({
  stop,
  dayId,
  destination,
  currency,
  index,
  total,
  days,
  onMove,
  onMoveToDay,
  onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  const meta = kindMeta(stop.kind);
  const { Icon } = meta;
  const accent = `var(${meta.colorVar})`;

  const time = formatTime(stop.startTime);
  const duration = formatDuration(stop.durationMinutes);
  const hasDetail =
    Boolean(stop.description) || stop.tips.length > 0 || Boolean(stop.location);

  return (
    <Reorder.Item
      value={stop}
      id={stop.id}
      // The handle owns dragging, so scrolling the page over a card never
      // accidentally picks it up — important on touch.
      dragListener={false}
      dragControls={dragControls}
      layout={reduceMotion ? undefined : "position"}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      whileDrag={{
        scale: 1.015,
        boxShadow: "var(--shadow-float)",
        zIndex: 20,
        cursor: "grabbing",
      }}
      className="relative list-none"
    >
      <div className="group relative flex gap-3 sm:gap-4">
        {/* Timeline rail */}
        <div className="relative flex w-6 shrink-0 flex-col items-center pt-4 sm:w-7">
          <span
            className="relative z-10 grid size-6 place-items-center rounded-full border sm:size-7"
            style={{
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
              background: `color-mix(in oklab, ${accent} 14%, var(--bg-raised))`,
              color: accent,
            }}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
          </span>
          {index < total - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-10 bottom-[-14px] w-px sm:top-11"
              style={{
                background: `linear-gradient(to bottom, color-mix(in oklab, ${accent} 32%, transparent), transparent)`,
              }}
            />
          )}
        </div>

        {/* Card */}
        <div className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-border-subtle bg-surface transition-colors duration-200 hover:border-border-strong">
          <div className="flex items-start gap-2 p-3 sm:p-3.5">
            <button
              type="button"
              aria-label={`Reorder ${stop.name}`}
              onPointerDown={(event) => dragControls.start(event)}
              className="grabbable -ml-1 mt-0.5 hidden size-8 shrink-0 place-items-center rounded-md text-fg-faint opacity-0 transition-opacity duration-200 hover:text-fg-muted group-hover:opacity-100 focus-visible:opacity-100 sm:grid"
            >
              <GripVertical size={15} strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={hasDetail ? panelId : undefined}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="tabular text-[11px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: accent }}
                >
                  {time ?? meta.label}
                </span>
                {time && (
                  <span className="text-[11px] uppercase tracking-[0.1em] text-fg-faint">
                    {meta.label}
                  </span>
                )}
                {duration && (
                  <span className="tabular inline-flex items-center gap-1 text-[11px] text-fg-faint">
                    <Clock size={10} strokeWidth={2} aria-hidden="true" />
                    {duration}
                  </span>
                )}
                {stop.bookingRequired && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--warn)]">
                    <Ticket size={10} strokeWidth={2.5} aria-hidden="true" />
                    Book ahead
                  </span>
                )}
              </div>

              <h4 className="mt-1 text-[15px] font-semibold leading-snug text-fg [overflow-wrap:anywhere]">
                {stop.name}
              </h4>

              {stop.location && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-fg-muted [overflow-wrap:anywhere]">
                  <MapPin size={11} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                  {stop.location}
                </p>
              )}
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <span className="tabular hidden text-[13px] font-medium text-fg-muted sm:block">
                {formatCurrency(stop.estimatedCost, currency)}
              </span>
              {hasDetail && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  aria-label={expanded ? `Collapse ${stop.name}` : `Expand ${stop.name}`}
                  className="grid size-11 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg sm:size-9"
                >
                  <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="grid place-items-center"
                  >
                    <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
                  </motion.span>
                </button>
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                id={panelId}
                key="detail"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: reduceMotion ? 0 : 0.18 },
                }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border-t border-border-subtle px-3 py-3 sm:px-3.5">
                  {stop.description && (
                    <p className="text-[13.5px] leading-relaxed text-fg-muted">
                      {stop.description}
                    </p>
                  )}

                  {stop.tips.length > 0 && (
                    <ul className="space-y-1.5">
                      {stop.tips.map((tip) => (
                        <li
                          key={tip}
                          className="flex gap-2 text-[12.5px] leading-relaxed text-fg-muted"
                        >
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

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="tabular mr-auto text-[13px] font-medium text-fg-muted sm:hidden">
                      {formatCurrency(stop.estimatedCost, currency)}
                    </span>

                    <a
                      href={mapsSearchUrl(`${stop.name} ${stop.location ?? destination}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <MapPin size={12} strokeWidth={2} aria-hidden="true" />
                      Map
                    </a>

                    {/* Keyboard/pointer equivalents for the drag handle — WCAG 2.2
                        requires every drag action to have a single-pointer path. */}
                    <button
                      type="button"
                      onClick={() => onMove(-1)}
                      disabled={index === 0}
                      aria-label={`Move ${stop.name} earlier`}
                      className="grid size-9 place-items-center rounded-lg border border-border-subtle text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ChevronUp size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(1)}
                      disabled={index === total - 1}
                      aria-label={`Move ${stop.name} later`}
                      className="grid size-9 place-items-center rounded-lg border border-border-subtle text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                    </button>

                    {days.length > 1 && (
                      <>
                        <label htmlFor={`${panelId}-move`} className="sr-only">
                          Move {stop.name} to another day
                        </label>
                        <select
                          id={`${panelId}-move`}
                          value=""
                          onChange={(event) => {
                            if (event.target.value) onMoveToDay(event.target.value);
                          }}
                          className="h-9 rounded-lg border border-border-subtle bg-surface-solid px-2 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg"
                        >
                          <option value="">Move to…</option>
                          {days
                            .filter((day) => day.id !== dayId)
                            .map((day) => (
                              <option key={day.id} value={day.id}>
                                Day {day.dayNumber}
                              </option>
                            ))}
                        </select>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={onRemove}
                      aria-label={`Remove ${stop.name}`}
                      className="grid size-9 place-items-center rounded-lg border border-border-subtle text-fg-faint transition-colors hover:border-[color-mix(in_oklab,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Reorder.Item>
  );
}
