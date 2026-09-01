"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import { useCinematicScroll } from "@/hooks/useCinematicScroll";
import Composer from "./Composer";
import TrainCoach from "./TrainCoach";
import Globe from "./globe/Globe";
import { RidgeFar, RidgeMid, RidgeWall } from "./Ridges";

type Props = {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isLoading: boolean;
};

/**
 * Where the carriage goes when it departs: up and to the right, shrinking
 * toward the globe's limb so it reads as joining the orbit rather than simply
 * sliding off-screen.
 */
const DEPARTURE = {
  x: "48vw",
  y: "-14vh",
  scale: 0.22,
  rotate: -7,
  opacity: 0,
};

const TAGS = ["Day-by-day plans", "Reorder anything", "Refine in plain English"];

/**
 * The landing state: a sticky stage whose parallax layers part as you scroll.
 *
 * The one product rule this obeys — **the composer is usable at scroll position
 * zero**. The cinema plays around the tool, never in front of it. Everything
 * below the fold is reward for scrolling, not a toll gate.
 */
export default function CinematicHero({ onSubmit, onCancel, isLoading }: Props) {
  const rigRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [departing, setDeparting] = useState(false);

  useCinematicScroll(rigRef, stageRef);

  // Fire the request immediately and play the departure over the top of it, so
  // the animation costs no latency — by the time the carriage has left, the
  // model has already been working for most of a second.
  const handleSubmit = (prompt: string) => {
    setDeparting(true);
    onSubmit(prompt);
  };

  return (
    <div ref={rigRef} className="stage-rig">
      <div
        ref={stageRef}
        className="stage"
        style={
          {
            // Seed values so the first paint is correct before rAF runs.
            "--mx": 0,
            "--my": 0,
            "--split": 0,
            "--ridge-far-y": "0px",
            "--ridge-far-scale": 1.02,
            "--ridge-mid-y": "0px",
            "--ridge-mid-scale": 1.04,
            "--ridge-near-y": "0px",
            "--ridge-near-scale": 1.06,
            "--shade-top": 0,
            "--shade-mid": 0,
            "--shade-bottom": 0.45,
            "--hero-y": "0px",
            "--hero-scale": 1,
            "--hero-opacity": 1,
            "--scroll-cue-opacity": 1,
          } as React.CSSProperties
        }
      >
        {/* --- Scenery ------------------------------------------------------
            Depth order: globe furthest back, then distant ridges, then the
            canyon walls that frame the content and part on scroll. */}
        <Globe focus={null} stops={[]} className="globe-layer globe-layer--hero" />

        <div className="depth-layer" style={{ zIndex: 1 }} aria-hidden="true">
          <RidgeFar className="ridge ridge--far" />
        </div>
        <div className="depth-layer" style={{ zIndex: 2 }} aria-hidden="true">
          <RidgeMid className="ridge ridge--mid" />
        </div>
        <div className="depth-layer" style={{ zIndex: 3 }} aria-hidden="true">
          <RidgeWall side="left" className="ridge ridge--near-left" />
          <RidgeWall side="right" className="ridge ridge--near-right" />
        </div>
        <div className="stage-shade" aria-hidden="true" />

        {/* --- Foreground ------------------------------------------------- */}
        <div
          className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-5 pb-16 pt-24 sm:px-8"
          style={{
            transform: "translate3d(0, var(--hero-y), 0) scale(var(--hero-scale))",
            opacity: "var(--hero-opacity)",
            willChange: "transform, opacity",
          }}
        >
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-4 text-[11px] font-medium uppercase tracking-[0.28em] text-fg-faint"
          >
            AI trip planner
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="hero-display text-center text-[clamp(3rem,11vw,7rem)] text-fg"
          >
            Describe the trip.
            <br />
            <span className="aurora-text italic">Get the plan.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-lg text-center text-[15px] leading-relaxed text-fg-muted sm:text-base"
          >
            Write it however you'd say it out loud. You get a real itinerary — days
            you can open, stops you can drag, prune, and rewrite.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 w-full"
          >
            {/* The carriage. It sways at rest, then pulls away carrying the
                text the user just wrote. */}
            <motion.div
              animate={
                departing
                  ? DEPARTURE
                  : { x: 0, y: [0, -2.5, 0], scale: 1, rotate: 0, opacity: 1 }
              }
              transition={
                departing
                  ? { duration: 0.9, ease: [0.42, 0, 0.7, 0.4] } // slow start, accelerating away
                  : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <Composer
                onSubmit={handleSubmit}
                onCancel={onCancel}
                isLoading={isLoading}
                autoFocus
                // Only the field rides in the carriage; the example chips stay
                // on the platform, below the rail.
                shell={(field) => (
                  <>
                    <TrainCoach departing={departing}>{field}</TrainCoach>
                    <div
                      className="rail mt-6"
                      aria-hidden="true"
                      // The track quickens the moment a journey begins.
                      style={
                        {
                          "--rail-duration": departing ? "0.28s" : "1.9s",
                        } as React.CSSProperties
                      }
                    >
                      <div className="rail-sleepers" />
                    </div>
                  </>
                )}
              />
            </motion.div>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.42 }}
            className="mt-7 hidden flex-wrap justify-center gap-2 sm:flex"
          >
            {TAGS.map((tag) => (
              <li key={tag} className="pill">
                {tag}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Scroll cue — fades out the moment scrolling starts. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center"
          style={{ opacity: "var(--scroll-cue-opacity)" }}
        >
          <motion.span
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="text-fg-faint"
          >
            <ChevronDown size={18} strokeWidth={1.75} />
          </motion.span>
        </div>
      </div>
    </div>
  );
}
