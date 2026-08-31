"use client";

import { motion } from "framer-motion";
import { Loader2, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import type { StreamStage } from "@/lib/protocol";

const STAGE_COPY: Record<StreamStage, { label: string; Icon: typeof Sparkles }> = {
  generating: { label: "Mapping out your days…", Icon: Sparkles },
  validating: { label: "Checking the itinerary holds together…", Icon: ShieldCheck },
  // Surfaced deliberately: when the model returns broken JSON, the user sees the
  // recovery happening instead of an unexplained pause.
  repairing: { label: "The model's response was malformed — repairing it…", Icon: Wrench },
};

export function StageIndicator({ stage }: { stage: StreamStage | null }) {
  const { label, Icon } = STAGE_COPY[stage ?? "generating"];

  return (
    <div
      className="flex items-center gap-2.5 text-[13px] text-fg-muted"
      role="status"
      aria-live="polite"
    >
      <span className="relative grid size-5 place-items-center">
        <Loader2 size={16} strokeWidth={2.5} className="animate-spin text-[var(--primary)]" aria-hidden="true" />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2} aria-hidden="true" className="text-fg-faint" />
        {label}
      </span>
    </div>
  );
}

/**
 * Shown only until the first streamed content arrives. Its proportions mirror the
 * real day cards so the swap doesn't shift the layout (CLS).
 */
export default function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="shimmer h-[104px] rounded-[var(--radius-xl)] border border-border-subtle" />
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
          className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-5"
        >
          <div className="flex items-start gap-4">
            <div className="shimmer size-12 shrink-0 rounded-[var(--radius-md)]" />
            <div className="flex-1 space-y-2">
              <div className="shimmer h-4 w-1/3 rounded" />
              <div className="shimmer h-3 w-2/3 rounded" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-4">
                <div className="shimmer size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 rounded-[var(--radius-lg)] border border-border-subtle p-3">
                  <div className="shimmer h-3 w-20 rounded" />
                  <div className="shimmer h-4 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
