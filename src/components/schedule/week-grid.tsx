"use client";

import type { CalendarModel, MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import type { FreeInterval } from "@/src/lib/schedule/features/freeTime";
import type { DayCode } from "@/src/lib/schedule/types";
import { dayCodeOf, minutesNow, minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { BlockCell } from "./block-cell";

const PX_PER_MIN = 1.06;

interface Props {
  model: CalendarModel;
  freeBands: FreeInterval[];
  now: Date;
  /** the 'now' line only renders while now falls inside the selected term */
  termIsLive: boolean;
  /** day shown on narrow screens; desktop shows all days */
  activeDay: DayCode;
  onBlockClick: (block: MergedBlock) => void;
}

/** Weekly grid: hour-gutter + one column per day, with free bands and a now line. */
export function WeekGrid({ model, freeBands, now, termIsLive, activeDay, onBlockClick }: Props) {
  const { days, dayStartMin, dayEndMin, blocksByDay } = model;
  const bodyHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;

  const today = dayCodeOf(now);
  const nowTop = (minutesNow(now) - dayStartMin) * PX_PER_MIN;
  const showNowLine = termIsLive && nowTop >= 0 && nowTop <= bodyHeight;

  const hours: number[] = [];
  for (let m = dayStartMin + 60; m < dayEndMin; m += 60) hours.push(m);

  return (
    <div className="flex flex-col">
      <div className="border-outline-variant/60 flex border-b pl-12">
        {days.map((day) => (
          <div
            key={day}
            className={`flex-1 py-1.5 text-center text-xs font-semibold tracking-wide uppercase ${
              day === activeDay ? "" : "hidden md:block"
            } ${day === today && termIsLive ? "text-primary" : "text-on-surface-variant"}`}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="relative flex" style={{ height: bodyHeight }}>
        <div className="relative w-12 shrink-0">
          {hours.map((m) => (
            <span
              key={m}
              className="text-muted absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
              style={{ top: (m - dayStartMin) * PX_PER_MIN }}
            >
              {minutesToFullLabel(m).replace(":00", "")}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className={`border-outline-variant/40 relative flex-1 border-l ${day === activeDay ? "" : "hidden md:block"}`}
          >
            {hours.map((m) => (
              <div
                key={m}
                className="border-outline-variant/30 absolute right-0 left-0 border-t"
                style={{ top: (m - dayStartMin) * PX_PER_MIN }}
              />
            ))}
            {freeBands
              .filter((f) => f.day === day)
              .map((f) => (
                <div
                  key={`${f.day}-${f.startMin}`}
                  className="bg-secondary/15 absolute right-0 left-0"
                  style={{
                    top: (f.startMin - dayStartMin) * PX_PER_MIN,
                    height: (f.endMin - f.startMin) * PX_PER_MIN,
                  }}
                  title={`Everyone's free ${minutesToFullLabel(f.startMin)}–${minutesToFullLabel(f.endMin)}`}
                />
              ))}
            {(blocksByDay.get(day) ?? []).map((block) => (
              <BlockCell
                key={block.key}
                block={block}
                top={(block.startMin - dayStartMin) * PX_PER_MIN}
                height={(block.endMin - block.startMin) * PX_PER_MIN}
                onClick={onBlockClick}
              />
            ))}
            {showNowLine && day === today && (
              <div
                className="bg-error pointer-events-none absolute right-0 left-0 z-10 h-0.5"
                style={{ top: nowTop }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
