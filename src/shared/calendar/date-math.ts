/** Calendar date-math helpers. All Date instances are interpreted in UTC to
 * keep the network-agnostic ISO-anchored dates that buildMonthGrid and
 * isSameDay operate on deterministic across server and client. */

/** Parses an ISO "YYYY-MM-DD" string into a UTC-midnight Date. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a Date back to the canonical "YYYY-MM-DD" ISO string. */
export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The first day of the month containing `d` (UTC midnight). */
export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** `d` advanced (or rewound) by `n` months, preserving the day-of-month when
 * the resulting month has fewer days. */
export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

/** True when both dates fall on the same calendar day (UTC). */
export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}

/** A 6×7 grid of dated cells for the month containing `d`, with leading and
 * trailing dates from adjacent months so the grid always spans from Sunday to
 * Saturday. */
export function buildMonthGrid(d: Date): (Date | null)[][] {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const firstDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const grid: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    week.push(new Date(Date.UTC(y, m, -i)));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(new Date(Date.UTC(y, m, day)));
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  let next = 1;
  while (week.length < 7) {
    week.push(new Date(Date.UTC(y, m + 1, next)));
    next++;
  }
  grid.push(week);
  return grid;
}

/** "September 2024" — the calendar header for the month containing `d`. */
export function formatMonthHeading(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2024-09" — a sortable YYYY-MM badge used for routing and cursor hashing. */
export function formatMonthBadge(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** "Monday, September 2, 2024" — long weekday plus long month plus day and
 * year, used for the popover detail tooltip. */
export function formatFullDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
