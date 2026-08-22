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

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const [mobileView, setMobileView] = useState<"calendar" | "list">("calendar");
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
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 justify-self-start">
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
        <h2 data-calendar-heading className="justify-self-center text-base font-medium tracking-[-0.01em]">
          {formatMonthHeading(cursorDate)}
        </h2>
        <div
          className="neu-inset bg-surface-container-low justify-self-end rounded-lg p-0.5 lg:hidden"
          role="tablist"
          aria-label="View"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "calendar"}
            onClick={() => setMobileView("calendar")}
            className={`focus-visible:ring-primary/40 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-offset-1 ${
              mobileView === "calendar"
                ? "neu-raised bg-surface text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "list"}
            onClick={() => setMobileView("list")}
            className={`focus-visible:ring-primary/40 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-offset-1 ${
              mobileView === "list"
                ? "neu-raised bg-surface text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            List
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        <aside
          data-calendar-upcoming
          className={`flex w-72 shrink-0 flex-col gap-3 ${mobileView === "list" ? "flex" : "hidden"} lg:flex`}
        >
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

        <section
          aria-label="Calendar"
          className={`flex min-h-0 flex-1 flex-col ${mobileView === "list" ? "hidden" : "flex"} lg:flex`}
        >
          <MonthGrid
            cells={cells}
            eventsByDate={eventsByDate}
            todayISO={todayISO}
            cursorDate={cursorDate}
            onDayClick={(iso, clientX, clientY) => openDay(iso, clientX, clientY)}
            selectedDay={selectedDay}
          />
        </section>
      </div>

      {error && (
        <div className="text-error mt-3 text-xs" role="alert">
          {error.message}
        </div>
      )}

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
  cursorDate,
  onDayClick,
  selectedDay,
}: {
  cells: { date: Date | null; iso: string | null; key: string }[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayISO: string;
  cursorDate: Date;
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
      <div className="bg-border-subtle grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-xl p-1">
        {cells.map((cell) => {
          if (!cell.date || !cell.iso) {
            return <div key={cell.key} className="bg-surface/70 min-h-[3rem] rounded-lg" aria-hidden />;
          }
          const iso = cell.iso;
          const d = cell.date;
          const isCurrentMonth = d.getUTCMonth() === cursorDate.getUTCMonth();
          const dayEvents = isCurrentMonth ? (eventsByDate[iso] ?? []) : [];
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDay;
          const hasEvents = dayEvents.length > 0;
          return (
            <button
              type="button"
              key={cell.key}
              data-calendar-day={iso}
              {...(isToday ? { "data-calendar-today": iso } : {})}
              className={`flex min-h-[3rem] cursor-pointer flex-col items-stretch gap-0.5 rounded-lg p-1.5 text-left transition-colors duration-150 ${
                isSelected ? "bg-accent-subtle" : isCurrentMonth ? "bg-surface" : "bg-surface/70"
              }`}
              onClick={(e) => onDayClick(iso, e.clientX, e.clientY)}
              aria-label={`${formatFullDate(d)}${hasEvents ? ` — ${dayEvents.length} events` : ""}`}
            >
              <span
                className={`mx-0.5 text-xs ${isToday ? "bg-primary text-on-primary flex size-6 items-center justify-center rounded-full font-semibold" : isCurrentMonth ? "text-muted" : "text-muted/40"}`}
              >
                {d.getUTCDate()}
              </span>
              {isCurrentMonth && hasEvents && (
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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
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
      <div ref={panelRef}>
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
      </div>
    </>
  );
}
