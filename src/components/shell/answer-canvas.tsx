"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { MapArea } from "@/src/components/map/map-panel";
import { PANE_BY_ID, type CanvasView, type PaneState } from "@/src/components/shell/pane-registry";
import { useCallback, useRef } from "react";

/**
 * The AI Mode Answer Canvas: the idle map overview when no widget is active, or
 * the active widget's pane component. `view` is `workspaceView` passed by the
 * shell so the canvas stays pure and testable. `MapArea` reads its highlight and
 * focus nonce from the shell context (derived from `workspaceView` when the map
 * pane is active), so the idle and active-map paths both render `<MapArea>` and
 * differ only in the surrounding context.
 */
export function AnswerCanvas({ view }: { view: CanvasView | null }) {
  if (view === null) return <AnswerCanvasIdle />;
  return <ActiveCanvasView view={view} />;
}

/**
 * Map-first idle: highlight is null because `workspaceView` is null.  Renders
 * the same full-bleed `<MapArea>` shell as the active-map path — no `neu-panel`
 * frame, since the map is content (idle overview OR a focused highlight), not a
 * contained card. Non-map panes get the framed `.neu-panel` treatment; the map
 * intentionally does not, to keep its viewport edge-to-edge.
 */
function AnswerCanvasIdle() {
  return (
    <section aria-label="Answer canvas" data-pane="map" className="h-full w-full">
      <MapArea />
    </section>
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

  // Unknown pane id (e.g. a future pane not yet registered): fall back to the
  // idle map so the canvas never blanks. A no-op transition, not an error.
  if (!entry) return <AnswerCanvasIdle />;

  if (view.paneId === "map") {
    return (
      <section aria-label="Answer canvas" data-pane="map" className="h-full w-full">
        <MapArea />
      </section>
    );
  }

  return (
    <section
      aria-label="Answer canvas"
      data-pane={view.paneId}
      className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="bg-surface-container-low text-primary grid size-7 shrink-0 place-items-center rounded-lg">
          <entry.icon className="size-4" />
        </span>
        <h2 className="text-base font-medium tracking-[-0.01em]">{entry.label}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <entry.Component state={view.state} setState={setState} />
      </div>
    </section>
  );
}
