"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SavedSession } from "@/hooks/useSessions";
import type { Itinerary } from "@/lib/schema";

type Props = {
  sessions: SavedSession[];
  onLoad: (itinerary: Itinerary) => void;
  onRemove: (id: string) => void;
};

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  try {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, size] of units) {
      if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit);
    }
    return formatter.format(0, "minute");
  } catch {
    return "recently";
  }
}

export default function SessionsMenu({ sessions, onLoad, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape — both are expected of a popover.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (sessions.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface px-3.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <Bookmark size={14} strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">Saved</span>
        <span className="tabular rounded-full bg-surface-hover px-1.5 text-[11px]">
          {sessions.length}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="glass-strong absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-float)]"
          >
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onLoad(session.itinerary);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="block truncate text-[13.5px] font-medium text-fg">
                      {session.itinerary.title}
                    </span>
                    <span className="tabular block truncate text-[11.5px] text-fg-faint">
                      {session.itinerary.days.length} days · {relativeTime(session.savedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(session.id)}
                    aria-label={`Delete saved trip ${session.itinerary.title}`}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
