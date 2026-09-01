"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Wheels spin up and the carriage leans as it pulls away. */
  departing?: boolean;
};

/**
 * The composer, built as a railway carriage.
 *
 * The restraint that keeps this from turning into a cartoon: no rivets, no
 * smokestack, no faces. It's suggested with four thin brass lines — a roof
 * band, a waist rail, an underframe, and two bogies — over the same glass
 * surface every other panel uses. At a glance it reads as a carriage; up close
 * it's still a text field.
 *
 * The wheels are real: they rotate, and their period is bound to the same state
 * that drives the departure, so nothing can spin while the carriage stands
 * still.
 */

function Wheel({ size = 22, spinning }: { size?: number; spinning: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
      animate={reduceMotion || !spinning ? { rotate: 0 } : { rotate: 360 }}
      transition={
        reduceMotion || !spinning
          ? { duration: 0 }
          : { duration: 0.55, repeat: Infinity, ease: "linear" }
      }
    >
      {/* Tyre */}
      <circle cx="12" cy="12" r="10.5" fill="var(--bg-raised)" stroke="var(--primary)" strokeWidth="1.5" opacity="0.85" />
      {/* Spokes — what makes the rotation legible at all. */}
      {[0, 60, 120].map((angle) => (
        <line
          key={angle}
          x1="12"
          y1="3"
          x2="12"
          y2="21"
          stroke="var(--primary)"
          strokeWidth="1"
          opacity="0.5"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.6" fill="var(--primary)" opacity="0.9" />
    </motion.svg>
  );
}

function Bogie({ spinning }: { spinning: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-b-md bg-[var(--bg-raised)] px-1.5 pb-0.5 pt-1 shadow-[0_4px_10px_rgb(0_0_0/0.4)]">
      <Wheel spinning={spinning} />
      <Wheel spinning={spinning} />
    </div>
  );
}

export default function TrainCoach({ children, departing = false }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      {/* Roof: a shallow band, inset from the body so it reads as a separate
          plane rather than a border. */}
      <div
        aria-hidden="true"
        className="mx-6 h-2 rounded-t-[10px] border border-b-0 border-[color-mix(in_oklab,var(--primary)_38%,transparent)] bg-[color-mix(in_oklab,var(--primary)_10%,var(--bg-raised))] sm:mx-10"
      />

      {/* Body — the actual composer lives in here, in the window band. */}
      <div className="relative rounded-[var(--radius-xl)] border border-[color-mix(in_oklab,var(--primary)_26%,var(--border))]">
        {/* Waist rail: the horizontal line that runs under a carriage's windows. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-[38%] h-px bg-[color-mix(in_oklab,var(--primary)_18%,transparent)]"
        />
        {/* Couplings at each end. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[color-mix(in_oklab,var(--primary)_34%,transparent)] bg-[var(--bg-raised)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[color-mix(in_oklab,var(--primary)_34%,transparent)] bg-[var(--bg-raised)]"
        />
        {children}
      </div>

      {/* Underframe + running gear. */}
      <div
        aria-hidden="true"
        className="mx-8 h-1.5 rounded-b-md bg-[color-mix(in_oklab,var(--primary)_16%,var(--bg-raised))] sm:mx-12"
      />
      <div aria-hidden="true" className="absolute inset-x-0 -bottom-5 flex justify-between px-10 sm:px-16">
        <Bogie spinning={departing} />
        <Bogie spinning={departing} />
      </div>

      {/* Motion blur streaks that only exist while pulling away. */}
      {departing && !reduceMotion && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute inset-y-6 -left-24 w-24"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute h-px bg-gradient-to-r from-transparent to-[var(--primary)]"
              style={{ top: `${22 + i * 26}%`, left: 0, right: 0 }}
              initial={{ scaleX: 0, originX: 1 }}
              animate={{ scaleX: [0, 1, 0] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.09 }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
