"use client";

import { Globe2, MapPin } from "lucide-react";
import { useMemo } from "react";

import { centroidOf, collectGeoStops } from "@/lib/globe";
import { pluralize } from "@/lib/format";
import type { Itinerary } from "@/lib/schema";
import Globe from "./Globe";

type Props = { itinerary: Itinerary };

/**
 * The globe, driven by the itinerary rather than decorating it.
 *
 * Everything here comes from the model's structured output: the camera focuses
 * on the destination's coordinates, a pin is dropped for every stop that has
 * them, and great-circle arcs connect consecutive stops in order.
 *
 * The panel is skipped entirely when the model returned no usable coordinates —
 * an empty globe spinning next to a real itinerary would imply the data is
 * there when it isn't.
 */
export default function TripGlobePanel({ itinerary }: Props) {
  const stops = useMemo(() => collectGeoStops(itinerary.days), [itinerary.days]);

  const focus = useMemo(() => {
    if (typeof itinerary.lat === "number" && typeof itinerary.lng === "number") {
      return { lat: itinerary.lat, lng: itinerary.lng };
    }
    // Fall back to the centre of the plotted stops.
    return centroidOf(stops);
  }, [itinerary.lat, itinerary.lng, stops]);

  if (!focus) return null;

  const plotted = stops.length;
  const total = itinerary.days.reduce((sum, day) => sum + day.stops.length, 0);

  return (
    <section
      aria-label={`Map of ${itinerary.destination}`}
      className="sheen relative isolate overflow-hidden rounded-[var(--radius-xl)] border border-border-subtle bg-[#04060d] shadow-[var(--shadow-card)]"
    >
      <div className="relative h-[220px] sm:h-[280px]">
        <Globe focus={focus} stops={stops} className="globe-layer--panel" />

        {/* Legibility scrim under the caption. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#04060d] to-transparent"
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/50">
              <Globe2 size={11} strokeWidth={2} aria-hidden="true" />
              On the map
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-white">
              {itinerary.destination}
            </p>
          </div>

          <p className="tabular shrink-0 text-[11.5px] text-white/60">
            <MapPin size={10} strokeWidth={2} aria-hidden="true" className="mr-1 inline" />
            {/* Say so plainly when the model only geocoded some of the stops. */}
            {plotted === total
              ? pluralize(plotted, "stop")
              : `${plotted} of ${total} stops located`}
          </p>
        </div>
      </div>
    </section>
  );
}
