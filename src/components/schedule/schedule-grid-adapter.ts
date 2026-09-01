import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import type { FreeInterval } from "@/src/lib/schedule/features/freeTime";
import { buildScheduleGrid, type ScheduleGridBand, type ScheduleGridModel } from "@/src/lib/schedule/grid";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { componentAbbrev, displayCode } from "./block-format";

/** Shared geometry plus the sharer blocks retained for detail lookup. */
export interface SharerGridAdapter {
  model: ScheduleGridModel;
  blocksById: Map<string, MergedBlock>;
}

/** Adapts sharer-owned blocks to the route-independent timetable contract. */
export function buildSharerGrid(blocks: MergedBlock[]): SharerGridAdapter {
  const blocksById = new Map(blocks.map((block) => [block.key, block]));
  const model = buildScheduleGrid(
    blocks.map((block) => {
      const room = block.rooms.join("/");
      const location = block.pattern.buildingCode ? `${block.pattern.buildingCode} ${room}`.trim() : room;

      return {
        id: block.key,
        courseKey: displayCode(block.section),
        code: displayCode(block.section),
        title: block.section.title,
        section: componentAbbrev(block.section.component),
        component: block.section.component,
        days: [block.day],
        startMin: block.startMin,
        endMin: block.endMin,
        meta: location || undefined,
      };
    }),
  );

  return { model, blocksById };
}

/** Adapts shared free-time intervals into renderer bands. */
export function buildSharerBands(intervals: FreeInterval[]): ScheduleGridBand[] {
  return intervals.map((interval) => ({
    id: `${interval.day}-${interval.startMin}-${interval.endMin}`,
    day: interval.day,
    startMin: interval.startMin,
    endMin: interval.endMin,
    label: `Everyone is free from ${minutesToFullLabel(interval.startMin)} to ${minutesToFullLabel(interval.endMin)}`,
  }));
}
