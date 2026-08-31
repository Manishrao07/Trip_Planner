"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Info, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { NormalizationIssue } from "@/lib/normalize";

type NoticeProps = {
  issues: NormalizationIssue[];
  repairs: string[];
  onDismiss: () => void;
};

/**
 * Honesty about a partial result.
 *
 * When the model returns something we had to repair or salvage, saying so beats
 * silently rendering a shorter trip. It's an inline notice rather than a modal
 * because the itinerary is still perfectly usable — this is information, not an
 * interruption.
 */
export function DegradedNotice({ issues, repairs, onDismiss }: NoticeProps) {
  const [expanded, setExpanded] = useState(false);
  const total = issues.length + repairs.length;
  if (total === 0) return null;

  const dropped = issues.filter((issue) => issue.severity === "dropped").length;
  const headline = dropped
    ? `Parts of the response were unreadable, so ${dropped === 1 ? "one item was" : `${dropped} items were`} left out.`
    : "The model's response needed repairing before it could be used.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--warn)_30%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] p-3.5"
    >
      <div className="flex items-start gap-3">
        <Info
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--warn)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-fg">{headline}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-1 text-[12px] font-medium text-fg-faint underline-offset-2 transition-colors hover:text-fg-muted hover:underline"
          >
            {expanded ? "Hide details" : `Show details (${total})`}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-fg-muted">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`} className="flex gap-2">
                  <span aria-hidden="true" className="text-fg-faint">
                    ·
                  </span>
                  {issue.message}
                </li>
              ))}
              {repairs.map((repair) => (
                <li key={repair} className="flex gap-2">
                  <span aria-hidden="true" className="text-fg-faint">
                    ·
                  </span>
                  Repair applied: {repair}.
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}

type UndoProps = {
  label: string | null;
  onUndo: () => void;
  onExpire: () => void;
};

/**
 * Undo for destructive edits. Auto-dismisses, never steals focus, and announces
 * politely so a screen reader user hears that something was removed.
 */
export function UndoToast({ label, onUndo, onExpire }: UndoProps) {
  useEffect(() => {
    if (!label) return;
    const timer = setTimeout(onExpire, 7000);
    return () => clearTimeout(timer);
  }, [label, onExpire]);

  return (
    <AnimatePresence>
      {label && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          role="status"
          aria-live="polite"
          className="no-print pointer-events-auto fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-full border border-border-strong bg-surface-solid px-4 py-2.5 shadow-[var(--shadow-float)] sm:bottom-28"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">
            Removed <span className="font-medium text-fg">{label}</span>
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-hover px-3 text-[13px] font-semibold text-fg transition-colors hover:bg-border-subtle"
          >
            <Undo2 size={13} strokeWidth={2.5} aria-hidden="true" />
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
