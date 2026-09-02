"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseExplorer } from "@/src/components/course-lookup/course-explorer";
import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-search/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { Button } from "@/src/components/ui/button";
import { RetryState } from "@/src/components/ui/feedback";
import { SelectInput } from "@/src/components/ui/form-controls";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import { courseCodeToSlug } from "@/src/lib/pane-route";
import { defaultSession, SESSIONS } from "@/src/server/course-records";
import { useCallback, useEffect, useRef, useState } from "react";

function SessionPicker({ session, onChange }: { session: string; onChange: (session: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="course-session" className="text-muted text-xs font-medium">
        Session
      </label>
      <SelectInput
        id="course-session"
        value={session}
        onChange={(event) => onChange(event.target.value)}
        controlSize="compact"
        width="auto"
      >
        {SESSIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

function CourseDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading course details" className="flex flex-col gap-2 p-3">
      <span className="bg-surface-container h-5 w-32 animate-pulse rounded" />
      <span className="bg-surface-container h-3 w-64 max-w-full animate-pulse rounded" />
      <span className="bg-surface-container h-24 w-full animate-pulse rounded" />
    </div>
  );
}

export function CourseLookupPane({
  state,
  setState,
}: {
  state: PaneState;
  setState: (state: Partial<PaneState>) => void;
}) {
  const api = useApi();
  const { mode, setActiveChannel } = useChatShell();
  const { push: navigate } = useShellNavigation();
  const [code, setCode] = useState(((state.code as string | undefined) ?? "") as string);
  const [session, setSession] = useState<string>((state.session as string | undefined) ?? defaultSession());

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

  const resolveSingle = useCallback((courseCode: string) => api.getCourse(courseCode, session), [api, session]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(code, { resolveSingle });

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed) setState({ code: trimmed, session });
  }, [code, session, setState]);
  useEffect(() => {
    if (record) setState({ session });
  }, [record, session, setState]);

  const toolsMode = mode === "tools";
  const propCode = typeof state.code === "string" ? state.code.trim() : "";
  const toolsDetail = toolsMode && propCode !== "";
  const openFromList = useCallback(
    (courseCode: string) => navigate(`/tools/courses/${courseCodeToSlug(courseCode)}`),
    [navigate],
  );
  const openPrereqs = useCallback(
    (courseCode: string) => {
      if (toolsMode) navigate(`/tools/prereq/${courseCodeToSlug(courseCode)}`);
      else setActiveChannel("prereq-tree", { root: courseCode, query: courseCode, selections: {} });
    },
    [navigate, setActiveChannel, toolsMode],
  );

  if (toolsMode && !toolsDetail) return <CourseExplorer onSelect={openFromList} />;

  if (toolsDetail) {
    const alternatives = list?.candidates ?? [];
    return (
      <WorkspacePage
        composition="single"
        title="Course lookup"
        description={`Review ${propCode} catalog details, grades, prerequisites, and sections.`}
        leading={
          <Button
            variant="ghost"
            size="denseIcon"
            onClick={() => {
              setCode("");
              navigate("/tools/courses");
            }}
            aria-label="Back to results"
            title="Back to results"
          >
            <Icon name="left" size={17} />
          </Button>
        }
        toolbar={<SessionPicker session={session} onChange={setSession} />}
      >
        <WorkspaceCanvas padding="md">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
            {status === "loading" ? (
              <CourseDetailSkeleton />
            ) : record ? (
              <CourseDetailCard record={record} session={session} onOpenPrereqs={openPrereqs} />
            ) : error ? (
              <RetryState
                title="Course unavailable"
                message={`${propCode} could not be loaded from the catalog.`}
                onRetry={() => lookup(code)}
                className="m-auto"
              />
            ) : (
              <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
                <div>
                  <h2 className="text-on-surface text-base font-medium">Course not found</h2>
                  <p className="text-on-surface-variant mt-1 text-sm">
                    {rejected
                      ? "Okanagan course codes are not in this catalog."
                      : `${propCode} is not available in this session.`}
                  </p>
                </div>
                {alternatives.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {alternatives.slice(0, 4).map((candidate) => (
                      <Button key={candidate.code} size="compact" onClick={() => openFromList(candidate.code)}>
                        {candidate.code}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </WorkspaceCanvas>
      </WorkspacePage>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
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
        <CourseDetailSkeleton />
      ) : record ? (
        <CourseDetailCard record={record} session={session} onOpenPrereqs={openPrereqs} />
      ) : null}
    </div>
  );
}
