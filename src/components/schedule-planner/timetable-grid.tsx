"use client";

// Weekly timetable grid for the Course Schedule pane. Hour ruler on the
// left, one column per weekday; sections render as absolutely positioned
// blocks inside their day column. Conflicting sections split their column
// into side-by-side lanes and get the error ring.
import { formatTime, hourRange, conflictedIndices, laneLayout, visibleDays, parseTime } from "@/src/lib/schedule";
import { useMemo, useState } from "react";
import { entryId, type ScheduleEntry } from "./schedule-store";

const HOUR_PX = 56;

/** Deterministic accent per course so a course keeps its color between the
 *  sidebar list and the grid. Tints come from the design tokens only. */
const PALETTE = [
  "bg-accent-subtle text-primary",
  "bg-secondary-container/60 text-on-secondary-container",
  "bg-tertiary-container/70 text-on-tertiary-container",
  "bg-primary-container/20 text-on-primary-container",
] as const;

export function courseColor(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export interface PlacedBlock {
  entry: ScheduleEntry;
  day: string;
  lane: number;
  lanes: number;
  top: number;
  height: number;
  conflict: boolean;
}

interface TimetableGridProps {
  /** Entries already filtered to the active term. */
  entries: ScheduleEntry[];
  /** Grid container height is driven by this many hours, so export px math. */
  compact?: boolean;
}

/** Computes placements for one term's entries. Exported for tests. */
export function placeBlocks(
  entries: ScheduleEntry[],
  range: { startHour: number; endHour: number },
): { days: string[]; blocks: PlacedBlock[] } {
  const startMin = range.startHour * 60;
  const span = Math.max(60, (range.endHour - range.startHour) * 60);
  const withTimes = entries.map((e) => ({
    entry: e,
    start: parseTime(e.snapshot.start_time),
    end: parseTime(e.snapshot.end_time),
  }));
  const sched = withTimes.map((w) => ({
    code: w.entry.code,
    section: w.entry.section,
    title: w.entry.snapshot.title,
    term: w.entry.term,
    days: w.entry.snapshot.days,
    startMinutes: w.start,
    endMinutes: w.end,
  }));
  const conflicts = conflictedIndices(sched);
  const days = visibleDays(sched);
  const blocks: PlacedBlock[] = [];
  for (const day of days) {
    const dayIdx = sched
      .map((s, i) =>
        s.days.includes(day) && s.startMinutes >= 0 && s.endMinutes > s.startMinutes ? { index: i, ...s } : null,
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const lanes = laneLayout(dayIdx);
    for (const { index } of dayIdx) {
      const w = withTimes[index];
      const lane = lanes.get(index) ?? { lane: 0, lanes: 1 };
      blocks.push({
        entry: w.entry,
        day,
        lane: lane.lane,
        lanes: lane.lanes,
        top: ((Math.max(w.start, startMin) - startMin) / span) * 100,
        height: (Math.max(0, w.end - w.start) / span) * 100,
        conflict: conflicts.has(index),
      });
    }
  }
  return { days, blocks };
}

export function TimetableGrid({ entries }: TimetableGridProps) {
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const range = useMemo(
    () =>
      hourRange(
        entries.map((e) => ({
          code: e.code,
          section: e.section,
          title: e.snapshot.title,
          term: e.term,
          days: e.snapshot.days,
          startMinutes: parseTime(e.snapshot.start_time),
          endMinutes: parseTime(e.snapshot.end_time),
        })),
      ),
    [entries],
  );
  const { days, blocks } = useMemo(() => placeBlocks(entries, range), [entries, range]);
  const gridHeight = (range.endHour - range.startHour) * HOUR_PX;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        className="border-border-subtle bg-surface sticky top-0 z-30 grid grid-cols-[3rem_repeat(var(--day-count),minmax(0,1fr))] border-b"
        style={{ ["--day-count" as string]: days.length }}
      >
        <div className="border-border-subtle bg-surface sticky left-0 z-20 border-r" aria-hidden="true" />
        {days.map((d) => (
          <div
            key={d}
            className="border-border-subtle bg-surface text-muted border-l px-2 py-1.5 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <div
          className="grid grid-cols-[3rem_repeat(var(--day-count),minmax(0,1fr))]"
          style={{ ["--day-count" as string]: days.length, height: gridHeight }}
        >
          <div className="border-border-subtle bg-surface-container-low sticky left-0 z-20 border-r">
            {Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i).map((hour) => (
              <div
                key={hour}
                className="font-mono text-muted absolute right-1.5 -translate-y-1/2 text-xs"
                style={{ top: (hour - range.startHour) * HOUR_PX }}
              >
                {hour === range.startHour ? "" : formatTime(hour * 60)}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className="border-border-subtle relative border-l">
              {Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i).map((hour) => (
                <div
                  key={hour}
                  className="border-border-subtle absolute inset-x-0 border-t"
                  style={{ top: (hour - range.startHour) * HOUR_PX }}
                />
              ))}
              {blocks
                .filter((b) => b.day === day)
                .map((b) => {
                  const blockId = `${entryId(b.entry)}-${day}`;
                  const top = b.top !== undefined ? (b.top / 100) * gridHeight : 0;
                  const height = Math.max(22, (b.height / 100) * gridHeight);
                  const left = (b.lane / b.lanes) * 100;
                  const width = 100 / b.lanes;
                  const details = `${b.entry.snapshot.title} · ${b.entry.snapshot.start_time ?? "?"}–${
                    b.entry.snapshot.end_time ?? "?"
                  }${b.entry.snapshot.instructor ? ` · ${b.entry.snapshot.instructor}` : ""}`;
                  return (
                    <div key={blockId}>
                      <button
                        type="button"
                        aria-expanded={openBlock === blockId}
                        aria-label={`${b.entry.code} ${b.entry.section}, ${details}${
                          b.conflict ? ", conflicts with another section" : ""
                        }`}
                        title={details}
                        onClick={() => setOpenBlock((current) => (current === blockId ? null : blockId))}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setOpenBlock(null);
                        }}
                        className={`focus-visible:ring-primary absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-xs focus-visible:z-30 focus-visible:ring-2 ${courseColor(
                          b.entry.code,
                        )} ${b.conflict ? "ring-error/70 ring-2" : ""}`}
                        style={{ top, height, left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="block truncate font-mono font-medium leading-tight">
                          {b.entry.code} {b.entry.section}
                        </span>
                        <span className="block truncate font-mono text-xs opacity-80">
                          {b.entry.snapshot.start_time}–{b.entry.snapshot.end_time}
                        </span>
                      </button>
                      {openBlock === blockId && (
                        <div
                          role="status"
                          className="neu-raised bg-surface text-on-surface absolute z-40 w-52 rounded-lg p-2.5 text-xs"
                          style={{
                            top: top + height + 4,
                            ...(days.indexOf(day) >= days.length - 2 ? { right: 0 } : { left: 0 }),
                          }}
                        >
                          <p className="font-mono font-medium">
                            {b.entry.code} {b.entry.section}
                          </p>
                          <p className="text-on-surface-variant mt-1 leading-relaxed">{details}</p>
                          {b.conflict && (
                            <p className="text-error mt-1.5 font-medium">Conflicts with another selected section.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
