"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { LoadingStatus, RetryAlert } from "@/src/components/ui/feedback";
import { InfoChip } from "@/src/components/ui/info-chip";
import { announce } from "@/src/components/ui/live-region";
import {
  WorkspaceCanvas,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceRail,
  type WorkspaceView,
} from "@/src/components/ui/workspace";
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
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCalendarEvents } from "./use-calendar-events";

const FUTURE_HORIZON_MONTHS = 24;
const WEEKDAY_HEADERS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = Array.from({ length: 12 }, (_, m) =>
  new Date(Date.UTC(2000, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
);

/** Every kind the route serves; the pane always shows all of them. */
const KINDS = ["academic", "holiday", "event"];

/** Label and palette per kind, in legend order. Unknown kinds fall back to
 * the academic style. */
const STYLES = {
  academic: { label: "Academic", bar: "bg-primary", chip: "bg-primary/20 text-primary" },
  holiday: { label: "Holiday", bar: "bg-tertiary", chip: "bg-tertiary/20 text-tertiary" },
  event: { label: "Campus event", bar: "bg-secondary", chip: "bg-secondary/20 text-secondary" },
};
const styleOf = (e: CalendarEvent) => STYLES[e.kind as keyof typeof STYLES] ?? STYLES.academic;

/** `hidden` lists kinds the legend has switched off; all kinds are fetched
 * and filtered client-side so toggling never refetches. */
type State = { cursor: string; hidden: string[] };
const NONE: string[] = [];

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
  const hidden = state.hidden ?? NONE;
  const { state: eventsState, retry } = useCalendarEvents(cursor, KINDS);
  const events = eventsState.events;
  const visible = useMemo(() => events.filter((event) => !hidden.includes(event.kind)), [events, hidden]);
  const toggleKind = (kind: string) => {
    const nowHidden = !hidden.includes(kind);
    setState({ hidden: nowHidden ? [...hidden, kind] : hidden.filter((k) => k !== kind) });
    announce(`${STYLES[kind as keyof typeof STYLES].label} ${nowHidden ? "hidden" : "shown"}`);
  };

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
  const monthEvents = visible.filter((e) => {
    const d = parseISODate(e.date);
    return d >= monthStart && d < monthEnd;
  });
  const eventsByDate = useMemo(() => groupByDate(monthEvents), [monthEvents]);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[] | null>(null);
  const [mobileView, setMobileView] = useState<WorkspaceView>("rail");

  const openEvent = (event: CalendarEvent) => {
    setSelectedDayEvents(null);
    setSelectedEvent(event);
  };
  const closeEvent = () => setSelectedEvent(null);

  const upcoming = visible
    .filter((e) => e.date >= todayISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 20);
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

  const shell = useChatShellOptional();
  const { isGuest } = useAppAuth();
  // Sends the upcoming-events list to the AI as an attachment: shown in chat
  // as a "Calendar" file bubble, read by the agent as text after the prompt.
  const askAiAboutCalendar = () => {
    const lines = upcoming.map(
      (e) => `${e.date} — ${e.label} (${styleOf(e).label}${e.tags.length ? `: ${e.tags.join(", ")}` : ""})`,
    );
    shell?.askAi("Give me an overview of upcoming events:", {
      title: "Calendar",
      content: lines.length > 0 ? lines.join("\n") : "No upcoming events.",
    });
  };

  const askAiAction = shell ? (
    <Button
      data-calendar-ask-ai
      disabled={isGuest}
      title={isGuest ? "Sign in to use AI chat" : "Ask AI about upcoming events"}
      onClick={askAiAboutCalendar}
      size="toolbar"
    >
      <Icon name="chat1" size={14} />
      Ask AI
      {isGuest ? <Icon name="lock" size={12} /> : null}
    </Button>
  ) : null;

  const toolbar = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Button data-calendar-nav="prev" aria-label="Previous month" onClick={goPrev} size="icon">
          <Icon name="left" size={18} />
        </Button>
        <MonthYearPicker cursorDate={cursorDate} horizon={horizon} onPick={goMonth} />
        <Button data-calendar-nav="next" aria-label="Next month" disabled={beyondHorizon} onClick={goNext} size="icon">
          <Icon name="right" size={18} />
        </Button>
      </div>
      <ul aria-label="Legend" className="flex flex-wrap items-center justify-end gap-1">
        {Object.entries(STYLES).map(([key, style]) => {
          const shown = !hidden.includes(key);
          return (
            <li key={key}>
              <Button
                variant="ghost"
                size="toolbar"
                data-calendar-legend={key}
                aria-pressed={shown}
                onClick={() => toggleKind(key)}
                className={shown ? "text-on-surface-variant" : "text-muted/60"}
              >
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${shown ? style.bar : "ring-1 ring-current ring-inset"}`}
                />
                {style.label}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const notice =
    eventsState.status === "stale" ? (
      <RetryAlert variant="soft" onRetry={retry}>
        Couldn't refresh the calendar. Showing the last saved dates.
      </RetryAlert>
    ) : eventsState.status === "failed" ? (
      <RetryAlert onRetry={retry}>Couldn't load calendar dates.</RetryAlert>
    ) : eventsState.status === "refreshing" ? (
      <LoadingStatus announce={false}>Refreshing calendar…</LoadingStatus>
    ) : null;

  return (
    <>
      <WorkspacePage
        composition="split"
        title="Calendar"
        description="Browse academic dates, holidays, and campus events."
        toolbar={toolbar}
        actions={askAiAction}
        titlebarActions={askAiAction}
        notice={notice}
        view={mobileView}
        onViewChange={setMobileView}
        mainLabel="Calendar"
        railLabel="Upcoming"
        rail={
          <WorkspaceRail>
            <WorkspacePanel title="Upcoming" padding="sm">
              <div data-calendar-upcoming className="flex min-h-0 flex-col gap-3">
                {eventsState.status === "loading" ? (
                  <LoadingStatus>Loading upcoming events…</LoadingStatus>
                ) : eventsState.status === "failed" ? (
                  <p className="text-muted text-xs">Upcoming events are unavailable.</p>
                ) : upcoming.length === 0 ? (
                  <p className="text-muted text-xs">No events upcoming.</p>
                ) : (
                  Object.entries(upcomingByDate).map(([date, dayEvents]) => (
                    <div key={date}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-on-surface text-xs font-medium">
                          {isSameDay(parseISODate(date), today) ? "Today" : formatDayLabel(parseISODate(date))}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayEvents.map((event) => (
                          <button
                            key={`${event.date}-${event.label}-${event.source_url ?? "local"}`}
                            type="button"
                            data-upcoming-event
                            data-upcoming-date={event.date}
                            onClick={() => openEvent(event)}
                            className="focus-visible:ring-primary/40 hover:bg-surface-container flex min-h-11 items-start gap-2 rounded-lg p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
                          >
                            <span
                              className={`mt-0.5 block h-full min-h-[1.5rem] w-1 shrink-0 rounded-full ${styleOf(event).bar}`}
                            />
                            <span className="min-w-0">
                              <span className="text-on-surface block truncate text-xs font-medium">{event.label}</span>
                              <span className="text-muted block truncate text-xs">
                                {styleOf(event).label}
                                {event.tags.length > 0 ? ` · ${event.tags[0]}` : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </WorkspacePanel>
          </WorkspaceRail>
        }
      >
        <WorkspaceCanvas
          aria-busy={eventsState.status === "loading" || eventsState.status === "refreshing"}
          padding="md"
        >
          <MonthGrid
            cells={cells}
            eventsByDate={eventsByDate}
            todayISO={todayISO}
            cursorDate={cursorDate}
            onEventClick={openEvent}
            onDayAgenda={setSelectedDayEvents}
          />
        </WorkspaceCanvas>
      </WorkspacePage>

      {selectedDayEvents ? (
        <DayAgendaDialog events={selectedDayEvents} onSelect={openEvent} onClose={() => setSelectedDayEvents(null)} />
      ) : null}
      {selectedEvent ? <EventModal event={selectedEvent} onClose={closeEvent} /> : null}
    </>
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
      <Button
        ref={triggerRef}
        data-calendar-heading
        data-calendar-month-picker
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-40 tracking-[-0.01em]"
      >
        {formatMonthHeading(cursorDate)}
        <Icon name="down" size={14} />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick month and year"
          data-calendar-month-menu
          className="neu-raised bg-surface absolute top-[calc(100%+0.25rem)] left-1/2 z-50 w-60 -translate-x-1/2 rounded-xl p-2"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
              className="hover:bg-surface-container focus-visible:ring-primary/40 flex size-11 items-center justify-center rounded-lg focus-visible:ring-2 @min-[55rem]:size-8"
            >
              <Icon name="left" size={16} />
            </button>
            <span className="text-on-surface font-mono text-sm font-medium">{year}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={nextYearBlocked}
              onClick={() => setYear((y) => y + 1)}
              className="hover:bg-surface-container focus-visible:ring-primary/40 flex size-11 items-center justify-center rounded-lg focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 @min-[55rem]:size-8"
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
                  className={`focus-visible:ring-primary/40 min-h-11 rounded-lg py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30 @min-[55rem]:min-h-8 ${
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
  onEventClick,
  onDayAgenda,
}: {
  cells: { date: Date | null; iso: string | null; key: string }[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayISO: string;
  cursorDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onDayAgenda: (events: CalendarEvent[]) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="calendar-month-width text-muted mb-1 grid grid-cols-7 text-center font-mono text-xs tracking-wide uppercase">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d} className="py-1" aria-hidden>
            {d[0]}
          </div>
        ))}
      </div>
      <div
        data-calendar-grid
        className="calendar-month-width bg-border-subtle grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-0.5 overflow-hidden rounded-[0.625rem] p-0.5"
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
                className={`mx-0.5 text-xs ${isToday ? "bg-primary text-on-primary flex size-6 items-center justify-center rounded-full font-semibold" : isCurrentMonth ? "text-on-surface-variant" : "text-muted"}`}
              >
                {d.getUTCDate()}
              </span>
              {isCurrentMonth && hasEvents ? (
                <>
                  <div className="calendar-event-labels flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={`${iso}-${event.label}-${event.source_url ?? "local"}`}
                        type="button"
                        data-calendar-marker={event.kind}
                        onClick={() => onEventClick(event)}
                        className={`block w-full truncate rounded-md px-1 py-px text-left text-xs leading-tight font-medium transition-colors hover:opacity-80 ${styleOf(event).chip}`}
                      >
                        {event.label}
                      </button>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span data-calendar-count={String(dayEvents.length)} className="text-muted font-mono text-xs">
                        +{dayEvents.length - 3} more
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    data-calendar-day-agenda={iso}
                    onClick={() => onDayAgenda(dayEvents)}
                    className="calendar-day-agenda focus-visible:ring-primary/40 text-on-surface-variant min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium focus-visible:ring-2"
                    aria-label={`Open ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"} on ${formatFullDate(d)}`}
                  >
                    <span aria-hidden="true" className="flex items-center gap-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={`${event.kind}-${event.label}-${event.source_url ?? "local"}`}
                          className={`size-1.5 rounded-full ${styleOf(event).bar}`}
                        />
                      ))}
                    </span>
                    {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayAgendaDialog({
  events,
  onSelect,
  onClose,
}: {
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  onClose: () => void;
}) {
  const date = events[0]?.date;
  return (
    <DialogRoot onDismiss={onClose} backdropLabel="Close day agenda" placement="mobile-sheet">
      <DialogPanel
        aria-label={date ? `Events on ${formatFullDate(parseISODate(date))}` : "Day agenda"}
        size="md"
        className="flex max-h-[min(40rem,calc(100dvh-1.5rem))] flex-col overflow-hidden p-4"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-on-surface text-base font-medium">Day agenda</h2>
            {date ? <p className="text-muted mt-1 text-xs">{formatFullDate(parseISODate(date))}</p> : null}
          </div>
          <Button data-dialog-initial-focus variant="ghost" size="denseIcon" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </Button>
        </header>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {events.map((event) => (
            <Button
              key={`${event.date}-${event.kind}-${event.label}-${event.source_url ?? "local"}`}
              variant="ghost"
              size="field"
              wrap
              onClick={() => onSelect(event)}
              className="h-auto min-h-11 w-full justify-start py-2 text-left"
            >
              <span aria-hidden className={`h-8 w-1 shrink-0 rounded-full ${styleOf(event).bar}`} />
              <span className="min-w-0">
                <span className="text-on-surface block text-sm font-medium">{event.label}</span>
                <span className="text-muted block text-xs">{styleOf(event).label}</span>
              </span>
            </Button>
          ))}
        </div>
      </DialogPanel>
    </DialogRoot>
  );
}

function EventModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <DialogRoot onDismiss={onClose} backdropLabel="Close event details" placement="mobile-sheet">
      <DialogPanel aria-label={event.label} data-calendar-popover size="md" className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className={`h-8 w-1.5 shrink-0 rounded-full ${styleOf(event).bar}`} />
            <div>
              <p className="text-on-surface text-sm font-medium">{event.label}</p>
              <p className="text-muted text-xs">{formatFullDate(parseISODate(event.date))}</p>
            </div>
          </div>
          <Button data-dialog-initial-focus variant="ghost" size="denseIcon" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <InfoChip emphasis="strong">{styleOf(event).label}</InfoChip>
          {event.tags.map((tag) => (
            <InfoChip key={tag} emphasis="strong">
              {tag}
            </InfoChip>
          ))}
        </div>
        {event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-4 inline-flex min-h-11 min-w-11 items-center gap-1 text-xs underline"
            title="Open source"
          >
            <Icon name="externalLink" size={12} />
            View on UBC site
          </a>
        ) : null}
      </DialogPanel>
    </DialogRoot>
  );
}
