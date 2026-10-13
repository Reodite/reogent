"use client";

import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WorkspaceView = "main" | "rail";

type WorkspaceBaseProps = {
  title: string;
  loading?: boolean;
  description?: ReactNode;
  leading?: ReactNode;
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

/** Keeps navigation above workspace content that scrolls when vertical space runs short. */
export function WorkspacePage(props: WorkspacePageProps) {
  const { host, navigation, titlebarOutlet } = useWorkspaceHost();
  const shellNavigation = useShellNavigation();
  const embedded = host === "answer-canvas";
  const pending = !embedded && shellNavigation.pending;
  const reduce = useReducedMotion();
  const mainId = useId();
  const railId = useId();
  const split = props.composition === "split";
  const activeView = split ? props.view : null;
  const toggleRef = useRef<HTMLFieldSetElement>(null);
  const mainToggleRef = useRef<HTMLButtonElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const mainRegionRef = useRef<HTMLDivElement>(null);
  const railRegionRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef(activeView);
  const lastFocusedRegionRef = useRef<WorkspaceView | null>(null);
  const internalActions = embedded && props.titlebarActions ? null : props.actions;
  const controls = props.toolbar || internalActions;

  useEffect(() => {
    const previousView = previousViewRef.current;
    previousViewRef.current = activeView;
    if (!split || !activeView || !previousView || previousView === activeView) return;
    const toggle = toggleRef.current;
    if (!toggle || window.getComputedStyle(toggle).display === "none") return;

    const incomingRegion = activeView === "main" ? mainRegionRef.current : railRegionRef.current;
    const animation = reduce
      ? undefined
      : incomingRegion?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    const hiddenRegion = previousView === "main" ? mainRegionRef.current : railRegionRef.current;
    const activeElement = document.activeElement;
    const focusWasHidden = !!hiddenRegion && activeElement instanceof Node && hiddenRegion.contains(activeElement);
    const focusWasDropped =
      (activeElement === document.body || activeElement === document.documentElement) &&
      lastFocusedRegionRef.current === previousView;
    if (focusWasHidden || focusWasDropped) {
      lastFocusedRegionRef.current = null;
      (activeView === "main" ? mainToggleRef.current : railToggleRef.current)?.focus();
    }
    return () => animation?.cancel();
  }, [activeView, split, reduce]);

  return (
    <section
      aria-label={props.title}
      role={props.loading ? "status" : undefined}
      data-workspace-route-loading={props.loading || undefined}
      data-workspace-page
      data-workspace-composition={props.composition}
      data-workspace-host={host}
      data-workspace-view={activeView ?? undefined}
      className="workspace-page flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      {embedded && titlebarOutlet && props.titlebarActions
        ? createPortal(
            <div data-workspace-titlebar-actions className="flex min-w-0 items-center justify-end gap-2">
              {props.titlebarActions}
            </div>,
            titlebarOutlet,
          )
        : null}

      {!embedded ? (
        <header data-workspace-header className="workspace-page-header relative z-30 shrink-0 px-6 pt-6 pb-4">
          <div data-workspace-heading className="flex min-w-0 items-start gap-2 sm:gap-1.5">
            {navigation}
            {props.leading ? (
              <div data-workspace-leading className="flex h-7 shrink-0 items-center">
                {props.leading}
              </div>
            ) : null}
            <div className="min-w-0">
              <Heading as="h1" size="title" className="flex min-h-7 items-center">
                {props.loading ? (
                  <>
                    <span className="sr-only">{props.title}</span>
                    <Skeleton className="h-6 w-40" />
                  </>
                ) : (
                  props.title
                )}
              </Heading>
              {props.description ? <p className="text-muted text-body-sm mt-1 leading-5">{props.description}</p> : null}
            </div>
          </div>
        </header>
      ) : null}

      <div data-workspace-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="workspace-page-layout flex h-full min-h-min flex-col gap-4 p-6">
          {controls ? (
            <WorkspaceHeaderControls
              toolbar={props.toolbar}
              actions={internalActions}
              pending={pending}
              embedded={embedded}
            />
          ) : null}

          {props.notice ? <div inert={pending || undefined}>{props.notice}</div> : null}

          {split && props.loading ? (
            <div
              data-workspace-view-toggle
              aria-hidden="true"
              className="workspace-page-toggle neu-inset bg-surface-container-low shrink-0 gap-1 rounded-lg p-1"
            >
              <Skeleton className="h-11 flex-1 rounded-sm" />
              <Skeleton className="h-11 flex-1 rounded-sm" />
            </div>
          ) : split ? (
            <fieldset
              ref={toggleRef}
              inert={pending || undefined}
              data-workspace-view-toggle
              className="workspace-page-toggle neu-inset bg-surface-container-low shrink-0 gap-1 rounded-lg p-1"
            >
              <legend className="sr-only">{props.title} view</legend>
              <button
                ref={mainToggleRef}
                type="button"
                aria-pressed={props.view === "main"}
                aria-controls={mainId}
                onClick={() => props.onViewChange("main")}
                className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-sm px-3 text-sm font-medium focus-visible:ring-2 ${
                  props.view === "main" ? "neu-raised bg-surface text-primary" : "text-on-surface-variant"
                }`}
              >
                {props.mainLabel}
              </button>
              <button
                ref={railToggleRef}
                type="button"
                aria-pressed={props.view === "rail"}
                aria-controls={railId}
                onClick={() => props.onViewChange("rail")}
                className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-sm px-3 text-sm font-medium focus-visible:ring-2 ${
                  props.view === "rail" ? "neu-raised bg-surface text-primary" : "text-on-surface-variant"
                }`}
              >
                {props.railLabel}
              </button>
            </fieldset>
          ) : null}

          <div inert={pending || undefined} className="workspace-page-body grid min-h-80 min-w-0 flex-1 gap-4">
            {split ? (
              <aside
                ref={railRegionRef}
                id={railId}
                aria-label={props.railLabel}
                data-workspace-region="rail"
                onFocusCapture={() => {
                  lastFocusedRegionRef.current = "rail";
                }}
                className="workspace-page-region min-h-0 min-w-0"
              >
                {props.rail}
              </aside>
            ) : null}
            <div
              ref={mainRegionRef}
              id={mainId}
              data-workspace-region="main"
              onFocusCapture={() => {
                lastFocusedRegionRef.current = "main";
              }}
              className="workspace-page-region min-h-0 min-w-0"
            >
              {props.children}
            </div>
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
  pending = false,
}: {
  toolbar?: ReactNode;
  actions?: ReactNode;
  embedded?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      data-workspace-header-controls
      inert={pending || undefined}
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
        <div
          data-workspace-actions
          className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 @min-[55rem]:w-auto @min-[55rem]:shrink-0"
        >
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
  md: "p-4",
} as const;

interface WorkspacePanelProps {
  title: string;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  bodyMode?: "scroll" | "contained";
  padding?: keyof typeof PANEL_PADDING_CLASSES;
  children: ReactNode;
}

/** Renders a contextual region with a fixed header and bounded body. */
export function WorkspacePanel({
  title,
  description,
  leading,
  actions,
  bodyMode = "scroll",
  padding = "md",
  children,
}: WorkspacePanelProps) {
  const headingId = useId();
  return (
    <section
      data-workspace-panel
      data-workspace-panel-leading={leading ? true : undefined}
      aria-labelledby={headingId}
      className="neu-panel bg-surface flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl"
    >
      <header className={`flex shrink-0 items-center justify-between gap-2 px-4 ${leading ? "min-h-15" : "h-12"}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          {leading}
          <div className="flex min-w-0 items-baseline gap-2">
            <Heading id={headingId} size="subsection" className="shrink-0">
              {title}
            </Heading>
            {description ? <p className="text-muted min-w-0 truncate text-xs">{description}</p> : null}
          </div>
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
  frame: "p-0.5",
  sm: "p-2",
  md: "p-4",
} as const;

export type WorkspaceCanvasProps = Omit<ComponentPropsWithoutRef<"div">, "className" | "style"> & {
  overflow?: "auto" | "hidden";
  padding?: keyof typeof CANVAS_PADDING_CLASSES;
};

/** Renders a data canvas with shared responsive material and scroll variants. */
export function WorkspaceCanvas({ overflow = "auto", padding = "none", children, ...props }: WorkspaceCanvasProps) {
  return (
    <div
      data-workspace-canvas
      className={`neu-inset neu-shadow-on-surface bg-surface-container-low focus-visible:ring-primary/40 relative flex h-full min-h-0 min-w-0 flex-col rounded-2xl focus-visible:ring-2 focus-visible:ring-inset ${
        CANVAS_PADDING_CLASSES[padding]
      } ${overflow === "auto" ? "overflow-auto" : "overflow-hidden"}`}
      {...props}
    >
      {children}
    </div>
  );
}
