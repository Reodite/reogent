"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
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
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCalendarEvents } from "./use-calendar-events";

const FUTURE_HORIZON_MONTHS = 24;
const WEEKDAY_HEADERS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = Array.from({ length: 12 }, (_, m) =>
  new Date(Date.UTC(2000, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
);

/** Per-kind label and palette for markers, bars and chips. Unknown kinds fall
 * back to the academic style. */
const KIND_STYLE: Record<string, { label: string; bar: string; chip: string }> = {
  academic: { label: "Academic", bar: "bg-primary", chip: "bg-primary/20 text-primary" },
  holiday: { label: "Holiday", bar: "bg-tertiary", chip: "bg-tertiary/20 text-tertiary" },
  event: { label: "Campus event", bar: "bg-secondary", chip: "bg-secondary/20 text-secondary" },
};
const kindStyle = (kind: string) => KIND_STYLE[kind] ?? KIND_STYLE.academic;

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
  const reduce = useReducedMotion() ?? false;
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

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [mobileView, setMobileView] = useState<"calendar" | "list">("calendar");

  const openEvent = (event: CalendarEvent) => setSelectedEvent(event);
  const closeEvent = () => setSelectedEvent(null);

  const upcoming = (events ?? [])
    .filter((e) => e.date >= todayISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 20);
  const upcomingRows = useMemo(
    () => upcoming.map((e, i) => ({ key: `u-${e.date}-${e.label}`, row: i, event: e })),
    [upcoming],
  );
  const upcomingByDate = useMemo(() => groupByDate(upcoming), [upcoming]);

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

  const goMonth = (next: Date) => {
    setState({ cursor: formatMonthBadge(next) });
    announce(`Moved to ${formatMonthHeading(next)}`);
  };

  // Campus events ride on the persisted `kinds` pane state: "event" present
  // means the route also returns events.ubc.ca entries for the visible window.
  const showEvents = kinds.includes("event");
  const toggleEvents = () => {
    setState({ kinds: showEvents ? kinds.filter((k) => k !== "event") : [...kinds, "event"] });
    announce(showEvents ? "Campus events hidden" : "Campus events shown");
  };

  const shell = useChatShellOptional();
  const { isGuest } = useAppAuth();
  // Sends the upcoming-events list to the AI as an attachment: shown in chat
  // as a "Calendar" file bubble, read by the agent as text after the prompt.
  const askAiAboutCalendar = () => {
    const lines = upcoming.map(
      (e) => `${e.date} — ${e.label} (${kindStyle(e.kind).label}${e.tags.length ? `: ${e.tags.join(", ")}` : ""})`,
    );
    shell?.askAi("Give me an overview of upcoming events:", {
      title: "Calendar",
      content: lines.length > 0 ? lines.join("\n") : "No upcoming events.",
    });
  };

  // The toolbar portals into the Answer Canvas titlebar slot when hosted there
  // so nav, month picker and Ask AI share the header line; hosts without the
  // slot get it inline above the grid.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlotEl(
      rootRef.current?.closest("section[data-pane]")?.querySelector<HTMLElement>("[data-pane-titlebar-slot]") ?? null,
    );
  }, []);

  const toolbar = (
    <div className="flex w-full items-center gap-1.5">
      <button
        type="button"
        data-calendar-nav="prev"
        aria-label="Previous month"
        onClick={goPrev}
        className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:ring-2"
      >
        <Icon name="left" size={18} />
      </button>
      <MonthYearPicker cursorDate={cursorDate} horizon={horizon} onPick={goMonth} />
      <button
        type="button"
        data-calendar-nav="next"
        aria-label="Next month"
        disabled={beyondHorizon}
        onClick={goNext}
        className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
      >
        <Icon name="right" size={18} />
      </button>
      <div className="flex-1" />
      <button
        type="button"
        data-calendar-events-toggle
        aria-pressed={showEvents}
        title={showEvents ? "Hide campus events" : "Show campus events"}
        onClick={toggleEvents}
        className={`neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium tracking-wide focus-visible:ring-2 ${showEvents ? "text-primary" : ""}`}
      >
        Events
      </button>
      {shell && (
        <button
          type="button"
          data-calendar-ask-ai
          disabled={isGuest}
          title={isGuest ? "Sign in to use AI chat" : "Ask AI about upcoming events"}
          onClick={askAiAboutCalendar}
          className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium tracking-wide focus-visible:ring-2 disabled:pointer-events-auto disabled:opacity-40"
        >
          <Icon name="chat1" size={14} />
          Ask AI
          {isGuest && <Icon name="lock" size={12} />}
        </button>
      )}
    </div>
  );

  return (
    <div ref={rootRef} data-calendar-pane className="flex h-full w-full flex-col overflow-y-auto p-3 lg:p-6">
      {slotEl ? createPortal(toolbar, slotEl) : <div className="mb-4">{toolbar}</div>}

      <div className="mb-4 flex justify-end lg:hidden">
        <div className="neu-inset bg-surface-container-low rounded-lg p-0.5" role="tablist" aria-label="View">
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
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pl-2" style={{ direction: "rtl" }}>
              {Object.entries(upcomingByDate).map(([date, dayEvents]) => (
                <div key={date} style={{ direction: "ltr" }}>
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
                        onClick={() => openEvent(e)}
                        className="focus-visible:ring-primary/40 hover:bg-surface-container flex items-start gap-2 rounded-lg p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
                      >
                        <span
                          className={`mt-0.5 block h-full min-h-[1.5rem] w-1 shrink-0 rounded-full ${kindStyle(e.kind).bar}`}
                        />
                        <div className="min-w-0">
                          <p className="text-on-surface truncate text-xs font-medium">{e.label}</p>
                          <p className="text-muted truncate text-xs">
                            {kindStyle(e.kind).label}
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
            cursor={cursor}
            reduce={reduce}
            onEventClick={openEvent}
          />
        </section>
      </div>

      {error && (
        <div className="text-error mt-3 text-xs" role="alert">
          {error.message}
        </div>
      )}

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={closeEvent}
          formatDate={formatFullDate}
          parseISODateFn={parseISODate}
        />
      )}
    </div>
  );
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Month+year trigger that doubles as the header's month heading; opens a
 * year-stepped grid of months. Months past `horizon` are unreachable, matching
 * the next-month button's cap. */
function MonthYearPicker({
  cursorDate,
  horizon,
  onPick,
}: {
  cursorDate: Date;
  horizon: Date;
  onPick: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const cursorYear = cursorDate.getUTCFullYear();
  const [year, setYear] = useState(cursorYear);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Reopening lands on the month in view, not wherever the year arrows stopped.
  useEffect(() => {
    if (open) setYear(cursorYear);
  }, [open, cursorYear]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const nextYearBlocked = new Date(Date.UTC(year + 1, 0, 1)) > horizon;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-calendar-heading
        data-calendar-month-picker
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium tracking-[-0.01em] focus-visible:ring-2"
      >
        {formatMonthHeading(cursorDate)}
        <Icon name="down" size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick month and year"
          data-calendar-month-menu
          className="neu-raised bg-surface absolute top-[calc(100%+0.25rem)] left-0 z-50 w-60 rounded-xl p-2"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
              className="hover:bg-surface-container focus-visible:ring-primary/40 flex size-8 items-center justify-center rounded-lg focus-visible:ring-2"
            >
              <Icon name="left" size={16} />
            </button>
            <span className="text-on-surface font-mono text-sm font-medium">{year}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={nextYearBlocked}
              onClick={() => setYear((y) => y + 1)}
              className="hover:bg-surface-container focus-visible:ring-primary/40 flex size-8 items-center justify-center rounded-lg focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon name="right" size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_LABELS.map((label, m) => {
              const d = new Date(Date.UTC(year, m, 1));
              const selected = year === cursorYear && m === cursorDate.getUTCMonth();
              return (
                <button
                  key={label}
                  type="button"
                  data-calendar-month={formatMonthBadge(d)}
                  aria-current={selected ? "true" : undefined}
                  disabled={d > horizon}
                  onClick={() => {
                    onPick(d);
                    setOpen(false);
                  }}
                  className={`focus-visible:ring-primary/40 rounded-lg py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30 ${
                    selected ? "bg-primary text-on-primary" : "text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  cells,
  eventsByDate,
  todayISO,
  cursorDate,
  cursor,
  reduce,
  onEventClick,
}: {
  cells: { date: Date | null; iso: string | null; key: string }[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayISO: string;
  cursorDate: Date;
  cursor: string;
  reduce: boolean;
  onEventClick: (event: CalendarEvent) => void;
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
      <motion.div
        key={cursor}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-border-subtle grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-0.5 overflow-hidden rounded-[0.625rem] p-0.5"
      >
        {cells.map((cell) => {
          if (!cell.date || !cell.iso) {
            return <div key={cell.key} className="bg-surface/70 min-h-[3rem] rounded-lg" aria-hidden />;
          }
          const iso = cell.iso;
          const d = cell.date;
          const isCurrentMonth = d.getUTCMonth() === cursorDate.getUTCMonth();
          const dayEvents = isCurrentMonth ? (eventsByDate[iso] ?? []) : [];
          const isToday = iso === todayISO;
          const hasEvents = dayEvents.length > 0;
          return (
            <div
              key={cell.key}
              data-calendar-day={iso}
              {...(isToday ? { "data-calendar-today": iso } : {})}
              className={`flex min-h-[3rem] flex-col items-stretch gap-0.5 rounded-lg p-1.5 ${
                isCurrentMonth ? "bg-surface" : "bg-surface/70"
              }`}
            >
              <span
                className={`mx-0.5 text-xs ${isToday ? "bg-primary text-on-primary flex size-6 items-center justify-center rounded-full font-semibold" : isCurrentMonth ? "text-muted" : "text-muted/40"}`}
              >
                {d.getUTCDate()}
              </span>
              {isCurrentMonth && hasEvents && (
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={`${iso}-${e.label}`}
                      type="button"
                      data-calendar-marker={e.kind}
                      onClick={() => onEventClick(e)}
                      className={`block w-full truncate rounded-md px-1 py-px text-left text-xs leading-tight font-medium transition-colors hover:opacity-80 ${kindStyle(e.kind).chip}`}
                    >
                      {e.label}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span data-calendar-count={String(dayEvents.length)} className="text-muted font-mono text-xs">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

function EventModal({
  event,
  onClose,
  formatDate,
  parseISODateFn,
}: {
  event: CalendarEvent;
  onClose: () => void;
  formatDate: (d: Date) => string;
  parseISODateFn: (s: string) => Date;
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

  return (
    <div className="bg-scrim fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={event.label}
        data-calendar-popover
        className="neu-panel bg-surface-container w-full max-w-lg rounded-t-2xl p-4 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className={`h-8 w-1.5 shrink-0 rounded-full ${kindStyle(event.kind).bar}`} />
            <div>
              <p className="text-on-surface text-sm font-medium">{event.label}</p>
              <p className="text-muted text-xs">{formatDate(parseISODateFn(event.date))}</p>
            </div>
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="bg-surface-container-high text-on-surface-variant rounded-full px-2 py-0.5 text-xs font-medium">
            {kindStyle(event.kind).label}
          </span>
          {event.tags.map((tag) => (
            <span
              key={tag}
              className="bg-surface-container-high text-on-surface-variant rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-4 inline-flex min-h-9 min-w-11 items-center gap-1 text-xs underline"
            title="Open source"
          >
            <Icon name="externalLink" size={12} />
            View on UBC site
          </a>
        )}
      </div>
    </div>
  );
}
