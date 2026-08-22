"use client";

import { Icon } from "@/src/components/icons";
import { announce } from "@/src/components/ui/live-region";
import {
  addMonths,
  buildMonthGrid,
  formatFullDate,
  formatMonthBadge,
  formatMonthHeading,
  parseISODate,
  startOfMonth,
  toISODate,
} from "@/src/shared/calendar/date-math";
import type { CalendarEvent, CalendarEventKind } from "@/src/shared/calendar/event";
import { useMemo, useState } from "react";
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

export function CalendarPane({ state, setState }: { state: Partial<State>; setState: (s: Partial<State>) => void }) {
  const cursor = state.cursor ?? formatMonthBadge(new Date());
  const kinds = state.kinds?.length ? state.kinds : ["academic", "holiday"];
  const { events, error } = useCalendarEvents(cursor, kinds);

  const today = useMemo(() => new Date(), []);
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
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const popoverRows = useMemo(() => {
    const rows = eventsByDate[popoverDay ?? ""] ?? [];
    return rows.map((event, i) => ({ key: `${event.label}-${event.date}`, row: i, event }));
  }, [eventsByDate, popoverDay]);

  return (
    <div data-calendar-pane className="flex h-full w-full flex-col gap-3 overflow-y-auto p-3 lg:p-6">
      <section aria-label="Month grid" className="flex min-h-0 flex-1 flex-col gap-3">
        <nav className="flex items-center justify-between gap-2" aria-label="Calendar month navigation">
          <button
            type="button"
            data-calendar-nav="prev"
            aria-label="Previous month"
            onClick={() => {
              const next = addMonths(cursorDate, -1);
              setState({ cursor: formatMonthBadge(next) });
              announce(`Moved to ${formatMonthHeading(next)}`);
            }}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 items-center justify-center rounded-xl transition-colors focus-visible:ring-2"
          >
            <Icon name="left" size={18} />
          </button>
          <button
            type="button"
            data-calendar-nav="today"
            onClick={() => {
              const next = startOfMonth(today);
              setState({ cursor: formatMonthBadge(next) });
              announce(`Moved to ${formatMonthHeading(next)}`);
            }}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container min-h-9 rounded-xl px-3 text-xs font-medium tracking-wide focus-visible:ring-2"
          >
            This month
          </button>
          <button
            type="button"
            data-calendar-nav="next"
            aria-label="Next month"
            disabled={beyondHorizon}
            onClick={() => {
              const next = addMonths(cursorDate, 1);
              setState({ cursor: formatMonthBadge(next) });
              announce(`Moved to ${formatMonthHeading(next)}`);
            }}
            className="neu-button focus-visible:ring-primary/40 hover:bg-surface-container flex size-9 items-center justify-center rounded-xl transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="right" size={18} />
          </button>
        </nav>

        <h2 data-calendar-heading className="text-center text-base font-medium tracking-[-0.01em]">
          {formatMonthHeading(cursorDate)}
        </h2>

        <div className="text-muted grid grid-cols-7 gap-1 text-center font-mono text-xs tracking-wide uppercase">
          {WEEKDAY_HEADERS.map((d) => (
            <div key={d} aria-hidden>
              {d[0]}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (!cell.date || !cell.iso) {
              return <div key={cell.key} className="neu-inset min-h-[2.5rem] rounded-sm opacity-40" aria-hidden />;
            }
            const iso = cell.iso;
            const d = cell.date;
            const dayEvents = eventsByDate[iso] ?? [];
            const isToday = iso === todayISO;
            const hasEvents = dayEvents.length > 0;
            return (
              <div
                key={cell.key}
                data-calendar-day={iso}
                {...(isToday ? { "data-calendar-today": iso } : {})}
                className="neu-inset flex min-h-[2.5rem] flex-col items-stretch gap-0.5 rounded-sm p-1"
              >
                <button
                  type="button"
                  onClick={() => hasEvents && setPopoverDay(iso)}
                  disabled={!hasEvents}
                  aria-label={`${formatFullDate(d)} — ${dayEvents.length} events`}
                  className="focus-visible:ring-primary/40 self-start rounded-full font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  <span
                    className={
                      isToday
                        ? "text-on-surface ring-primary/40 rounded-full px-1.5 font-semibold ring-2"
                        : "text-muted"
                    }
                  >
                    {d.getUTCDate()}
                  </span>
                </button>
                {hasEvents && (
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden" aria-hidden>
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={`${iso}-${e.label}`}
                        data-calendar-marker={e.kind}
                        className={
                          (e.kind === "academic"
                            ? "bg-event-academic-container text-on-event-academic-container "
                            : "bg-event-holiday-container text-on-event-holiday-container ") +
                          "block truncate rounded-sm px-1 py-px text-xs leading-tight"
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
              </div>
            );
          })}
        </div>

        {popoverDay && (
          <>
            <div
              className="bg-surface/60 fixed inset-0 z-40 sm:hidden"
              aria-hidden
              onClick={() => setPopoverDay(null)}
            />
            <div
              data-calendar-popover
              role="dialog"
              aria-label={`Events on ${formatFullDate(parseISODate(popoverDay))}`}
              className="bg-surface-container neu-panel fixed inset-x-0 bottom-0 z-50 rounded-t-2xl p-4 sm:static sm:mt-3 sm:rounded-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-muted text-xs">{formatFullDate(parseISODate(popoverDay))}</div>
                <button
                  type="button"
                  aria-label="Close popover"
                  onClick={() => setPopoverDay(null)}
                  className="focus-visible:ring-primary/40 text-muted hover:text-on-surface rounded-md p-1 transition-colors focus-visible:ring-2"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {popoverRows.map(({ key, row, event: e }) => (
                  <li
                    key={key}
                    data-event-row={row}
                    className={
                      e.kind === "academic"
                        ? "bg-event-academic-container text-on-event-academic-container rounded-md px-2 py-1.5"
                        : "bg-event-holiday-container text-on-event-holiday-container rounded-md px-2 py-1.5"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{e.label}</span>
                      <span aria-hidden className="font-mono text-xs tracking-wide uppercase opacity-70">
                        {e.kind}
                      </span>
                    </div>
                    {e.source_url && (
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-1 inline-flex min-h-9 min-w-11 items-center text-xs underline"
                        title="Open source"
                      >
                        Source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {error && (
          <div className="text-error text-xs" role="alert">
            {error.message}
          </div>
        )}
      </section>
    </div>
  );
}
