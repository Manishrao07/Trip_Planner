/**
 * Formatting helpers.
 *
 * All of these take model-supplied values, which means all of them can receive
 * nonsense. Every one degrades to something renderable rather than throwing —
 * a bad cost figure should cost you a dash, not the page.
 */

export function formatCurrency(amount: number | undefined, currency: string): string {
  if (amount === undefined || !Number.isFinite(amount)) return "—";
  if (amount === 0) return "Free";

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown/invalid ISO code — still show the number rather than nothing.
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

export function formatCompactCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: amount >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

export function formatDuration(minutes: number | undefined): string | null {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** "14:30" -> "2:30 PM" in the viewer's locale. */
export function formatTime(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return value;

  const date = new Date(2000, 0, 1, hours, minutes);
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return value;
  }
}

/** Rough part-of-day bucket, used for the timeline's colour temperature. */
export function timeOfDay(value: string | undefined): "morning" | "afternoon" | "evening" | null {
  if (!value) return null;
  const hours = Number.parseInt(value.slice(0, 2), 10);
  if (!Number.isFinite(hours)) return null;
  if (hours < 12) return "morning";
  if (hours < 17) return "afternoon";
  return "evening";
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
