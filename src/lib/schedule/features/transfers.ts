import type { DayCode, MeetingPattern, Section } from "../types";
import { DAY_ORDER } from "../types";

/** Gaps longer than this never need a route check; no UBC walk takes longer. */
export const MAX_TRANSFER_GAP = 30;

/** Back-to-back meetings in different buildings within the same week. */
export interface Transfer {
  day: DayCode;
  from: { section: Section; pattern: MeetingPattern };
  to: { section: Section; pattern: MeetingPattern };
  gapMin: number;
}

function datesOverlap(a: Section, b: Section): boolean {
  if (!a.termStart || !a.termEnd || !b.termStart || !b.termEnd) return true;
  return a.termStart <= b.termEnd && b.termStart <= a.termEnd;
}

/**
 * Lists consecutive meetings on the same day that change buildings with a gap
 * of at most `maxGap` minutes. Skips meetings without a building code,
 * overlapping meetings, and pairs whose sections run in different terms.
 */
export function buildingTransfers(sections: Section[], maxGap = MAX_TRANSFER_GAP): Transfer[] {
  const transfers: Transfer[] = [];
  for (const day of DAY_ORDER) {
    const meetings = sections
      .flatMap((section) =>
        section.meetings.filter((p) => p.days.includes(day) && p.buildingCode).map((pattern) => ({ section, pattern })),
      )
      .sort((a, b) => a.pattern.startMin - b.pattern.startMin);
    for (let i = 1; i < meetings.length; i++) {
      for (let j = i - 1; j >= 0; j--) {
        const from = meetings[j];
        const to = meetings[i];
        if (!datesOverlap(from.section, to.section)) continue;
        const gapMin = to.pattern.startMin - from.pattern.endMin;
        if (gapMin >= 0 && gapMin <= maxGap && from.pattern.buildingCode !== to.pattern.buildingCode) {
          transfers.push({ day, from, to, gapMin });
        }
        break;
      }
    }
  }
  return transfers;
}
