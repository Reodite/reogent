"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { MapArea } from "@/src/components/map/map-panel";
import { PANE_BY_ID, type CanvasView, type PaneState } from "@/src/components/shell/pane-registry";
import { useCallback, useRef } from "react";

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
  const onClose = () => {
    setRightPaneCollapsed(true);
    setAnswerSheetOpen(false);
    setUserDismissedPane(true);
  };
  if (view === null || !PANE_BY_ID[view.paneId]) return null;
  const paneId = view.paneId;
  const label = PANE_BY_ID[view.paneId].label;
  const isCanvas = paneId === "map" || paneId === "prereq-tree";
  return (
    <section
      aria-label={titlebar ? "Answer canvas" : label}
      data-pane={paneId}
      className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl"
    >
      {titlebar && <AnswerCanvasTitlebar label={label} onClose={onClose} />}
      {isCanvas ? (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <ActiveCanvasView view={view} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <ActiveCanvasView view={view} />
        </div>
      )}
    </section>
  );
}

function AnswerCanvasTitlebar({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <header className="flex h-15 shrink-0 items-center gap-2 px-4">
      <span className="bg-surface-container-low text-primary grid size-7 shrink-0 place-items-center rounded-lg">
        <Icon name="map" size={16} />
      </span>
      <h2 className="min-w-0 shrink-0 truncate text-base font-medium tracking-[-0.01em]">{label}</h2>
      {/* Panes may portal toolbar content (e.g. the prereq tree's course lookup)
          into this slot so the working area below keeps the full card height. */}
      <div data-pane-titlebar-slot className="relative z-30 min-w-0 flex-1" />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="focus-visible:ring-primary/40 text-on-surface-variant hover:bg-surface-container-high flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        <Icon name="close" size={18} />
      </button>
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

  if (view.paneId === "map") {
    return <MapArea />;
  }

  return (
    <div className="h-full">
      <entry.Component state={view.state} setState={setState} />
    </div>
  );
}
