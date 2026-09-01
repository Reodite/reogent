"use client";

import { addMonths, parseISODate, startOfMonth, toISODate } from "@/src/shared/calendar/date-math";
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { useCallback, useEffect, useRef, useState } from "react";

export type CalendarEventsState =
  | { status: "loading"; events: []; error: null }
  | { status: "ready"; events: CalendarEvent[]; error: null }
  | { status: "refreshing"; events: CalendarEvent[]; error: null }
  | { status: "stale"; events: CalendarEvent[]; error: Error }
  | { status: "failed"; events: []; error: Error };

interface KeyedState {
  key: string;
  value: CalendarEventsState;
}

function loadingState(events?: CalendarEvent[]): CalendarEventsState {
  return events ? { status: "refreshing", events, error: null } : { status: "loading", events: [], error: null };
}

/** Loads one cursor+kinds calendar snapshot and preserves only same-key stale data. */
export function useCalendarEvents(cursor: string, kinds: string[]) {
  const kindsKey = kinds.slice().sort().join(",");
  const requestKey = `${cursor}|${kindsKey}`;
  const cacheRef = useRef(new Map<string, CalendarEvent[]>());
  const requestId = useRef(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<KeyedState>(() => ({ key: requestKey, value: loadingState() }));
  const retry = useCallback(() => setRefreshNonce((nonce) => nonce + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce triggers explicit Retry and visibility refresh requests.
  useEffect(() => {
    const cached = cacheRef.current.get(requestKey);
    const id = ++requestId.current;
    const controller = new AbortController();
    setSnapshot({ key: requestKey, value: loadingState(cached) });

    const monthStart = startOfMonth(parseISODate(`${cursor}-01`));
    const from = toISODate(monthStart);
    const to = toISODate(addMonths(monthStart, 12));

    void fetch(`/api/calendar?from=${from}&to=${to}&kinds=${encodeURIComponent(kindsKey)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Calendar route returned ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (id !== requestId.current || controller.signal.aborted) return;
        if (!Array.isArray(data)) throw new Error("Calendar route returned invalid data");
        const events = data as CalendarEvent[];
        cacheRef.current.set(requestKey, events);
        setSnapshot({ key: requestKey, value: { status: "ready", events, error: null } });
      })
      .catch((error: unknown) => {
        if (id !== requestId.current || controller.signal.aborted) return;
        const resolved = error instanceof Error ? error : new Error(String(error));
        const retained = cacheRef.current.get(requestKey);
        setSnapshot({
          key: requestKey,
          value: retained
            ? { status: "stale", events: retained, error: resolved }
            : { status: "failed", events: [], error: resolved },
        });
      });

    return () => controller.abort();
  }, [cursor, kindsKey, refreshNonce, requestKey]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) retry();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [retry]);

  const cached = cacheRef.current.get(requestKey);
  const state = snapshot.key === requestKey ? snapshot.value : loadingState(cached);
  return { state, retry };
}
