"use client";

import { addMonths, parseISODate, startOfMonth, toISODate } from "@/src/shared/calendar/date-math";
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { useEffect, useRef, useState } from "react";

/** Per-instance cache of the calendar route's response for a cursor+kinds pair.
 * Stale-while-revalidate, silent revalidation on focus, falls back to the
 * last good snapshot on network error. Lifted only if a second consumer appears. */
export function useCalendarEvents(cursor: string, kinds: string[]) {
  const kindsKey = kinds.slice().sort().join(",");
  const [events, setEvents] = useState<CalendarEvent[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const lastGood = useRef<CalendarEvent[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const monthStart = startOfMonth(parseISODate(`${cursor}-01`));
    const from = toISODate(monthStart);
    const to = toISODate(addMonths(monthStart, 12));
    fetch(`/api/calendar?from=${from}&to=${to}&kinds=${encodeURIComponent(kindsKey)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Calendar route returned ${r.status}`);
        return r.json() as Promise<CalendarEvent[]>;
      })
      .then((data) => {
        if (cancelled) return;
        lastGood.current = data;
        setEvents(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, kindsKey]);

  // Focus silent revalidation — refetch without flipping the visible snapshot
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) setEvents((cur) => cur);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return {
    events: events ?? lastGood.current,
    error,
    isLoading: !lastGood.current && !events && !error,
  };
}
