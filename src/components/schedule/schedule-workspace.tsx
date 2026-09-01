"use client";

import type { ReactNode } from "react";

/** Mobile region selected within the shared schedule workspace. */
export type ScheduleWorkspaceView = "schedule" | "controls";

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
  return (
    <section
      aria-label={title}
      data-mobile-view={mobileView}
      className="schedule-workspace flex h-full min-h-[34rem] w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6 max-sm:gap-3 max-sm:p-3"
    >
      <header className="flex shrink-0 flex-col gap-3 max-xl:pl-12">
        <div className="flex min-w-0 items-start justify-between gap-4 max-sm:flex-col max-sm:gap-2">
          <div className="min-w-0">
            <h1 className="text-on-surface text-xl leading-tight font-medium tracking-[-0.02em]">{title}</h1>
            <p className="text-muted mt-1 text-sm leading-relaxed">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
        {toolbar ? <div className="min-w-0 overflow-x-auto">{toolbar}</div> : null}
      </header>

      {notice}

      <div className="schedule-workspace-toggle neu-inset bg-surface-container-low shrink-0 rounded-xl p-1">
        <button
          type="button"
          aria-pressed={mobileView === "schedule"}
          onClick={() => onMobileViewChange("schedule")}
          className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-lg px-3 text-sm font-medium focus-visible:ring-2 ${
            mobileView === "schedule" ? "neu-raised bg-surface text-on-surface" : "text-on-surface-variant"
          }`}
        >
          Schedule
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "controls"}
          onClick={() => onMobileViewChange("controls")}
          className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-lg px-3 text-sm font-medium focus-visible:ring-2 ${
            mobileView === "controls" ? "neu-raised bg-surface text-on-surface" : "text-on-surface-variant"
          }`}
        >
          {controlsLabel}
        </button>
      </div>

      <div className="schedule-workspace-body grid min-h-0 min-w-0 flex-1 grid-cols-[19rem_minmax(0,1fr)] gap-4">
        <aside className="schedule-workspace-controls neu-panel bg-surface min-h-0 min-w-0 [scrollbar-gutter:stable] overflow-y-auto rounded-2xl">
          {controls}
        </aside>
        <div className="schedule-workspace-canvas neu-panel bg-surface min-h-0 min-w-0 overflow-hidden rounded-2xl">
          {children}
        </div>
      </div>
    </section>
  );
}
