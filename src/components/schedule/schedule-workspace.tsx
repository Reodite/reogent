"use client";

import {
  WorkspaceCanvas,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceRail,
  type WorkspaceView,
} from "@/src/components/ui/workspace";
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

/** Adapts planner and sharer content to the shared contextual workspace. */
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
  const view: WorkspaceView = mobileView === "schedule" ? "main" : "rail";

  return (
    <WorkspacePage
      composition="split"
      title={title}
      description={description}
      toolbar={toolbar}
      actions={actions}
      titlebarActions={actions}
      notice={notice}
      view={view}
      onViewChange={(next) => onMobileViewChange(next === "main" ? "schedule" : "controls")}
      mainLabel="Schedule"
      railLabel={controlsLabel}
      rail={
        <WorkspaceRail>
          <WorkspacePanel title={controlsLabel} bodyMode="contained" padding="none">
            {controls}
          </WorkspacePanel>
        </WorkspaceRail>
      }
    >
      <WorkspaceCanvas overflow="hidden" padding="sm">
        {children}
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
