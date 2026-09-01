import type { DayCode } from "./types";
import { DAY_ORDER } from "./types";

/** One logical section with every weekday occurrence needed by the renderer. */
export interface ScheduleGridItem {
  id: string;
  courseKey: string;
  code: string;
  title: string;
  section: string;
  component?: string;
  days: DayCode[];
  startMin: number;
  endMin: number;
  meta?: string;
  conflict?: boolean;
}

/** One positioned weekday occurrence derived from a logical section. */
export interface ScheduleGridOccurrence extends ScheduleGridItem {
  occurrenceId: string;
  day: DayCode;
  col: number;
  cols: number;
}

/** A labeled time range drawn beneath scheduled blocks. */
export interface ScheduleGridBand {
  id: string;
  day: DayCode;
  startMin: number;
  endMin: number;
  label: string;
}

/** Route-independent timetable geometry grouped by visible weekday. */
export interface ScheduleGridModel {
  days: DayCode[];
  dayStartMin: number;
  dayEndMin: number;
  occurrencesByDay: Map<DayCode, ScheduleGridOccurrence[]>;
  unscheduledCount: number;
}

function layoutDay(items: ScheduleGridOccurrence[]): ScheduleGridOccurrence[] {
  const sorted = items.toSorted((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result: ScheduleGridOccurrence[] = [];
  let cluster: ScheduleGridOccurrence[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const cols = Math.max(1, columnEnds.length);
    result.push(...cluster.map((item) => ({ ...item, cols })));
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) closeCluster();
    let col = columnEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[col] = item.endMin;
    }
    cluster.push({ ...item, col });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  closeCluster();
  return result;
}

/** Builds the route-independent geometry consumed by the shared weekly timetable. */
export function buildScheduleGrid(items: ScheduleGridItem[]): ScheduleGridModel {
  const scheduled = items.filter((item) => item.days.length > 0 && item.startMin >= 0 && item.endMin > item.startMin);
  const hasWeekend = scheduled.some((item) => item.days.includes("Sat") || item.days.includes("Sun"));
  const days = hasWeekend ? DAY_ORDER : DAY_ORDER.slice(0, 5);

  let dayStartMin = 8 * 60;
  let dayEndMin = 22 * 60;
  for (const item of scheduled) {
    dayStartMin = Math.min(dayStartMin, Math.floor(item.startMin / 60) * 60);
    dayEndMin = Math.max(dayEndMin, Math.ceil(item.endMin / 60) * 60);
  }

  const occurrencesByDay = new Map<DayCode, ScheduleGridOccurrence[]>();
  for (const day of days) {
    const occurrences = scheduled.flatMap((item) =>
      item.days.includes(day)
        ? [{ ...item, occurrenceId: `${item.id}:${day}:${item.startMin}`, day, col: 0, cols: 1 }]
        : [],
    );
    occurrencesByDay.set(day, layoutDay(occurrences));
  }

  return {
    days,
    dayStartMin,
    dayEndMin,
    occurrencesByDay,
    unscheduledCount: items.length - scheduled.length,
  };
}
