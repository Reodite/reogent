"use client";

import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WorkspaceView = "main" | "rail";

type WorkspaceBaseProps = {
  title: string;
  description?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
  titlebarActions?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
};

type SplitWorkspaceProps = WorkspaceBaseProps & {
  composition: "split";
  rail: ReactNode;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  mainLabel: string;
  railLabel: string;
};

type UnsplitWorkspaceProps = WorkspaceBaseProps & {
  composition: "single" | "canvas";
  rail?: never;
  view?: never;
  onViewChange?: never;
  mainLabel?: never;
  railLabel?: never;
};

export type WorkspacePageProps = SplitWorkspaceProps | UnsplitWorkspaceProps;

/** Renders the fixed page, header, rail, and compact-view contract for app workspaces. */
export function WorkspacePage(props: WorkspacePageProps) {
  const { host, menuClearance, titlebarOutlet } = useWorkspaceHost();
  const embedded = host === "answer-canvas";
  const mainId = useId();
  const railId = useId();
  const split = props.composition === "split";
  const internalActions = embedded && props.titlebarActions ? null : props.actions;
  const controls = props.toolbar || internalActions;

  return (
    <section
      aria-label={props.title}
      data-workspace-page
      data-workspace-composition={props.composition}
      data-workspace-host={host}
      data-menu-clearance={menuClearance || undefined}
      data-workspace-view={split ? props.view : undefined}
      className="workspace-page h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      {embedded && titlebarOutlet && props.titlebarActions
        ? createPortal(
            <div data-workspace-titlebar-actions className="flex min-w-0 items-center justify-end gap-2">
              {props.titlebarActions}
            </div>,
            titlebarOutlet,
          )
        : null}

      <div className="workspace-page-layout flex h-full min-h-0 flex-col gap-4 p-6">
        {!embedded ? (
          <header data-workspace-header className="relative z-30 flex shrink-0 flex-col gap-3">
            <div className="min-w-0">
              <h1 className="text-on-surface text-xl leading-tight font-medium tracking-[-0.02em]">{props.title}</h1>
              {props.description ? <p className="text-muted text-body-sm mt-1 leading-5">{props.description}</p> : null}
            </div>
            {controls ? <WorkspaceHeaderControls toolbar={props.toolbar} actions={internalActions} /> : null}
          </header>
        ) : props.toolbar || internalActions ? (
          <WorkspaceHeaderControls toolbar={props.toolbar} actions={internalActions} embedded />
        ) : null}

        {props.notice}

        {split ? (
          <fieldset
            data-workspace-view-toggle
            className="workspace-page-toggle neu-inset bg-surface-container-low shrink-0 gap-1 rounded-lg p-1"
          >
            <legend className="sr-only">{props.title} view</legend>
            <button
              type="button"
              aria-pressed={props.view === "main"}
              aria-controls={mainId}
              onClick={() => props.onViewChange("main")}
              className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-3 text-sm font-medium focus-visible:ring-2 ${
                props.view === "main" ? "neu-raised bg-surface text-primary" : "text-on-surface-variant"
              }`}
            >
              {props.mainLabel}
            </button>
            <button
              type="button"
              aria-pressed={props.view === "rail"}
              aria-controls={railId}
              onClick={() => props.onViewChange("rail")}
              className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-3 text-sm font-medium focus-visible:ring-2 ${
                props.view === "rail" ? "neu-raised bg-surface text-primary" : "text-on-surface-variant"
              }`}
            >
              {props.railLabel}
            </button>
          </fieldset>
        ) : null}

        <div className="workspace-page-body grid min-h-0 min-w-0 flex-1 gap-4">
          {split ? (
            <aside
              id={railId}
              aria-label={props.railLabel}
              data-workspace-region="rail"
              className="workspace-page-region min-h-0 min-w-0"
            >
              {props.rail}
            </aside>
          ) : null}
          <div id={mainId} data-workspace-region="main" className="workspace-page-region min-h-0 min-w-0">
            {props.children}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkspaceHeaderControls({
  toolbar,
  actions,
  embedded = false,
}: {
  toolbar?: ReactNode;
  actions?: ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      data-workspace-header-controls
      className={`flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 ${embedded ? "" : "w-full"}`}
    >
      {toolbar ? (
        <div data-workspace-toolbar className="min-w-0 flex-1 overflow-x-auto">
          {toolbar}
        </div>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {actions ? (
        <div data-workspace-actions className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Stacks contextual panels as equal, independently bounded rail regions. */
export function WorkspaceRail({ children }: { children: ReactNode }) {
  return <div className="workspace-rail flex h-full min-h-0 flex-col gap-4">{children}</div>;
}

const PANEL_PADDING_CLASSES = {
  none: "p-0",
  sm: "p-2",
  md: "p-3",
} as const;

interface WorkspacePanelProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  bodyMode?: "scroll" | "contained";
  padding?: keyof typeof PANEL_PADDING_CLASSES;
  children: ReactNode;
}

/** Renders one raised contextual panel with a fixed header and bounded body. */
export function WorkspacePanel({
  title,
  description,
  actions,
  bodyMode = "scroll",
  padding = "md",
  children,
}: WorkspacePanelProps) {
  const headingId = useId();
  return (
    <section
      data-workspace-panel
      aria-labelledby={headingId}
      className="neu-panel bg-surface flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={headingId} className="text-on-surface shrink-0 text-sm font-medium">
            {title}
          </h2>
          {description ? <p className="text-muted min-w-0 truncate text-xs">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div
        data-workspace-panel-body
        className={`border-border-subtle min-h-0 min-w-0 flex-1 border-t ${PANEL_PADDING_CLASSES[padding]} ${
          bodyMode === "scroll" ? "[scrollbar-gutter:stable] overflow-y-auto" : "overflow-hidden"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

const CANVAS_PADDING_CLASSES = {
  none: "p-0",
  sm: "p-2",
  md: "p-4",
} as const;

export type WorkspaceCanvasProps = Omit<ComponentPropsWithoutRef<"div">, "className" | "style"> & {
  overflow?: "auto" | "hidden";
  padding?: keyof typeof CANVAS_PADDING_CLASSES;
};

/** Renders the shared inset data canvas with fixed material and scroll variants. */
export function WorkspaceCanvas({ overflow = "auto", padding = "none", children, ...props }: WorkspaceCanvasProps) {
  return (
    <div
      data-workspace-canvas
      className={`border-border bg-surface-container-low/40 relative flex h-full min-h-0 min-w-0 flex-col rounded-xl border ${
        CANVAS_PADDING_CLASSES[padding]
      } ${overflow === "auto" ? "overflow-auto" : "overflow-hidden"}`}
      {...props}
    >
      {children}
    </div>
  );
}
