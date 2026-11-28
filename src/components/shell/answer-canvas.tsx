"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { restorePaneTrigger } from "@/src/components/shell/pane-focus";
import { PANE_BY_ID } from "@/src/components/shell/pane-registry";
import { useWorkspaceHost, WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { CloseButton } from "@/src/components/ui/button";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import { RetryState } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { CanvasView, PaneId, PaneState } from "@/src/shared/panes";
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from "react";

/**
 * The AI Mode Answer Canvas: the idle map overview when no widget is active, or
 * the active widget's pane component. `view` is `workspaceView` passed by the
 * shell so the canvas stays pure and testable. Tools Mode mounts this without
 * the titlebar (`titlebar={false}`); panes that portal toolbar content into
 * the titlebar slot then fall back to their own in-pane chrome. `MapArea` reads its highlight and
 * focus nonce from the shell context (derived from `workspaceView` when the map
 * pane is active), so the idle and active-map paths both render `<MapArea>` and
 * differ only in the surrounding context.
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
        className={`flex h-full w-full flex-col overflow-hidden ${titlebar ? "neu-panel rounded-2xl max-sm:rounded-none max-sm:shadow-none" : ""}`}
      >
        {titlebar && (
          <AnswerCanvasTitlebar label={label} Glyph={PaneGlyph} onClose={onClose} onOutlet={setTitlebarOutlet} />
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-[inherit]">
          <ErrorBoundary key={paneId} fallback={<PaneError paneId={paneId} />}>
            <Suspense fallback={<PaneLoading label={label} />}>
              <PaneFocusReturn paneId={paneId}>
                <ActiveCanvasView view={view} />
              </PaneFocusReturn>
            </Suspense>
          </ErrorBoundary>
        </div>
      </section>
    </WorkspaceHostProvider>
  );
}

function PaneFocusReturn({ paneId, children }: { paneId: PaneId; children: React.ReactNode }) {
  useEffect(() => restorePaneTrigger(paneId), [paneId]);
  return children;
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
      <CloseButton label="Close" onClick={onClose} />
    </header>
  );
}

function ActiveCanvasView({ view }: { view: CanvasView }) {
  const { setWorkspaceView } = useChatShell();
  const entry = PANE_BY_ID[view.paneId];

  // Real setState: merges the pane's partial state back into `workspaceView`,
  // so course-lookup submit and calendar month-nav persist the canvas view
  // instead of hitting a no-op (the bug fixed here from `pane-host.tsx`).
  // `view.state` is tracked in a ref so setState identity stays stable across
  // workspaceView updates — otherwise panes that write back from inside their
  // own fetch effects (prereq tree, course lookup) re-fire the effect on every
  // callback identity change and never settle.
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
    <div className="h-full">
      <entry.Component state={view.state} setState={setState} />
    </div>
  );
}

function PaneLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={`Loading ${label}`} className="h-full p-4">
      <Skeleton aria-hidden="true" className="h-full w-full rounded-xl" />
    </div>
  );
}

function PaneError({ paneId }: { paneId: PaneId }) {
  const label = PANE_BY_ID[paneId].label;
  return (
    <RetryState
      title={`${label} unavailable`}
      message="Reload the page to try loading this tool again."
      retryLabel="Reload page"
      onRetry={() => window.location.reload()}
      className="min-h-full justify-center p-4"
    />
  );
}
