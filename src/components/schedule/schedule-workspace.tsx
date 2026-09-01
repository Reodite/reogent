"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Mobile region selected within the shared schedule workspace. */
export type ScheduleWorkspaceView = "schedule" | "controls";

type ScheduleHost = "answer-canvas" | "tools" | "unity";

interface ScheduleWorkspaceProps {
  title: string;
  description: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  notice?: ReactNode;
  controlsLabel: string;
  controls: ReactNode;
  children: ReactNode;
  mobileView: ScheduleWorkspaceView;
  onMobileViewChange: (view: ScheduleWorkspaceView) => void;
}

/** Gives the planner and sharer one responsive header, rail, and week-canvas anatomy. */
export function ScheduleWorkspace({
  title,
  description,
  actions,
  toolbar,
  notice,
  controlsLabel,
  controls,
  children,
  mobileView,
  onMobileViewChange,
}: ScheduleWorkspaceProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [titlebarSlot, setTitlebarSlot] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<ScheduleHost>("tools");

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pane = root?.closest<HTMLElement>("[data-pane]") ?? null;
    const slot = root?.closest("section[data-pane]")?.querySelector<HTMLElement>("[data-pane-titlebar-slot]") ?? null;

    setTitlebarSlot(slot);
    setHost(slot ? "answer-canvas" : pane?.matches('[data-pane="unity"]') ? "unity" : "tools");
  }, []);

  const headerCanvas = (
    <div data-schedule-header-canvas className="flex min-w-0 items-center justify-between gap-4">
      {toolbar ? (
        <div data-schedule-toolbar className="min-w-0 flex-1 overflow-x-auto">
          {toolbar}
        </div>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {actions ? (
        <div data-schedule-actions className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      ref={rootRef}
      aria-label={title}
      data-mobile-view={mobileView}
      data-schedule-host={host}
      className="schedule-workspace h-full min-h-[34rem] w-full min-w-0 flex-1 overflow-hidden"
    >
      <div data-schedule-layout className="schedule-workspace-layout flex h-full min-h-0 flex-col gap-6 p-6">
        {titlebarSlot ? (
          createPortal(
            <div data-schedule-header className="min-w-0">
              {headerCanvas}
            </div>,
            titlebarSlot,
          )
        ) : (
          <header data-schedule-header className="grid shrink-0 grid-cols-[18rem_minmax(0,1fr)] items-start gap-6">
            <div data-schedule-header-context className="min-w-0">
              <h1 className="text-on-surface text-xl leading-tight font-medium tracking-[-0.02em]">{title}</h1>
              <p className="text-muted text-body-sm mt-1 leading-5">{description}</p>
            </div>
            {headerCanvas}
          </header>
        )}

        {notice}

        <div className="schedule-workspace-toggle neu-inset bg-surface-container-low shrink-0 gap-1 rounded-lg p-1">
          <button
            type="button"
            aria-pressed={mobileView === "schedule"}
            onClick={() => onMobileViewChange("schedule")}
            className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-3 text-sm font-medium focus-visible:ring-2 ${
              mobileView === "schedule" ? "bg-surface text-on-surface" : "text-on-surface-variant"
            }`}
          >
            Schedule
          </button>
          <button
            type="button"
            aria-pressed={mobileView === "controls"}
            onClick={() => onMobileViewChange("controls")}
            className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-3 text-sm font-medium focus-visible:ring-2 ${
              mobileView === "controls" ? "bg-surface text-on-surface" : "text-on-surface-variant"
            }`}
          >
            {controlsLabel}
          </button>
        </div>

        <div className="schedule-workspace-body grid min-h-0 min-w-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] gap-6">
          <aside data-schedule-aside className="schedule-workspace-controls min-h-0 min-w-0">
            {controls}
          </aside>
          <div data-schedule-canvas className="schedule-workspace-canvas min-h-0 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
