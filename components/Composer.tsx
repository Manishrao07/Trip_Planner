"use client";

import { motion } from "framer-motion";
import { ArrowUp, CornerDownLeft, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EXAMPLES = [
  "4 days in Lisbon in October — seafood, viewpoints, and no museums before 11am",
  "A week in Japan for a first-timer, mid budget, split between Tokyo and Kyoto",
  "Long weekend in Goa with friends, beaches by day and live music at night",
  "5 days in Iceland in winter, chasing the northern lights, renting a car",
];

const MAX_CHARS = 4000;

type Props = {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  autoFocus?: boolean;
  /**
   * Optional chrome wrapped around the input itself — used by the hero to seat
   * it in a train carriage. It receives only the field, never the example
   * chips: wrapping those too would put the carriage's wheels below them.
   */
  shell?: (field: ReactNode) => ReactNode;
};

export default function Composer({ onSubmit, onCancel, isLoading, autoFocus, shell }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the content, up to a cap — no inner scrollbar until it's long.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 3 && !isLoading;
  const remaining = MAX_CHARS - value.length;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a newline, Cmd/Ctrl+Enter always sends.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
      event.preventDefault();
      submit();
    }
  };

  const field = (
    <div
      className={`sheen relative overflow-hidden rounded-[var(--radius-xl)] transition-shadow duration-300 ${
        isLoading ? "shadow-[var(--shadow-float)]" : ""
      }`}
    >
        {/* Progress beam along the top edge while the model works. */}
        {isLoading && <div className="beam absolute inset-x-0 top-0 z-10 h-px" aria-hidden="true" />}

        <div className="glass-strong rounded-[var(--radius-xl)] p-2 shadow-[var(--shadow-card)]">
          <label htmlFor="trip-input" className="sr-only">
            Describe your trip
          </label>
          <textarea
            ref={textareaRef}
            id="trip-input"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isLoading}
            placeholder="Describe your trip — where, how long, what you're into, and roughly what you'd spend."
            aria-describedby="composer-hint"
            className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-[16px] leading-relaxed text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
          />

          <div className="flex items-end justify-between gap-3 px-2 pb-1">
            <p id="composer-hint" className="text-[12px] leading-tight text-fg-faint">
              {remaining < 300 ? (
                <span className="tabular">{remaining} characters left</span>
              ) : (
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <CornerDownLeft size={12} strokeWidth={2} aria-hidden="true" />
                  Enter to plan · Shift+Enter for a new line
                </span>
              )}
            </p>

            {isLoading ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-hover"
              >
                <Square size={13} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <motion.button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                whileTap={canSubmit ? { scale: 0.96 } : undefined}
                className="group inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-deep)] px-5 text-sm font-semibold text-[var(--ink)] shadow-lg shadow-[color-mix(in_oklab,var(--primary)_28%,transparent)] transition-all duration-200 disabled:pointer-events-none disabled:opacity-35 disabled:shadow-none"
              >
                Plan it
                <ArrowUp
                  size={15}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:-translate-y-0.5"
                />
              </motion.button>
            )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {shell ? shell(field) : field}

      <div className="mt-5">
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">
          Or start from one of these
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example, index) => (
            <motion.button
              key={example}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setValue(example);
                textareaRef.current?.focus();
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 + index * 0.05, duration: 0.3, ease: "easeOut" }}
              className="max-w-full truncate rounded-full border border-border-subtle bg-surface px-3.5 py-2 text-left text-[13px] text-fg-muted transition-colors duration-200 hover:border-border-strong hover:bg-surface-hover hover:text-fg disabled:opacity-40"
            >
              {example}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
