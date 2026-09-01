"use client";

import { courseColor } from "@/src/lib/schedule/calendar/colors";
import type { ScheduleGridBand, ScheduleGridModel, ScheduleGridOccurrence } from "@/src/lib/schedule/grid";
import type { DayCode } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import type { KeyboardEvent, ReactNode } from "react";

const PX_PER_MINUTE = 0.9;

/** Current-time marker rendered against one weekday column. */
export interface ScheduleGridNow {
  day: DayCode;
  minute: number;
  label: string;
}

/** Empty-week guidance shown without hiding the calendar grid. */
export interface ScheduleGridEmptyState {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ScheduleGridProps {
  model: ScheduleGridModel;
  activeDay: DayCode;
  onActiveDayChange: (day: DayCode) => void;
  onBlockActivate: (id: string) => void;
  bands?: ScheduleGridBand[];
  now?: ScheduleGridNow;
  empty?: ScheduleGridEmptyState;
  renderBlockFooter?: (block: ScheduleGridOccurrence) => ReactNode;
  ariaLabel?: string;
}

function ScheduleBlock({
  block,
  dayStartMin,
  onActivate,
  footer,
}: {
  block: ScheduleGridOccurrence;
  dayStartMin: number;
  onActivate: () => void;
  footer?: ReactNode;
}) {
  const color = courseColor(block.courseKey);
  const height = Math.max(28, (block.endMin - block.startMin) * PX_PER_MINUTE - 3);
  const compact = height < 58;
  const style = {
    top: (block.startMin - dayStartMin) * PX_PER_MINUTE,
    height,
    left: `calc(${(100 / block.cols) * block.col}% + 3px)`,
    width: `calc(${100 / block.cols}% - 6px)`,
    zIndex: block.col + 1,
    borderColor: color,
    background: `color-mix(in srgb, ${color} 15%, var(--surface))`,
  } as React.CSSProperties;
  const time = `${minutesToFullLabel(block.startMin)}–${minutesToFullLabel(block.endMin)}`;

  return (
    <button
      type="button"
      onClick={onActivate}
      title={`${block.code} ${block.section} · ${block.title} · ${time}${block.meta ? ` · ${block.meta}` : ""}`}
      aria-label={`${block.code} ${block.section}, ${block.title}, ${time}${block.meta ? `, ${block.meta}` : ""}${
        block.conflict ? ", conflicts with another section" : ""
      }`}
      className={`focus-visible:ring-primary/40 absolute flex min-w-0 flex-col overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-[filter,transform] select-none hover:brightness-[0.98] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.99] ${
        block.conflict ? "ring-error/70 ring-2" : ""
      }`}
      style={style}
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="text-on-surface truncate font-mono text-xs leading-tight font-medium">{block.code}</span>
        <span className="text-on-surface-variant shrink-0 font-mono text-[10px] leading-tight">{block.section}</span>
      </span>
      <span className="text-on-surface-variant mt-0.5 block w-full truncate font-mono text-[10px] leading-tight tabular-nums">
        {time}
      </span>
      {!compact && <span className="text-on-surface mt-1 line-clamp-2 text-[11px] leading-tight">{block.title}</span>}
      {!compact && block.meta && (
        <span className="text-muted mt-0.5 block w-full truncate font-mono text-[10px] leading-tight">
          {block.meta}
        </span>
      )}
      {footer ? <span className="mt-auto flex min-h-4 items-end pt-1">{footer}</span> : null}
    </button>
  );
}

/** Renders the shared planner and sharer week from route-independent geometry. */
export function ScheduleGrid({
  model,
  activeDay,
  onActiveDayChange,
  onBlockActivate,
  bands = [],
  now,
  empty,
  renderBlockFooter,
  ariaLabel = "Weekly schedule",
}: ScheduleGridProps) {
  const selectedDay = model.days.includes(activeDay) ? activeDay : model.days[0];
  const hours: number[] = [];
  for (let minute = model.dayStartMin; minute <= model.dayEndMin; minute += 60) hours.push(minute);
  const bodyHeight = (model.dayEndMin - model.dayStartMin) * PX_PER_MINUTE;
  const hasBlocks = [...model.occurrencesByDay.values()].some((items) => items.length > 0);
  const showNow =
    now && model.days.includes(now.day) && now.minute >= model.dayStartMin && now.minute <= model.dayEndMin;

  function moveDayTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % model.days.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + model.days.length) % model.days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = model.days.length - 1;
    else return;
    event.preventDefault();
    onActiveDayChange(model.days[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <section aria-label={ariaLabel} className="schedule-grid flex h-full min-h-0 flex-col">
      <div
        className="schedule-grid-day-tabs border-border-subtle bg-surface flex shrink-0 gap-1 border-b p-2"
        role="tablist"
        aria-label="Day"
      >
        {model.days.map((day, index) => (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={day === selectedDay}
            tabIndex={day === selectedDay ? 0 : -1}
            onClick={() => onActiveDayChange(day)}
            onKeyDown={(event) => moveDayTab(event, index)}
            className={`focus-visible:ring-primary/40 min-h-9 flex-1 rounded-lg px-2 text-xs font-medium focus-visible:ring-2 ${
              day === selectedDay ? "neu-inset bg-surface-container text-on-surface" : "text-on-surface-variant"
            }`}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-auto">
        <div
          className="schedule-grid-columns border-border-subtle bg-surface sticky top-0 z-30 grid border-b"
          style={{ ["--schedule-day-count" as string]: model.days.length }}
        >
          <div className="border-border-subtle bg-surface sticky left-0 z-20 border-r" aria-hidden="true" />
          {model.days.map((day) => (
            <div
              key={day}
              data-schedule-day
              data-active={day === selectedDay}
              className={`border-border-subtle bg-surface border-l px-2 py-2 text-center text-xs font-medium ${
                now?.day === day ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        <div
          className="schedule-grid-columns relative grid"
          style={{ ["--schedule-day-count" as string]: model.days.length, height: bodyHeight }}
        >
          <div className="border-border-subtle bg-surface-container-low/55 sticky left-0 z-20 border-r">
            {hours.map((minute) => (
              <span
                key={minute}
                className="text-muted absolute right-2 -translate-y-1/2 font-mono text-[10px] leading-none tabular-nums"
                style={{ top: (minute - model.dayStartMin) * PX_PER_MINUTE }}
              >
                {minute === model.dayStartMin ? "" : minutesToFullLabel(minute).replace(":00", "")}
              </span>
            ))}
          </div>
          {model.days.map((day) => (
            <div
              key={day}
              data-schedule-day
              data-active={day === selectedDay}
              className="border-border-subtle relative border-l"
            >
              {hours.map((minute) => (
                <div
                  key={minute}
                  className="border-border-subtle pointer-events-none absolute inset-x-0 border-t"
                  style={{ top: (minute - model.dayStartMin) * PX_PER_MINUTE }}
                />
              ))}
              {bands
                .filter((band) => band.day === day)
                .map((band) => (
                  <div
                    key={band.id}
                    title={band.label}
                    className="bg-accent-subtle/70 pointer-events-none absolute inset-x-1 rounded-md"
                    style={{
                      top: (band.startMin - model.dayStartMin) * PX_PER_MINUTE,
                      height: Math.max(2, (band.endMin - band.startMin) * PX_PER_MINUTE),
                    }}
                  />
                ))}
              {(model.occurrencesByDay.get(day) ?? []).map((block) => (
                <ScheduleBlock
                  key={block.occurrenceId}
                  block={block}
                  dayStartMin={model.dayStartMin}
                  onActivate={() => onBlockActivate(block.id)}
                  footer={renderBlockFooter?.(block)}
                />
              ))}
              {showNow && now.day === day ? (
                <div
                  className="bg-error pointer-events-none absolute inset-x-0 z-20 h-0.5"
                  style={{ top: (now.minute - model.dayStartMin) * PX_PER_MINUTE }}
                >
                  <span className="bg-error absolute -top-1 -left-1 size-2.5 rounded-full" />
                </div>
              ) : null}
            </div>
          ))}
          {!hasBlocks && empty ? (
            <div className="pointer-events-none absolute inset-x-4 top-20 z-20 flex justify-center sm:top-28">
              <div className="border-border-subtle bg-surface/95 pointer-events-auto max-w-sm rounded-xl border px-5 py-4 text-center">
                <h3 className="text-on-surface text-base font-medium">{empty.title}</h3>
                <p className="text-muted mt-1 text-sm leading-relaxed">{empty.description}</p>
                {empty.actionLabel && empty.onAction ? (
                  <button
                    type="button"
                    onClick={empty.onAction}
                    className="neu-primary-button bg-primary text-on-primary mt-4 min-h-10 rounded-xl px-4 text-sm font-medium"
                  >
                    {empty.actionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {showNow ? <p className="sr-only">{now.label}</p> : null}
    </section>
  );
}
