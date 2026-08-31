"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Coins, Gauge, MapPinned } from "lucide-react";
import { useMemo } from "react";

import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { Itinerary } from "@/lib/schema";

type Props = { itinerary: Itinerary };

const PACE_COPY: Record<string, string> = {
  relaxed: "Relaxed",
  balanced: "Balanced",
  packed: "Packed",
};

export default function TripStats({ itinerary }: Props) {
  const reduceMotion = useReducedMotion();

  const { perDay, total, stopCount, peak } = useMemo(() => {
    const perDay = itinerary.days.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title,
      cost: day.stops.reduce((sum, stop) => sum + (stop.estimatedCost ?? 0), 0),
    }));
    return {
      perDay,
      total: perDay.reduce((sum, day) => sum + day.cost, 0),
      stopCount: itinerary.days.reduce((sum, day) => sum + day.stops.length, 0),
      peak: Math.max(1, ...perDay.map((day) => day.cost)),
    };
  }, [itinerary]);

  const stats = [
    { label: "Days", value: String(itinerary.days.length), Icon: CalendarDays },
    { label: "Stops", value: String(stopCount), Icon: MapPinned },
    { label: "Pace", value: PACE_COPY[itinerary.pace] ?? "Balanced", Icon: Gauge },
    {
      label: "Est. per person",
      value: total > 0 ? formatCompactCurrency(total, itinerary.currency) : "—",
      Icon: Coins,
    },
  ];

  const showChart = total > 0 && perDay.length > 1;

  return (
    <div className="sheen relative overflow-hidden rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-card)] backdrop-blur-xl sm:p-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint">
              <Icon size={12} strokeWidth={2} aria-hidden="true" />
              {label}
            </dt>
            <dd className="tabular mt-1 truncate text-lg font-semibold text-fg sm:text-xl">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {showChart && (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint">
            Spend by day
          </p>

          {/* The bars are decorative; the table below is the real content for
              screen readers, so the data never depends on reading a graphic. */}
          <div className="flex items-end gap-1.5 sm:gap-2" aria-hidden="true">
            {perDay.map((day, index) => (
              <div key={day.id} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="tabular text-[10px] font-medium text-fg-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {formatCompactCurrency(day.cost, itinerary.currency)}
                </span>
                <motion.div
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.1 + index * 0.04,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    height: `${Math.max(6, (day.cost / peak) * 56)}px`,
                    transformOrigin: "bottom",
                  }}
                  className="w-full rounded-t-[4px] bg-gradient-to-t from-[var(--primary)] to-[var(--primary-deep)] opacity-70 transition-opacity duration-200 group-hover:opacity-100"
                />
                <span className="tabular text-[10px] text-fg-faint">{day.dayNumber}</span>
              </div>
            ))}
          </div>

          <table className="sr-only">
            <caption>Estimated spend per person for each day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Title</th>
                <th scope="col">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {perDay.map((day) => (
                <tr key={day.id}>
                  <td>{day.dayNumber}</td>
                  <td>{day.title}</td>
                  <td>{formatCurrency(day.cost, itinerary.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
