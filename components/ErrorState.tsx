"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, PenLine, RotateCw } from "lucide-react";
import { useState } from "react";

import type { AppError } from "@/lib/errors";

type Props = {
  error: AppError;
  onRetry: () => void;
  onEdit: () => void;
  isRetrying: boolean;
};

/**
 * Every failure lands here with a cause, a consequence, and a way out — the
 * retry button only appears when retrying could actually help, so it never
 * invites the user into a loop that can't succeed.
 */
export default function ErrorState({ error, onRetry, onEdit, isRetrying }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const hasDetails = Boolean(error.repairs?.length);

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="sheen relative overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_oklab,var(--danger)_28%,var(--border))] bg-surface p-5 shadow-[var(--shadow-card)] backdrop-blur-xl sm:p-6"
    >
      <div className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]">
          <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold text-fg">{error.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{error.message}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-faint">{error.hint}</p>

          {hasDetails && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-faint transition-colors hover:text-fg-muted"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}
                />
                What we tried
              </button>
              {showDetails && (
                <ul className="mt-2 space-y-1 rounded-[var(--radius-md)] border border-border-subtle bg-surface-hover p-3 text-[12px] text-fg-muted">
                  {error.repairs?.map((repair) => (
                    <li key={repair} className="flex gap-2">
                      <span aria-hidden="true" className="text-fg-faint">
                        ·
                      </span>
                      {repair}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {error.retryable && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-deep)] px-4 text-sm font-semibold text-[var(--ink)] transition-opacity disabled:opacity-50"
              >
                <RotateCw
                  size={14}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className={isRetrying ? "animate-spin" : ""}
                />
                {isRetrying ? "Retrying…" : "Try again"}
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-hover"
            >
              <PenLine size={14} strokeWidth={2} aria-hidden="true" />
              Edit description
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
