"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { PANE_BY_ID } from "@/src/components/shell/pane-registry";
import { WorkspaceRouteLoading } from "@/src/components/shell/shell-loading";
import { useWorkspaceHost, WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { Button } from "@/src/components/ui/button";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import { RetryState } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import type { CanvasView, PaneId, PaneState } from "@/src/shared/panes";
import { Suspense, useCallback, useRef, useState, type ComponentType } from "react";

/**
 * Renders the selected tool and its loading or recovery state. Tools mode omits
 * the titlebar so panes use their own chrome. The map reads highlights and focus
 * from shell context; other panes receive their persisted state as props.
 */
export function AnswerCanvas({ view, titlebar = true }: { view: CanvasView | null; titlebar?: boolean }) {
  const { setRightPaneCollapsed, setAnswerSheetOpen, setUserDismissedPane } = useChatShell();
  const { navigation } = useWorkspaceHost();
  const [titlebarOutlet, setTitlebarOutlet] = useState<HTMLElement | null>(null);
  const onClose = () => {
    setRightPaneCollapsed(true);
    setAnswerSheetOpen(false);
    setUserDismissedPane(true);
  };
  if (view === null || !PANE_BY_ID[view.paneId]) return null;
  const paneId = view.paneId;
  const { label, icon: PaneGlyph } = PANE_BY_ID[view.paneId];

  return (
    <WorkspaceHostProvider
      host={titlebar ? "answer-canvas" : "tools"}
      navigation={titlebar ? null : navigation}
      titlebarOutlet={titlebarOutlet}
    >
      <section
        aria-label={titlebar ? "Answer canvas" : undefined}
        data-pane={paneId}
        className={`flex h-full w-full flex-col overflow-hidden ${titlebar ? "neu-panel rounded-2xl" : ""}`}
      >
        {titlebar && (
          <AnswerCanvasTitlebar label={label} Glyph={PaneGlyph} onClose={onClose} onOutlet={setTitlebarOutlet} />
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-[inherit]">
          <ActiveCanvasView view={view} />
        </div>
      </section>
    </WorkspaceHostProvider>
  );
}

function AnswerCanvasTitlebar({
  label,
  Glyph,
  onClose,
  onOutlet,
}: {
  label: string;
  Glyph: ComponentType<{ className?: string }>;
  onClose: () => void;
  onOutlet: (outlet: HTMLDivElement | null) => void;
}) {
  return (
    <header className="flex h-15 shrink-0 items-center gap-2 px-4">
      <span className="bg-surface-container-low text-primary grid size-7 shrink-0 place-items-center rounded-lg">
        <Glyph className="size-4" />
      </span>
      <Heading className="min-w-0 shrink-0 truncate">{label}</Heading>
      <div ref={onOutlet} data-pane-titlebar-slot className="relative z-30 min-w-0 flex-1" />
      <Button aria-label="Close" onClick={onClose} variant="ghost" size="icon">
        <Icon name="close" size={18} />
      </Button>
    </header>
  );
}

function ActiveCanvasView({ view }: { view: CanvasView }) {
  const { setWorkspaceView } = useChatShell();
  const entry = PANE_BY_ID[view.paneId];

  // Merge into current state without changing callback identity and restarting
  // pane fetch effects when they write state back to the shell.
  const stateRef = useRef(view.state);
  stateRef.current = view.state;
  const setState = useCallback(
    (patch: Partial<PaneState>) => {
      setWorkspaceView({ paneId: view.paneId, state: { ...stateRef.current, ...patch } });
    },
    [setWorkspaceView, view.paneId],
  );

  // Unknown pane id (e.g. a future pane not yet registered): render nothing.
  // AnswerCanvas already guards this case before mounting the view.
  if (!entry) return null;

  return (
    <ErrorBoundary key={view.paneId} fallback={<PaneFallback paneId={view.paneId} failed />}>
      <Suspense fallback={<PaneFallback paneId={view.paneId} />}>
        <div className="h-full">
          <entry.Component state={view.state} setState={setState} />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}

function PaneFallback({ paneId, failed = false }: { paneId: PaneId; failed?: boolean }) {
  const { host } = useWorkspaceHost();
  const embedded = host === "answer-canvas";
  const { label } = PANE_BY_ID[paneId];
  if (!failed) {
    return embedded ? (
      <SkeletonGroup label={`Loading ${label}`} className="h-full p-4">
        <Skeleton className="h-full w-full rounded-xl" />
      </SkeletonGroup>
    ) : (
      <WorkspaceRouteLoading
        label={`Loading ${label}`}
        composition={["map", "degree-planner", "schedule", "calendar"].includes(paneId) ? "split" : "single"}
        controls={["degree-planner", "schedule", "calendar"].includes(paneId)}
      />
    );
  }
  const recovery = (
    <RetryState
      title={`${label} unavailable`}
      message="Reload the page to try loading this tool again."
      retryLabel="Reload page"
      onRetry={() => window.location.reload()}
      className="min-h-full justify-center p-4"
    />
  );
  return embedded ? (
    recovery
  ) : (
    <WorkspacePage title={label} composition="canvas">
      <WorkspaceCanvas>{recovery}</WorkspaceCanvas>
    </WorkspacePage>
  );
}
