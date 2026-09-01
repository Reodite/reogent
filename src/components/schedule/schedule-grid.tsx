"use client";

import {
  DRAG_DROP_ANIMATION,
  DragOverlayFrame,
  useDragOverlayPhysics,
} from "@/src/components/dnd/drag-overlay-physics";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import {
  buildScheduleGrid,
  type ScheduleGridBand,
  type ScheduleGridItem,
  type ScheduleGridModel,
  type ScheduleGridOccurrence,
} from "@/src/lib/schedule/grid";
import type { DayCode } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableSyntheticListeners,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

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

/** One alternate catalog section exposed as a timetable drop target. */
export interface ScheduleGridDragOption {
  id: string;
  label: string;
  item: ScheduleGridItem;
}

/** Planner-owned section choices and mutation callback consumed by the shared drag mechanics. */
export interface ScheduleGridDragConfig {
  getOptions: (blockId: string) => ScheduleGridDragOption[];
  onDrop: (blockId: string, optionId: string) => void;
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
  drag?: ScheduleGridDragConfig;
}

function ScheduleBlock({
  block,
  dayStartMin,
  onActivate,
  footer,
  dimmed = false,
  listeners,
  overlayWidth,
  setNodeRef,
}: {
  block: ScheduleGridOccurrence;
  dayStartMin: number;
  onActivate: () => void;
  footer?: ReactNode;
  dimmed?: boolean;
  listeners?: DraggableSyntheticListeners;
  overlayWidth?: number;
  setNodeRef?: (node: HTMLElement | null) => void;
}) {
  const color = courseColor(block.courseKey);
  const height = Math.max(36, (block.endMin - block.startMin) * PX_PER_MINUTE - 3);
  const compact = height < 48;
  const showFooter = height >= 72;
  const overlay = overlayWidth !== undefined;
  const style = {
    top: overlay ? undefined : (block.startMin - dayStartMin) * PX_PER_MINUTE,
    height,
    left: overlay ? undefined : `calc(${(100 / block.cols) * block.col}% + 3px)`,
    width: overlay ? overlayWidth : `calc(${100 / block.cols}% - 6px)`,
    zIndex: block.col + 1,
    borderColor: color,
    background: `color-mix(in srgb, ${color} 15%, var(--surface))`,
  } as React.CSSProperties;
  const time = `${minutesToFullLabel(block.startMin)}–${minutesToFullLabel(block.endMin)}`;
  const section = block.section?.trim();
  const component = block.component?.trim();
  const identity = [block.code, section, component].filter(Boolean).join(" · ");
  const accessibleDetails = [block.title, time, block.meta, ...(block.accessibleDetails ?? [])].filter(Boolean);

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-schedule-block
      data-block-layout={compact ? "compact" : "tall"}
      tabIndex={overlay ? -1 : undefined}
      aria-hidden={overlay || undefined}
      onClick={overlay ? undefined : onActivate}
      {...listeners}
      title={`${identity} · ${accessibleDetails.join(" · ")}`}
      aria-label={`${identity}, ${accessibleDetails.join(", ")}${
        block.conflict ? ", conflicts with another section" : ""
      }`}
      className={`focus-visible:ring-primary/40 flex min-w-0 flex-col overflow-hidden rounded-lg border px-2 py-1 text-left transition-[filter,transform,opacity] select-none hover:brightness-[0.98] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.99] ${
        overlay ? "relative" : "absolute"
      } ${listeners ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""} ${dimmed ? "opacity-25" : ""} ${
        block.conflict ? "ring-error/70 ring-2" : ""
      }`}
      style={style}
    >
      {compact ? (
        <span className="flex min-w-0 items-baseline gap-1 truncate text-xs leading-4">
          <span className="text-on-surface truncate font-mono font-medium">{block.code}</span>
          {section ? <span className="text-on-surface-variant shrink-0 font-mono">· {section}</span> : null}
          {component ? <span className="text-on-surface-variant shrink-0">· {component}</span> : null}
        </span>
      ) : (
        <>
          <span className="text-on-surface text-body-sm block truncate font-mono leading-4 font-medium">
            {block.code}
          </span>
          {section || component ? (
            <span className="text-on-surface-variant mt-1 flex min-w-0 items-baseline gap-1 truncate text-xs leading-4">
              {section ? <span className="shrink-0 font-mono">{section}</span> : null}
              {section && component ? <span aria-hidden>·</span> : null}
              {component ? <span className="truncate">{component}</span> : null}
            </span>
          ) : null}
        </>
      )}
      {footer && showFooter ? <span className="mt-auto flex min-h-4 items-end pt-1">{footer}</span> : null}
    </button>
  );
}

function DraggableScheduleBlock({
  block,
  activeBlockId,
  dayStartMin,
  footer,
  onActivate,
}: {
  block: ScheduleGridOccurrence;
  activeBlockId: string | null;
  dayStartMin: number;
  footer?: ReactNode;
  onActivate: () => void;
}) {
  const { listeners, setNodeRef } = useDraggable({
    id: `schedule-block:${block.occurrenceId}`,
    data: { blockId: block.id },
  });
  return (
    <ScheduleBlock
      block={block}
      dayStartMin={dayStartMin}
      onActivate={onActivate}
      footer={footer}
      listeners={listeners}
      setNodeRef={setNodeRef}
      dimmed={activeBlockId === block.id}
    />
  );
}

function ScheduleDropSlot({
  block,
  dayStartMin,
  label,
}: {
  block: ScheduleGridOccurrence;
  dayStartMin: number;
  label: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `schedule-slot:${block.occurrenceId}`,
    data: { optionId: block.id },
  });
  const color = courseColor(block.courseKey);
  const height = Math.max(36, (block.endMin - block.startMin) * PX_PER_MINUTE - 3);
  const style = {
    top: (block.startMin - dayStartMin) * PX_PER_MINUTE,
    height,
    left: `calc(${(100 / block.cols) * block.col}% + 3px)`,
    width: `calc(${100 / block.cols}% - 6px)`,
    borderColor: color,
    background: `color-mix(in srgb, ${color} ${isOver ? 28 : 10}%, var(--surface))`,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      data-drop-label={label}
      className={`absolute z-20 overflow-hidden rounded-lg border border-dashed px-2 py-1 transition-[background-color,transform] ${
        isOver ? "scale-[1.02]" : ""
      } ${block.conflict ? "ring-error/60 ring-2" : ""}`}
      style={style}
    >
      <span className="text-on-surface block truncate font-mono text-xs leading-4 font-medium">{block.code}</span>
      <span className="text-on-surface-variant flex min-w-0 items-baseline gap-1 truncate text-xs leading-4">
        {block.section ? <span className="shrink-0 font-mono">{block.section}</span> : null}
        {block.section && block.component ? <span aria-hidden>·</span> : null}
        {block.component ? <span className="truncate">{block.component}</span> : null}
      </span>
      {block.conflict && height >= 72 ? (
        <span className="text-error mt-1 block truncate text-xs font-medium">Creates conflict</span>
      ) : null}
    </div>
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
  drag,
}: ScheduleGridProps) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const { anchor, move, reducedMotion, rotate, settle, start } = useDragOverlayPhysics({
    resolveSourceElement: (event) => {
      const target = event.activatorEvent.target;
      return target instanceof Element ? target.closest<HTMLElement>("[data-schedule-block]") : null;
    },
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );
  const dragOptions = activeBlockId && drag ? drag.getOptions(activeBlockId) : [];
  const optionModel = buildScheduleGrid(dragOptions.map((option) => option.item));
  const optionLabels = new Map(dragOptions.map((option) => [option.id, option.label]));
  const activeBlock = activeBlockId
    ? [...model.occurrencesByDay.values()].flat().find((block) => block.id === activeBlockId)
    : undefined;
  const selectedDay = model.days.includes(activeDay) ? activeDay : model.days[0];
  const hours: number[] = [];
  for (let minute = model.dayStartMin; minute <= model.dayEndMin; minute += 60) hours.push(minute);
  const bodyHeight = (model.dayEndMin - model.dayStartMin) * PX_PER_MINUTE;
  const hasBlocks = [...model.occurrencesByDay.values()].some((items) => items.length > 0);
  const showNow =
    now && model.days.includes(now.day) && now.minute >= model.dayStartMin && now.minute <= model.dayEndMin;

  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-schedule-dragging");
    },
    [],
  );

  function beginDrag(event: DragStartEvent) {
    const blockId = event.active.data.current?.blockId;
    if (typeof blockId !== "string") return;
    document.documentElement.setAttribute("data-schedule-dragging", "");
    setActiveBlockId(blockId);
    start(event);
  }

  function finishDrag(event: DragEndEvent) {
    document.documentElement.removeAttribute("data-schedule-dragging");
    const blockId = activeBlockId;
    const optionId = event.over?.data.current?.optionId;
    setActiveBlockId(null);
    settle();
    if (drag && blockId && typeof optionId === "string") drag.onDrop(blockId, optionId);
  }

  function cancelDrag() {
    document.documentElement.removeAttribute("data-schedule-dragging");
    setActiveBlockId(null);
    settle();
  }

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

  const content = (
    <section
      aria-label={ariaLabel}
      data-schedule-grid-frame
      className="schedule-grid bg-border-subtle flex h-full min-h-0 flex-col overflow-hidden rounded-[0.625rem] p-0.5"
    >
      <div
        className="schedule-grid-day-tabs bg-surface mb-0.5 flex shrink-0 gap-1 rounded-lg p-1"
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
            className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-2 text-xs font-medium focus-visible:ring-2 ${
              day === selectedDay ? "neu-inset bg-surface-container text-on-surface" : "text-on-surface-variant"
            }`}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="bg-surface min-h-0 flex-1 [scrollbar-gutter:stable] overflow-auto rounded-lg">
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
                className="text-muted absolute right-2 -translate-y-1/2 font-mono text-xs leading-none tabular-nums"
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
              {(optionModel.occurrencesByDay.get(day) ?? []).map((block) => (
                <ScheduleDropSlot
                  key={block.occurrenceId}
                  block={block}
                  dayStartMin={model.dayStartMin}
                  label={optionLabels.get(block.id) ?? `Switch to ${block.section}`}
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
              {(model.occurrencesByDay.get(day) ?? []).map((block) =>
                drag ? (
                  <DraggableScheduleBlock
                    key={block.occurrenceId}
                    block={block}
                    activeBlockId={activeBlockId}
                    dayStartMin={model.dayStartMin}
                    onActivate={() => onBlockActivate(block.id)}
                    footer={renderBlockFooter?.(block)}
                  />
                ) : (
                  <ScheduleBlock
                    key={block.occurrenceId}
                    block={block}
                    dayStartMin={model.dayStartMin}
                    onActivate={() => onBlockActivate(block.id)}
                    footer={renderBlockFooter?.(block)}
                  />
                ),
              )}
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
              <div className="bg-surface/95 pointer-events-auto max-w-sm rounded-lg px-5 py-4 text-center">
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

  if (!drag) return content;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={{
        announcements: {
          onDragStart: () => "Section picked up. Alternate sections are now visible.",
          onDragOver: ({ over }) => {
            const optionId = over?.data.current?.optionId;
            return typeof optionId === "string"
              ? `Section over ${optionLabels.get(optionId) ?? "an alternate section"}.`
              : "Section outside an alternate slot.";
          },
          onDragEnd: ({ over }) => {
            const optionId = over?.data.current?.optionId;
            return typeof optionId === "string"
              ? `Changed to ${optionLabels.get(optionId) ?? "the alternate section"}.`
              : "Section drag cancelled.";
          },
          onDragCancel: () => "Section drag cancelled.",
        },
      }}
      onDragStart={beginDrag}
      onDragMove={move}
      onDragEnd={finishDrag}
      onDragCancel={cancelDrag}
    >
      {content}
      <DragOverlay dropAnimation={DRAG_DROP_ANIMATION}>
        {activeBlock ? (
          <DragOverlayFrame anchor={anchor} reducedMotion={reducedMotion} rotate={rotate}>
            <ScheduleBlock
              block={activeBlock}
              dayStartMin={model.dayStartMin}
              onActivate={() => {}}
              footer={renderBlockFooter?.(activeBlock)}
              overlayWidth={anchor.width || 180}
            />
          </DragOverlayFrame>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
