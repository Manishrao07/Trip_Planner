"use client";

import { motion } from "framer-motion";
import { Sparkles, Square, Wand2 } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  onRefine: (instruction: string) => void;
  onCancel: () => void;
  isLoading: boolean;
};

const SUGGESTIONS = [
  "Make day 2 cheaper",
  "Add more food stops",
  "Slow the pace down",
  "Swap the museums for outdoors",
];

/**
 * The refinement loop: follow-up instructions that *edit* the itinerary in place
 * rather than regenerating from scratch.
 *
 * The current itinerary is sent back to the model with the instruction, and the
 * prompt tells it to keep everything it wasn't asked to touch byte-identical —
 * so "make day 2 cheaper" doesn't quietly rewrite day 4.
 */
export default function RefineBar({ onRefine, onCancel, isLoading }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 3 && !isLoading;

  const submit = () => {
    if (!canSubmit) return;
    onRefine(trimmed);
    setValue("");
  };

  return (
    <div className="no-print sticky bottom-0 z-30 -mx-4 mt-8 px-4 pb-4 pt-8 sm:-mx-6 sm:px-6">
      {/* Fade so content scrolls away under the bar instead of colliding with it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_oklab,var(--bg)_82%,transparent)] to-transparent"
      />

      <div className="relative">
        <div className="mb-2.5 hidden flex-wrap gap-1.5 sm:flex">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setValue(suggestion);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[12px] text-fg-muted backdrop-blur transition-colors hover:border-border-strong hover:text-fg disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="glass-strong flex items-center gap-2 rounded-full p-1.5 pl-4 shadow-[var(--shadow-float)]"
        >
          <Wand2 size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-fg-faint" />
          <label htmlFor="refine-input" className="sr-only">
            Refine this itinerary
          </label>
          <input
            ref={inputRef}
            id="refine-input"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 400))}
            disabled={isLoading}
            placeholder="Change something — 'add a beach day', 'less walking'…"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border-strong px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-hover"
            >
              <Square size={12} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <motion.button
              type="submit"
              disabled={!canSubmit}
              whileTap={canSubmit ? { scale: 0.96 } : undefined}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-deep)] px-4 text-sm font-semibold text-[#04121f] transition-opacity disabled:pointer-events-none disabled:opacity-35"
            >
              <Sparkles size={14} strokeWidth={2.5} aria-hidden="true" />
              <span className="hidden sm:inline">Refine</span>
            </motion.button>
          )}
        </form>
      </div>
    </div>
  );
}
