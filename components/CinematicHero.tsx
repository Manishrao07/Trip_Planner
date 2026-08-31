"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import { useCinematicScroll } from "@/hooks/useCinematicScroll";
import Composer from "./Composer";
import { RidgeFar, RidgeMid, RidgeWall } from "./Ridges";

type Props = {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isLoading: boolean;
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

  useCinematicScroll(rigRef, stageRef);

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
        {/* --- Scenery ---------------------------------------------------- */}
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
            <Composer onSubmit={onSubmit} onCancel={onCancel} isLoading={isLoading} autoFocus />
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
