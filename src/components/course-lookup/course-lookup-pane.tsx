"use client";

import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-lookup/course-search";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import { useCallback, useEffect, useRef, useState } from "react";

export function CourseLookupPane({ state, setState }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const api = useApi();
  const [code, setCode] = useState(((state.code as string | undefined) ?? "") as string);
  // Sync when a widget or the map drives the pane to a different course code.
  // Compares against the last-seen state.code so typing locally never gets
  // clobbered back to the prop (in tests, setState is mocked and state.code
  // never advances, so a naive diff would revert the input on every keystroke).
  const lastPropCode = useRef(state.code);
  useEffect(() => {
    if (state.code !== lastPropCode.current) {
      lastPropCode.current = state.code;
      if (typeof state.code === "string") setCode(state.code);
    }
  }, [state.code]);
  // Stable identity: a fresh arrow each render would re-fire the hook's
  // debounced lookup effect on every render, an infinite reload loop.
  const resolveSingle = useCallback((c: string) => api.getCourse(c), [api]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(code, { resolveSingle });

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed) setState({ code: trimmed });
  }, [code, setState]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <CourseSearchField
        value={code}
        onChange={setCode}
        onSelect={setCode}
        onRetry={() => lookup(code)}
        status={status}
        list={list}
        error={error}
        rejected={rejected}
      />
      {record && <CourseDetailCard record={record} />}
    </div>
  );
}
