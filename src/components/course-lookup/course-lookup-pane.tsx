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
import { LoadingStatus, RetryAlert, RetryState } from "@/src/components/ui/feedback";
import { SelectInput } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup, SkeletonText } from "@/src/components/ui/skeleton";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import { courseCodeToSlug } from "@/src/lib/pane-route";
import { defaultSession, SESSIONS } from "@/src/server/course-records";
import { canonicalize } from "@/src/shared/course-code";
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
    <SkeletonGroup label="Loading course details" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-5 w-80" />
        <SkeletonText className="py-1" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="neu-inset bg-surface-container-low flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2"
          >
            <Skeleton className="my-0.5 h-3 w-16" />
            <Skeleton className="my-1 h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mx-auto h-3 w-48" />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-1">
            <Skeleton className="my-0.5 h-3 w-24" />
            <Skeleton className="my-1 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="my-1 h-3 w-20" />
        {[0, 1].map((index) => (
          <div
            key={index}
            className="border-border-subtle bg-surface-container-low flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3"
          >
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
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
            size="icon"
            className="sm:size-11"
            onClick={() => {
              setCode("");
              navigate("/tools/courses");
            }}
            aria-label="Back to results"
            title="Back to results"
          >
            <Icon name="arrowLeft" size={20} />
          </Button>
        }
        toolbar={
          <div className="flex items-center gap-3">
            <SessionPicker session={session} onChange={setSession} />
            {record && status === "loading" ? (
              <LoadingStatus aria-label="Updating course details">Updating…</LoadingStatus>
            ) : null}
          </div>
        }
      >
        <WorkspaceCanvas padding="md">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
            {record ? (
              <div aria-busy={status === "loading"} className="flex flex-col gap-3">
                {error ? (
                  <RetryAlert onRetry={() => lookup(code)}>
                    Couldn't refresh course details. Showing the previous record.
                  </RetryAlert>
                ) : null}
                <CourseDetailCard record={record} session={session} onOpenPrereqs={openPrereqs} />
              </div>
            ) : status === "loading" ? (
              <CourseDetailSkeleton />
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
                  <Heading as="h2" size="section">
                    Course not found
                  </Heading>
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
    <div data-course-lookup-embedded className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
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
        record={record}
        loadingFallback={
          canonicalize(code)?.kind === "code" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CourseDetailSkeleton />
            </div>
          ) : undefined
        }
      />
      {record ? (
        <section
          data-course-detail-scroll
          aria-label="Course details"
          aria-busy={status === "loading"}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long course records.
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <CourseDetailCard record={record} session={session} onOpenPrereqs={openPrereqs} />
        </section>
      ) : null}
    </div>
  );
}
