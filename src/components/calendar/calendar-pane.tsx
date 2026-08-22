"use client";

import { Icon } from "@/src/components/icons";
import { announce } from "@/src/components/ui/live-region";
import {
  addMonths,
  buildMonthGrid,
  formatFullDate,
  formatMonthBadge,
  formatMonthHeading,
  isSameDay,
  parseISODate,
  startOfMonth,
  toISODate,
} from "@/src/shared/calendar/date-math";
import type { CalendarEvent, CalendarEventKind } from "@/src/shared/calendar/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCalendarEvents } from "./use-calendar-events";

const FUTURE_HORIZON_MONTHS = 24;
const WEEKDAY_HEADERS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ViewMode = "month" | "agenda";
type State = { cursor: string; kinds: CalendarEventKind[] };

function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const out: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!out[e.date]) out[e.date] = [];
    out[e.date].push(e);
  }
  return out;
}

/** Today anchored to UTC midnight — matches the ISO dates the API projects,
 * so "today" highlights identically regardless of the viewer's timezone. */
function getToday(): Date {
  const now = new Date();
  return parseISODate(toISODate(now));
}

export function CalendarPane({ state, setState }: { state: Partial<State>; setState: (s: Partial<State>) => void }) {
  const cursor = state.cursor ?? formatMonthBadge(new Date());
  const kinds = state.kinds?.length ? state.kinds : ["academic", "holiday"];
  const { events, error } = useCalendarEvents(cursor, kinds);

  const today = useMemo(() => getToday(), []);
  const todayISO = toISODate(today);
  const cursorDate = parseISODate(`${cursor}-01`);
  const horizon = addMonths(startOfMonth(today), FUTURE_HORIZON_MONTHS);
  const beyondHorizon = addMonths(cursorDate, 1) > horizon;

  const monthStart = startOfMonth(cursorDate);
  const monthEnd = addMonths(monthStart, 1);
  const grid = useMemo(() => buildMonthGrid(cursorDate), [cursorDate]);
  const cells = useMemo(
    () =>
      grid.flat().map((d, idx) => ({
        date: d,
        iso: d ? toISODate(d) : null,
        key: d ? toISODate(d) : `pad-${idx}`,
      })),
    [grid],
  );
  const monthEvents = (events ?? []).filter((e) => {
    const d = parseISODate(e.date);
    return d >= monthStart && d < monthEnd;
  });
  const eventsByDate = useMemo(() => groupByDate(monthEvents), [monthEvents]);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const selectedRows = useMemo(() => {
    const rows = eventsByDate[selectedDay ?? ""] ?? [];
    return rows.map((event, i) => ({ key: `${event.label}-${event.date}`, row: i, event }));
  }, [eventsByDate, selectedDay]);

  const upcoming = (events ?? [])
    .filter((e) => e.date >= todayISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 20);
  const upcomingRows = useMemo(
    () => upcoming.map((e, i) => ({ key: `u-${e.date}-${e.label}`, row: i, event: e })),
    [upcoming],
  );
  const upcomingByDate = useMemo(() => groupByDate(upcoming), [upcoming]);

  const openDay = (iso: string, clientX?: number, clientY?: number) => {
    if (clientX !== undefined && clientY !== undefined) setClickPos({ x: clientX, y: clientY });
    setSelectedDay(iso);
  };
  const closeDay = () => {
    setSelectedDay(null);
    setClickPos(null);
  };

  const goPrev = () => {
    const next = addMonths(cursorDate, -1);
    setState({ cursor: formatMonthBadge(next) });
    announce(`Moved to ${formatMonthHeading(next)}`);
  };

  const goNext = () => {
    const next = addMonths(cursorDate, 1);
    setState({ cursor: formatMonthBadge(next) });
    announce(`Moved to ${formatMonthHeading(next)}`);
  };

  const goToday = () => {
    const next = startOfMonth(today);
    setState({ cursor: formatMonthBadge(next) });
    announce(`Moved to ${formatMonthHeading(next)}`);
  };

  return (
    <div data-calendar-pane className="flex h-full w-full flex-col overflow-y-auto p-3 lg:p-6">
      {/* Navigation & header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-calendar-nav="prev"
            aria-label="Previous month"
            onClick={goPrev}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 items-center justify-center rounded-xl transition-colors focus-visible:ring-2"
          >
            <Icon name="left" size={18} />
          </button>
          <button
            type="button"
            data-calendar-nav="today"
            onClick={goToday}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container min-h-9 rounded-xl px-3 text-xs font-medium tracking-wide focus-visible:ring-2"
          >
            Today
          </button>
          <button
            type="button"
            data-calendar-nav="next"
            aria-label="Next month"
            disabled={beyondHorizon}
            onClick={goNext}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 items-center justify-center rounded-xl transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="right" size={18} />
          </button>
        </div>
        <h2 data-calendar-heading className="text-base font-medium tracking-[-0.01em]">
          {formatMonthHeading(cursorDate)}
        </h2>
        <div
          className="neu-inset bg-surface-container-low flex rounded-lg p-0.5"
          role="tablist"
          aria-label="Calendar view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "month"}
            onClick={() => setViewMode("month")}
            className={`focus-visible:ring-primary/40 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-offset-1 ${
              viewMode === "month"
                ? "neu-raised bg-surface text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "agenda"}
            onClick={() => setViewMode("agenda")}
            className={`focus-visible:ring-primary/40 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-offset-1 ${
              viewMode === "agenda"
                ? "neu-raised bg-surface text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Agenda
          </button>
        </div>
      </div>

      {/* Main content: grid + sidebar */}
      <div className="flex min-h-0 flex-1 gap-6">
        <section aria-label="Calendar" data-calendar-view={viewMode} className="flex min-h-0 flex-1 flex-col">
          {viewMode === "month" ? (
            <MonthGrid
              cells={cells}
              eventsByDate={eventsByDate}
              todayISO={todayISO}
              onDayClick={(iso, clientX, clientY) => openDay(iso, clientX, clientY)}
              selectedDay={selectedDay}
            />
          ) : (
            <AgendaView eventsByDate={eventsByDate} todayISO={todayISO} onDayClick={openDay} />
          )}
        </section>

        {/* Desktop sidebar: upcoming events */}
        <aside data-calendar-upcoming className="hidden w-72 shrink-0 flex-col gap-3 lg:flex">
          <h3 className="text-muted text-xs tracking-wide uppercase">Upcoming</h3>
          {upcomingRows.length === 0 ? (
            <p className="text-muted text-xs">No events upcoming.</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {Object.entries(upcomingByDate).map(([date, dayEvents]) => (
                <div key={date}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-on-surface text-xs font-medium">
                      {isSameDay(parseISODate(date), today) ? "Today" : formatDayLabel(parseISODate(date))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayEvents.map((e) => (
                      <button
                        key={`${e.date}-${e.label}`}
                        type="button"
                        data-upcoming-event
                        data-upcoming-date={e.date}
                        onClick={() => openDay(e.date)}
                        className="focus-visible:ring-primary/40 hover:bg-surface-container flex items-start gap-2 rounded-lg p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
                      >
                        <span
                          className={`mt-0.5 block h-full min-h-[1.5rem] w-1 shrink-0 rounded-full ${
                            e.kind === "academic" ? "bg-primary" : "bg-tertiary"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-on-surface truncate text-xs font-medium">{e.label}</p>
                          <p className="text-muted truncate text-xs">
                            {e.kind === "academic" ? "Academic" : "Holiday"}
                            {e.tags.length > 0 && ` · ${e.tags[0]}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {error && (
        <div className="text-error mt-3 text-xs" role="alert">
          {error.message}
        </div>
      )}

      {/* Event detail panel (desktop slide-in) / bottom sheet (mobile) */}
      {selectedDay && (
        <EventDetailPanel
          iso={selectedDay}
          rows={selectedRows}
          onClose={closeDay}
          clickPos={clickPos}
          formatDate={formatFullDate}
          parseISODate={parseISODate}
        />
      )}
    </div>
  );
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function MonthGrid({
  cells,
  eventsByDate,
  todayISO,
  onDayClick,
  selectedDay,
}: {
  cells: { date: Date | null; iso: string | null; key: string }[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayISO: string;
  onDayClick: (iso: string, clientX: number, clientY: number) => void;
  selectedDay: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-muted mb-1 grid grid-cols-7 text-center font-mono text-xs tracking-wide uppercase">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d} className="py-1" aria-hidden>
            {d[0]}
          </div>
        ))}
      </div>
      <div className="bg-border-subtle grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-xl">
        {cells.map((cell) => {
          if (!cell.date || !cell.iso) {
            return <div key={cell.key} className="min-h-[3rem]" aria-hidden />;
          }
          const iso = cell.iso;
          const d = cell.date;
          const dayEvents = eventsByDate[iso] ?? [];
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDay;
          const hasEvents = dayEvents.length > 0;
          return (
            <button
              type="button"
              key={cell.key}
              data-calendar-day={iso}
              {...(isToday ? { "data-calendar-today": iso } : {})}
              className={`flex min-h-[3rem] cursor-pointer flex-col items-stretch gap-0.5 p-1.5 text-left transition-colors duration-150 ${
                isSelected ? "bg-accent-subtle" : "bg-surface"
              }`}
              onClick={(e) => onDayClick(iso, e.clientX, e.clientY)}
              aria-label={`${formatFullDate(d)} — ${dayEvents.length} events`}
            >
              <span
                className={
                  isToday
                    ? "bg-primary text-on-primary mx-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold"
                    : "text-muted mx-0.5 text-xs"
                }
              >
                {d.getUTCDate()}
              </span>
              {hasEvents && (
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden" aria-hidden>
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={`${iso}-${e.label}`}
                      data-calendar-marker={e.kind}
                      className={
                        (e.kind === "academic" ? "bg-primary/20 text-primary" : "bg-tertiary/20 text-tertiary") +
                        " block truncate rounded-md px-1 py-px text-xs leading-tight font-medium"
                      }
                    >
                      {e.label}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span data-calendar-count={String(dayEvents.length)} className="text-muted font-mono text-xs">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({
  eventsByDate,
  todayISO,
  onDayClick,
}: {
  eventsByDate: Record<string, CalendarEvent[]>;
  todayISO: string;
  onDayClick: (iso: string) => void;
}) {
  const sortedDates = useMemo(
    () =>
      Object.entries(eventsByDate)
        .filter(([_, events]) => events.length > 0)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    [eventsByDate],
  );

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted text-xs">No events this month.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {sortedDates.map(([date, dayEvents]) => {
        const d = parseISODate(date);
        const isToday = date === todayISO;
        return (
          <div key={date}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-on-surface text-sm font-medium">{isToday ? "Today" : formatDayLabel(d)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {dayEvents.map((e) => (
                <button
                  key={`${e.date}-${e.label}`}
                  type="button"
                  onClick={() => onDayClick(e.date)}
                  className="focus-visible:ring-primary/40 hover:bg-surface-container flex items-start gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  <span
                    className={`mt-1 block h-full min-h-[2rem] w-1 shrink-0 rounded-full ${
                      e.kind === "academic" ? "bg-primary" : "bg-tertiary"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface text-sm font-medium">{e.label}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-muted text-xs">{e.kind === "academic" ? "Academic" : "Holiday"}</span>
                      {e.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-surface-container-high text-on-surface-variant rounded-full px-2 py-px text-xs font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  {e.source_url && (
                    <span className="text-muted mt-1 shrink-0">
                      <Icon name="externalLink" size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventDetailPanel({
  iso,
  rows,
  onClose,
  clickPos,
  formatDate,
  parseISODate: pISO,
}: {
  iso: string;
  rows: { key: string; row: number; event: CalendarEvent }[];
  onClose: () => void;
  clickPos: { x: number; y: number } | null;
  formatDate: (d: Date) => string;
  parseISODate: (s: string) => Date;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inWinX = typeof window !== "undefined" ? window.innerWidth : 1024;
  const inWinY = typeof window !== "undefined" ? window.innerHeight : 768;
  const popoverW = 320;
  const left = clickPos ? Math.max(8, Math.min(clickPos.x, inWinX - popoverW - 8)) : 24;
  const top = clickPos ? Math.max(8, Math.min(clickPos.y, inWinY - 240)) : 24;

  const inner = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-on-surface text-sm font-medium">{formatDate(pISO(iso))}</p>
          <p className="text-muted text-xs">
            {rows.length} event{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="focus-visible:ring-primary/40 text-muted hover:text-on-surface rounded-md p-1 transition-colors focus-visible:ring-2"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
        {rows.map(({ key, row, event: e }) => (
          <li
            key={key}
            data-event-row={row}
            className={
              (e.kind === "academic" ? "bg-primary/10" : "bg-tertiary/10") +
              " flex items-start gap-2.5 rounded-lg px-3 py-2.5"
            }
          >
            <span
              aria-hidden
              className={`mt-0.5 h-4 w-1 shrink-0 rounded-full ${e.kind === "academic" ? "bg-primary" : "bg-tertiary"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span data-event-label={e.label} className="text-on-surface text-xs font-medium">
                  {e.label}
                </span>
                <span className="text-muted font-mono text-xs tracking-wide uppercase opacity-70">{e.kind}</span>
              </div>
              {e.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-surface-container-high text-on-surface-variant rounded-full px-1.5 py-px text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {e.source_url && (
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary mt-1.5 inline-flex min-h-9 min-w-11 items-center gap-1 text-xs underline"
                  title="Open source"
                >
                  <Icon name="externalLink" size={12} />
                  Source
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <>
      <div className="bg-surface/60 fixed inset-0 z-40 sm:hidden" aria-hidden onClick={onClose} />
      <div
        data-calendar-popover
        role="dialog"
        aria-label={`Events on ${formatDate(pISO(iso))}`}
        className="neu-panel bg-surface-container fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-2xl p-4 sm:hidden"
      >
        {inner}
      </div>
      <div
        role="dialog"
        aria-label={`Events on ${formatDate(pISO(iso))}`}
        className="neu-panel bg-surface-container fixed z-50 hidden w-80 rounded-xl p-4 sm:block"
        style={{ left, top }}
      >
        {inner}
      </div>
    </>
  );
}
