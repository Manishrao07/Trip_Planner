"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatCurrency, pluralize } from "@/lib/format";
import { kindMeta } from "@/lib/kinds";
import type { Day } from "@/lib/schema";
import Tilt3D from "./Tilt3D";

type Props = {
  days: Day[];
  currency: string;
  onSelect: (dayId: string) => void;
};

/**
 * Horizontal day overview — the reference's card slider, with its 640ms
 * cubic-bezier glide, active-card lift, and round nav buttons.
 *
 * One deliberate deviation: the reference loops infinitely by cloning the card
 * set three times and silently jumping between them. That's right for a
 * decorative carousel and wrong here — wrapping from Day 5 back to Day 1 would
 * imply the trip is a cycle. This rail clamps at both ends and disables the
 * button you can't use, which is also what makes it keyboard-honest.
 */
export default function DayRail({ days, currency, onSelect }: Props) {
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Card width + gap, measured rather than assumed — the card basis is a clamp().
  const measure = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || "0") || 0;
    setStep(first.offsetWidth + gap);
  }, []);

  useLayoutEffect(measure, [measure, days.length]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Clamp the active index if days get removed out from under us.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, days.length - 1)));
  }, [days.length]);

  const maxIndex = Math.max(0, days.length - 1);
  const go = (direction: -1 | 1) =>
    setActive((current) => Math.min(maxIndex, Math.max(0, current + direction)));

  if (days.length < 2) return null;

  return (
    <section aria-label="Day overview" className="relative">
      <div className="mb-3 flex items-end justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">
          Jump to a day
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="round-nav"
            onClick={() => go(-1)}
            disabled={active === 0}
            aria-label="Previous day"
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="round-nav"
            onClick={() => go(1)}
            disabled={active === maxIndex}
            aria-label="Next day"
          >
            <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="rail-viewport -mx-1 px-1 py-1">
        <ul
          ref={trackRef}
          className="rail-track"
          style={{ transform: `translate3d(${-step * active}px, 0, 0)` }}
        >
          {days.map((day, index) => {
            const cost = day.stops.reduce((sum, stop) => sum + (stop.estimatedCost ?? 0), 0);
            const { Icon } = kindMeta(day.stops[0]?.kind ?? "sight");

            return (
              <li key={day.id} className="contents">
                <Tilt3D className="rail-card-tilt">
                <button
                  type="button"
                  onClick={() => {
                    setActive(index);
                    onSelect(day.id);
                  }}
                  aria-current={index === active ? "true" : undefined}
                  className={`paper rail-card p-5 text-left ${index === active ? "is-active" : ""}`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)]/55">
                    Day {day.dayNumber}
                  </span>

                  <span
                    aria-hidden="true"
                    data-depth
                    style={{ "--depth": "34px" } as React.CSSProperties}
                    className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-[var(--ink)]/[0.07] text-[var(--ink)]"
                  >
                    <Icon size={19} strokeWidth={1.75} />
                  </span>

                  <h3
                    data-depth
                    style={{ "--depth": "22px" } as React.CSSProperties}
                    className="mt-9 line-clamp-2 text-[19px] font-semibold leading-tight text-[var(--ink)]"
                  >
                    {day.title}
                  </h3>

                  {day.summary && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-[var(--ink)]/65">
                      {day.summary}
                    </p>
                  )}

                  <p className="tabular mt-3 text-[12px] font-medium text-[var(--ink)]/55">
                    {pluralize(day.stops.length, "stop")}
                    {cost > 0 && ` · ${formatCurrency(cost, currency)}`}
                  </p>
                </button>
                </Tilt3D>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
