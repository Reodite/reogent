"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseExplorer } from "@/src/components/course-lookup/course-explorer";
import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-lookup/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import { Button } from "@/src/components/ui/button";
import { SelectInput } from "@/src/components/ui/form-controls";
import { courseCodeToSlug } from "@/src/lib/pane-route";
import { defaultSession, SESSIONS } from "@/src/server/course-records";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function SessionPicker({ session, onChange }: { session: string; onChange: (s: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="course-session" className="text-muted text-xs font-medium">
        Session
      </label>
      <SelectInput
        id="course-session"
        value={session}
        onChange={(e) => onChange(e.target.value)}
        controlSize="compact"
        width="auto"
      >
        {SESSIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

export function CourseLookupPane({ state, setState }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const api = useApi();
  const { mode } = useChatShell();
  const router = useRouter();
  const [code, setCode] = useState(((state.code as string | undefined) ?? "") as string);
  const [session, setSession] = useState<string>((state.session as string | undefined) ?? defaultSession());
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
  const lastPropSession = useRef(state.session);
  useEffect(() => {
    if (state.session !== lastPropSession.current) {
      lastPropSession.current = state.session;
      if (typeof state.session === "string") setSession(state.session);
    }
  }, [state.session]);

  // Stable identity: a fresh arrow each render would re-fire the hook's
  // debounced lookup effect on every render, an infinite reload loop.
  const resolveSingle = useCallback((c: string) => api.getCourse(c, session), [api, session]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(code, { resolveSingle });

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed) setState({ code: trimmed, session });
  }, [code, session, setState]);
  useEffect(() => {
    if (record) setState({ session });
  }, [record, session, setState]);

  // Tools mode splits the pane into two exclusive views driven by the URL:
  // /tools/courses renders the browse list; /tools/courses/<code> renders only
  // that course's details. AI mode keeps the search + detail flow.
  const toolsMode = mode === "tools";
  const propCode = typeof state.code === "string" ? state.code.trim() : "";
  const toolsDetail = toolsMode && propCode !== "";

  const openFromList = useCallback((c: string) => router.push(`/tools/courses/${courseCodeToSlug(c)}`), [router]);

  if (toolsMode && !toolsDetail) {
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col p-3">
        <CourseExplorer onSelect={openFromList} />
      </div>
    );
  }

  if (toolsDetail) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={() => {
              setCode("");
              router.push("/tools/courses");
            }}
          >
            <Icon name="left" size={14} /> All courses
          </Button>
          <SessionPicker session={session} onChange={setSession} />
        </div>
        {record ? (
          <div className="min-h-0 flex-1">
            <CourseDetailCard record={record} session={session} />
          </div>
        ) : (
          <div role="status" aria-busy="true" className="bg-surface-container-low flex flex-col gap-2 rounded-lg p-3">
            <span className="bg-surface-container h-5 w-32 animate-pulse rounded" />
            <span className="bg-surface-container h-3 w-64 animate-pulse rounded" />
            <span className="bg-surface-container h-24 w-full animate-pulse rounded" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <SessionPicker session={session} onChange={setSession} />
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
      {status === "loading" ? (
        <div role="status" aria-busy="true" className="bg-surface-container-low flex flex-col gap-2 rounded-lg p-3">
          <span className="bg-surface-container h-5 w-32 animate-pulse rounded" />
          <span className="bg-surface-container h-3 w-64 animate-pulse rounded" />
          <span className="bg-surface-container h-24 w-full animate-pulse rounded" />
        </div>
      ) : record ? (
        <CourseDetailCard record={record} session={session} />
      ) : null}
    </div>
  );
}
