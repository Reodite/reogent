import type { BlockInstance } from "../calendar/buildCalendar";
import type { DayCode } from "../types";

export interface FreeInterval {
  day: DayCode;
  startMin: number;
  endMin: number;
}

export const FREE_WINDOW_START = 8 * 60;
export const FREE_WINDOW_END = 20 * 60;
export const MIN_FREE_LENGTH = 30;

/** Finds intervals when all selected people are free within the window, excluding gaps below minLength. */
export function commonFreeIntervals(
  blocks: BlockInstance[],
  days: DayCode[],
  windowStart = FREE_WINDOW_START,
  windowEnd = FREE_WINDOW_END,
  minLength = MIN_FREE_LENGTH,
): FreeInterval[] {
  const free: FreeInterval[] = [];
  for (const day of days) {
    const busy = blocks.filter((b) => b.day === day).sort((a, b) => a.startMin - b.startMin);

    let cursor = windowStart;
    for (const interval of busy) {
      if (interval.startMin > cursor)
        free.push({ day, startMin: cursor, endMin: Math.min(interval.startMin, windowEnd) });
      cursor = Math.max(cursor, interval.endMin);
      if (cursor >= windowEnd) break;
    }
    if (cursor < windowEnd) free.push({ day, startMin: cursor, endMin: windowEnd });
  }
  return free.filter((f) => f.endMin - f.startMin >= minLength && f.endMin > f.startMin);
}
