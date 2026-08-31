"use client";

import { useCallback, useEffect, useState } from "react";

import type { Itinerary } from "@/lib/schema";

/**
 * Saved trips, persisted to localStorage.
 *
 * Storage is treated as hostile: it can be disabled (Safari private mode), full
 * (quota), or contain data written by an older version of this schema. Every
 * access is wrapped, and anything that doesn't look like an itinerary on read is
 * discarded rather than handed to the renderer.
 */

const STORAGE_KEY = "wanderly-sessions-v1";
const MAX_SESSIONS = 12;

export type SavedSession = {
  id: string;
  savedAt: number;
  itinerary: Itinerary;
};

function isUsableItinerary(value: unknown): value is Itinerary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Itinerary>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.destination === "string" &&
    Array.isArray(candidate.days) &&
    candidate.days.length > 0
  );
}

function read(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is SavedSession =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as SavedSession).id === "string" &&
          isUsableItinerary((entry as SavedSession).itinerary),
      )
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

function write(sessions: SavedSession[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    // Quota exceeded or storage blocked — the app keeps working, unsaved.
    return false;
  }
}

export function useSessions() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [ready, setReady] = useState(false);

  // Read after mount: localStorage doesn't exist during SSR, and touching it
  // during render would desync hydration.
  useEffect(() => {
    setSessions(read());
    setReady(true);
  }, []);

  const save = useCallback((itinerary: Itinerary) => {
    setSessions((current) => {
      const next: SavedSession[] = [
        { id: itinerary.id, savedAt: Date.now(), itinerary },
        ...current.filter((entry) => entry.id !== itinerary.id),
      ].slice(0, MAX_SESSIONS);
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((current) => {
      const next = current.filter((entry) => entry.id !== id);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSessions([]);
    write([]);
  }, []);

  const isSaved = useCallback(
    (id: string | undefined) => (id ? sessions.some((entry) => entry.id === id) : false),
    [sessions],
  );

  return { sessions, ready, save, remove, clear, isSaved };
}
