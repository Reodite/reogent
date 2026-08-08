// Formatting helpers: session-list grouping, currency, distances.

export type SessionGroup = "Today" | "Yesterday" | "This week" | "This month" | "Older";

export const SESSION_GROUP_ORDER: SessionGroup[] = ["Today", "Yesterday", "This week", "This month", "Older"];

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Bucket an ISO timestamp relative to `now` for the sidebar's section headers. */
export function sessionGroup(updatedAt: string, now: Date = new Date()): SessionGroup {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return "Older";
  const dayMs = 86_400_000;
  const today = startOfDay(now);
  const day = startOfDay(updated);
  if (day >= today) return "Today";
  if (day >= today - dayMs) return "Yesterday";
  if (day >= today - 6 * dayMs) return "This week";
  if (updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth()) return "This month";
  return "Older";
}

export function formatCad(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} min`;
}

/** Compact one-line summary of a tool call's input for the badge. */
export function summarizeToolInput(input: Record<string, unknown>, maxLength = 48): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    let str: string;
    try {
      str = typeof value === "string" ? `${key}="${value}"` : `${key}=${JSON.stringify(value)}`;
    } catch {
      str = `${key}=[complex]`;
    }
    parts.push(str);
  }
  const joined = parts.join(", ");
  if (joined.length <= maxLength) return joined;
  // Truncate to the last complete character before the limit
  const sliced = joined.slice(0, maxLength - 1);
  return `${sliced}…`;
}
