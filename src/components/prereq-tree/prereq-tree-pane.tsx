"use client";

import "reactflow/dist/style.css";
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
import { CourseSearchField, type Candidate } from "@/src/components/course-search/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import { Button } from "@/src/components/ui/button";
import { LoadingStatus, RetryAlert } from "@/src/components/ui/feedback";
import { InlineAction } from "@/src/components/ui/inline-action";
import { announce } from "@/src/components/ui/live-region";
import {
  WorkspaceCanvas,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceRail,
  type WorkspaceView,
} from "@/src/components/ui/workspace";
import { isOkanagan } from "@/src/shared/course-code";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ReactFlow, {
  Background,
  getNodesBounds,
  getViewportForBounds,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type NodeChange,
  type Rect,
} from "reactflow";
import {
  buildGraph,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  isNoneOrEmpty,
  MIN_ZOOM,
  normalize,
  suggestionPrefix,
  type CourseIndex,
  type Graph,
} from "./build-graph";
import { OptionalEdge } from "./edges/OptionalEdge";
import { CourseNode } from "./nodes/CourseNode";
import { DropdownDisjunctionNode, StackedDisjunctionNode } from "./nodes/DisjunctionNode";

const NODE_TYPES = {
  course: CourseNode,
  dropdown: DropdownDisjunctionNode,
  radio: StackedDisjunctionNode,
};

const EDGE_TYPES = { optional: OptionalEdge };

/** Frames `bounds` (defaulting to every node) and snaps the camera there — no
 *  animation. The canvas bleeds left under the sidebar (`canvas-extend-sidebar`),
 *  so that strip is measured off and the graph is fitted into what the card
 *  actually shows; the offset is zero when the canvas isn't extended. */
function useFitGraph() {
  const { getNodes, setViewport } = useReactFlow();
  const store = useStoreApi();
  return useCallback(
    (bounds?: Rect) => {
      const { width, height, minZoom, domNode } = store.getState();
      if (!width || !height) return;
      const rect = bounds ?? getNodesBounds(getNodes());
      if (!rect.width || !rect.height) return;
      const host = domNode?.closest(".canvas-extend-sidebar");
      const hidden = host?.parentElement
        ? host.parentElement.getBoundingClientRect().left - host.getBoundingClientRect().left
        : 0;
      const fit = getViewportForBounds(rect, width - hidden, height, minZoom, FIT_MAX_ZOOM, FIT_PADDING);
      setViewport({ x: fit.x + hidden, y: fit.y, zoom: fit.zoom });
    },
    [getNodes, setViewport, store],
  );
}

/** Auto-fit on root-course change, so every course is framed. Bounds come from
 *  the layout's own bbox rather than ReactFlow's node rects, which lag a frame
 *  behind the measured relayout and would fit a partial graph. `fitKey` re-fires
 *  the fit on root change and once that relayout has settled; selection flips
 *  must not re-fit, so `bbox` rides a ref instead of being a dep. */
function FitOnChange({ bbox, fitKey, onFitted }: { bbox: Graph["bbox"]; fitKey: string; onFitted: () => void }) {
  const fitGraph = useFitGraph();
  // Readiness gate: nodes measured means the canvas has a size to fit into.
  const nodesInitialized = useNodesInitialized();
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey deliberately re-fires the fit without depending on `bbox` (selection flips must not re-fit).
  useEffect(() => {
    const b = bboxRef.current;
    if (!b || !nodesInitialized) return;
    fitGraph({ x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY });
    // Reveal a frame later: setViewport lands in React Flow's own render pass,
    // so flipping `awaitingFit` in this one can paint the graph before the
    // camera moves — the flash this gate exists to prevent.
    requestAnimationFrame(() => onFitted());
  }, [fitKey, nodesInitialized, fitGraph, onFitted]);
  return null;
}

type CtxMenu = { x: number; y: number; code?: string };

/** Right-click menu for the canvas. Card menus (a `code` present) offer course
 *  actions; empty-canvas menus offer the navigation basics. Rendered inside the
 *  ReactFlowProvider so the zoom/fit actions reach the canvas instance. */
function TreeContextMenu({
  menu,
  onClose,
  onOpenFinder,
  onAskAi,
  aiLocked,
}: {
  menu: CtxMenu;
  onClose: () => void;
  onOpenFinder: (code: string) => void;
  /** Sends the whole rendered tree to the AI as an attachment. */
  onAskAi: () => void;
  /** AI chat is guest-locked; render the Ask AI item disabled with a lock. */
  aiLocked: boolean;
}) {
  const { zoomIn, zoomOut } = useReactFlow();
  const fitGraph = useFitGraph();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const itemClass =
    "hover:bg-surface-container-high focus-visible:ring-primary/40 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:ring-2";
  return (
    <div
      ref={menuRef}
      role="menu"
      data-tree-context-menu
      style={{ left: menu.x, top: menu.y }}
      className="neu-raised bg-surface text-on-surface absolute z-30 min-w-[200px] rounded-lg p-1"
    >
      {menu.code ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onOpenFinder(menu.code as string);
              onClose();
            }}
          >
            <Icon name="search" size={16} className="text-on-surface-variant" />
            Open in Course Finder
          </button>
          {aiLocked ? (
            <button
              type="button"
              role="menuitem"
              disabled
              aria-disabled="true"
              title="Sign in to use AI chat"
              className="text-on-surface flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm opacity-45"
            >
              <Icon name="chat1" size={16} className="text-on-surface-variant" />
              Ask AI about this tree
              <Icon name="lock" size={13} className="text-on-surface-variant ml-auto" />
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onAskAi();
                onClose();
              }}
            >
              <Icon name="chat1" size={16} className="text-on-surface-variant" />
              Ask AI about this tree
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled
            aria-disabled="true"
            title="Schedule building is coming soon"
            className="text-on-surface flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm opacity-45"
          >
            <Icon name="calendar" size={16} className="text-on-surface-variant" />
            Add to Schedule
            <Icon name="lock" size={13} className="text-on-surface-variant ml-auto" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              zoomIn({ duration: 150 });
              onClose();
            }}
          >
            <Icon name="zoomIn" size={16} className="text-on-surface-variant" />
            Zoom in
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              zoomOut({ duration: 150 });
              onClose();
            }}
          >
            <Icon name="zoomOut" size={16} className="text-on-surface-variant" />
            Zoom out
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              fitGraph();
              onClose();
            }}
          >
            <Icon name="fullscreen" size={16} className="text-on-surface-variant" />
            Fit view
          </button>
        </>
      )}
    </div>
  );
}

class PaneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("prereq-tree pane crashed", error, info);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function NotFoundAlert({ code, onPick }: { code: string; onPick: (code: string) => void }) {
  return (
    <p
      role="alert"
      className="border-error/30 bg-error-container text-on-error-container rounded-lg border px-3 py-2 text-sm"
    >
      {code} isn't in the catalog. Try <InlineAction onClick={() => onPick("CPSC 110")}>CPSC 110</InlineAction> or{" "}
      <InlineAction onClick={() => onPick("MATH 200")}>MATH 200</InlineAction>.
    </p>
  );
}

/** Keyboard-navigable accordion fallback when the canvas crashes. Children of
 *  a block are the sources of edges targeting it (edges flow prereq → dependent). */
function AccordionFallback({ graph, rootId }: { graph: { nodes: Node[]; edges: Edge[] }; rootId: string }) {
  const childrenOf = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = adj.get(e.target);
      if (list) list.push(e.source);
      else adj.set(e.target, [e.source]);
    }
    return adj;
  }, [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const seen = new Set<string>();
  const renderNode = (id: string): ReactNode => {
    if (seen.has(id)) return null;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return null;
    const data = node.data as { code?: string; title?: string; text?: string };
    const kids = childrenOf.get(id) ?? [];
    return (
      <details key={id} className="ml-3 text-sm">
        <summary className="cursor-pointer font-mono">
          {data.code ?? data.text ?? id}
          {data.title ? ` — ${data.title}` : ""}
        </summary>
        {kids.map(renderNode)}
      </details>
    );
  };
  return <div className="text-on-surface overflow-auto">{renderNode(rootId)}</div>;
}

export function PrereqTreePane({
  initialRoot = "",
  initialQuery,
  initialSelections,
  initialSoftDisabled,
  onChangeRoot,
  onUiState,
  onNavigateCourse,
}: {
  initialRoot?: string;
  initialQuery?: string;
  initialSelections?: Record<string, number>;
  initialSoftDisabled?: Record<string, boolean>;
  onChangeRoot?: (root: string) => void;
  /** Reports the restorable UI state (typed query, disjunction selections,
   *  soft toggles) so the host can cache it across unmounts. */
  onUiState?: (patch: {
    query: string;
    selections: Record<string, number>;
    softDisabled: Record<string, boolean>;
  }) => void;
  onNavigateCourse?: (code: string) => void;
}) {
  const api = useApi();
  const [index, setIndex] = useState<CourseIndex | null>(null);
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState(initialQuery || initialRoot);
  const [activeCode, setActiveCode] = useState<string | null>(initialRoot ? normalize(initialRoot) : null);
  // Last submitted code that wasn't in the catalog (drives the not-found alert).
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<WorkspaceView>(initialRoot ? "main" : "rail");
  // Per-disjunction selections keyed `${ownerCode}::${path}` — stable across
  // re-renders and root switches; absent key = option 0. Hydrated from the
  // cached pane state so a rebuilt tree keeps its chosen branches.
  const [selections, setSelections] = useState<Map<string, number>>(
    () => new Map(Object.entries(initialSelections ?? {})),
  );
  // Per-soft-branch toggles keyed `${ownerCode}::${path}.soft`; absent =
  // expanded, true = block faded + upstream not loaded.
  const [softDisabled, setSoftDisabled] = useState<Map<string, boolean>>(
    () => new Map(Object.entries(initialSoftDisabled ?? {})),
  );

  // Report restorable UI state upward whenever it changes. `onUiState` rides a
  // ref so an unstable callback identity can't re-fire the effect.
  const onUiStateRef = useRef(onUiState);
  onUiStateRef.current = onUiState;
  useEffect(() => {
    onUiStateRef.current?.({
      query,
      selections: Object.fromEntries(selections),
      softDisabled: Object.fromEntries(softDisabled),
    });
  }, [query, selections, softDisabled]);

  const [loadNonce, setLoadNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadNonce re-triggers the fetch from the Retry button.
  useEffect(() => {
    let cancelled = false;
    setIndexStatus("loading");
    api
      .getCourseIndex()
      .then(({ courses }) => {
        if (cancelled) return;
        setIndex(new Map(courses.map((c) => [c.code, c])));
        setIndexStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setIndexStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api, loadNonce]);

  const setSelection = useCallback((key: string, idx: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(key, idx);
      return next;
    });
    announce(`Prereq selection updated: option ${idx + 1}`);
  }, []);

  const toggleSoft = useCallback((key: string) => {
    setSoftDisabled((prev) => {
      const next = new Map(prev);
      next.set(key, !(prev.get(key) ?? false));
      return next;
    });
  }, []);

  // Sorted codes for the type-ahead; lexicographic keeps numbers grouped
  // under each subject.
  const codes = useMemo(() => (index ? [...index.keys()].sort() : []), [index]);

  const suggestions = useMemo<Candidate[]>(() => {
    if (!index) return [];
    const prefix = suggestionPrefix(query);
    if (!prefix) return [];
    const matches: Candidate[] = [];
    for (const code of codes) {
      if (!code.startsWith(prefix)) continue;
      const [subject = "", number = ""] = code.split(/\s+/, 2);
      matches.push({ code, subject, number, title: index.get(code)?.title ?? "" });
    }
    return matches;
  }, [codes, index, query]);

  const activate = useCallback(
    (code: string) => {
      setActiveCode(code);
      setMissingCode(null);
      setMobileView("main");
      onChangeRoot?.(code);
    },
    [onChangeRoot],
  );

  const pickSuggestion = useCallback(
    (code: string) => {
      setQuery(code);
      activate(code);
    },
    [activate],
  );

  const rejected = isOkanagan(query.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!index || rejected) return;
    const code = normalize(query);
    if (index.has(code)) activate(code);
    else {
      setActiveCode(null);
      setMissingCode(code);
    }
  }

  // Real rendered node heights, reported by React Flow's measurement pass.
  // Layout runs first on text-length estimates, then re-runs with the exact
  // heights so vertical centering is precise (a plain chain sits perfectly
  // level). Heights are keyed by node id and only updated on a real change,
  // so the measure → relayout cycle settles after one pass.
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(() => new Map());
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const dims = changes.filter((c) => c.type === "dimensions" && c.dimensions?.height);
    if (dims.length === 0) return;
    // Deferred out of React Flow's internal measurement dispatch: swapping the
    // whole node array synchronously mid-cycle can glitch a frame on
    // selection changes.
    setTimeout(() => {
      setMeasuredHeights((prev) => {
        let next: Map<string, number> | null = null;
        for (const c of dims) {
          if (c.type !== "dimensions" || !c.dimensions?.height) continue;
          if (Math.abs((prev.get(c.id) ?? 0) - c.dimensions.height) > 0.5) {
            if (!next) next = new Map(prev);
            next.set(c.id, c.dimensions.height);
          }
        }
        return next ?? prev;
      });
    }, 0);
  }, []);

  const graph = useMemo(() => {
    if (!index || !activeCode) return { nodes: [], edges: [], depthCount: 0, bbox: null } satisfies Graph;
    return buildGraph(
      activeCode,
      index,
      selections,
      setSelection,
      softDisabled,
      toggleSoft,
      onNavigateCourse,
      measuredHeights,
    );
  }, [index, activeCode, selections, setSelection, softDisabled, toggleSoft, onNavigateCourse, measuredHeights]);

  const rootEntry = index && activeCode ? (index.get(activeCode) ?? null) : null;
  const noPrereqs = rootEntry && isNoneOrEmpty(rootEntry.prerequisite) && isNoneOrEmpty(rootEntry.corequisite);

  // Re-fit the camera once per root after every node has a real measured
  // height (the measured relayout can shift the graph). Latched per root so
  // later selection flips — which add new, briefly-unmeasured nodes — don't
  // yank the camera around.
  const fullyMeasured = graph.nodes.length > 0 && graph.nodes.every((n) => measuredHeights.has(n.id));
  const measuredLatchRef = useRef<{ root: string | null; latched: boolean }>({ root: null, latched: false });
  if (measuredLatchRef.current.root !== activeCode) measuredLatchRef.current = { root: activeCode, latched: false };
  if (fullyMeasured) measuredLatchRef.current.latched = true;
  const fitKey = `${activeCode ?? ""}:${measuredLatchRef.current.latched}`;

  // React Flow paints a frame at its default zoom-1 viewport before the fit
  // effect can snap the camera, which reads as a zoomed-in, off-centre flash.
  // Hold the graph invisible until the first fit for this root lands.
  const [fittedRoot, setFittedRoot] = useState<string | null>(null);
  const onFitted = useCallback(() => setFittedRoot(activeCode), [activeCode]);
  const awaitingFit = graph.nodes.length > 0 && fittedRoot !== activeCode;

  // Right-click context menu: on a course card (course actions) or the empty
  // canvas (navigation basics). Coordinates are relative to the pane root.
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const openCtxMenu = useCallback(
    (e: { clientX: number; clientY: number; preventDefault: () => void }, code?: string) => {
      e.preventDefault();
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setCtxMenu({
        x: Math.max(0, Math.min(e.clientX - r.left, r.width - 210)),
        y: Math.max(0, Math.min(e.clientY - r.top, r.height - 150)),
        code,
      });
    },
    [],
  );
  const onNodeContextMenu = useCallback(
    (e: MouseEvent, node: Node) => {
      const code = node.type === "course" ? (node.data as { code?: string }).code : undefined;
      openCtxMenu(e, code);
    },
    [openCtxMenu],
  );
  const onPaneContextMenu = useCallback((e: MouseEvent) => openCtxMenu(e), [openCtxMenu]);

  const shell = useChatShellOptional();
  const { isGuest } = useAppAuth();
  // setActiveChannel (not setWorkspaceView) so only `code` is overridden and
  // the finder's cached state (e.g. session pick) survives the jump.
  const openInFinder = useCallback((code: string) => shell?.setActiveChannel("course-lookup", { code }), [shell]);
  // Serialize the rendered tree for the agent: nodes keep their identifying
  // fields (course code/title, disjunction options), edges keep direction and
  // the co-req/optional markers. Sent as an Ask AI attachment so the chat
  // shows a file bubble while the agent reads the JSON appended to the prompt.
  const askAiAboutTree = useCallback(() => {
    const nodes = graph.nodes.map((n) => {
      const d = n.data as {
        code?: string;
        title?: string;
        text?: string;
        coreq?: boolean;
        options?: { display: string }[];
        selectedIdx?: number;
      };
      return {
        id: n.id,
        type: n.type,
        ...(d.code ? { code: d.code } : {}),
        ...(d.title ? { title: d.title } : {}),
        ...(d.text ? { text: d.text } : {}),
        ...(d.coreq ? { coreq: true } : {}),
        ...(d.options ? { options: d.options.map((o) => o.display), selected: d.selectedIdx } : {}),
      };
    });
    const edges = graph.edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(e.label ? { label: String(e.label) } : {}),
      ...(e.type === "optional" ? { optional: true } : {}),
    }));
    shell?.askAi("Take a look at this course tree:", {
      title: "Course Prerequisite Tree",
      content: JSON.stringify(
        { root: activeCode, note: "Edges point from a prerequisite to the course that requires it.", nodes, edges },
        null,
        1,
      ),
    });
  }, [shell, graph, activeCode]);

  const { host, titlebarOutlet } = useWorkspaceHost();
  const toolsMode = host === "tools";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchShadowOn = titlebarOutlet ? "surface" : toolsMode ? "surface" : "surface-container-low";

  const searchForm = (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md items-start gap-2">
      <div className="min-w-0 flex-1">
        <CourseSearchField
          value={query}
          onChange={(value) => setQuery(value.toUpperCase())}
          onSelect={pickSuggestion}
          status={indexStatus === "loading" ? "loading" : "idle"}
          list={query.trim() ? { candidates: suggestions, total: suggestions.length } : null}
          error={null}
          rejected={rejected}
          placeholder="e.g. CPSC 320"
          ariaLabel="Root course code"
          presentation="overlay"
          density={toolsMode ? "primary" : "rail"}
          shadowOn={searchShadowOn}
        />
      </div>
      <Button type="submit" variant="primary" size={toolsMode ? "field" : "toolbar"} shadowOn={searchShadowOn}>
        Show
      </Button>
    </form>
  );

  const feedback = (
    <>
      {indexStatus === "loading" ? <LoadingStatus>Loading course index…</LoadingStatus> : null}
      {indexStatus === "error" ? (
        <RetryAlert onRetry={() => setLoadNonce((nonce) => nonce + 1)}>Couldn't load the tree.</RetryAlert>
      ) : null}
      {indexStatus === "ready" && missingCode ? <NotFoundAlert code={missingCode} onPick={pickSuggestion} /> : null}
      {indexStatus === "ready" && activeCode && !rootEntry ? (
        <NotFoundAlert code={activeCode} onPick={pickSuggestion} />
      ) : null}
      {noPrereqs ? (
        <p className="text-muted bg-surface rounded-lg px-3 py-1.5 text-sm">
          {activeCode} has no prerequisites or corequisites listed in the calendar.
        </p>
      ) : null}
    </>
  );

  const graphSurface = (
    <div ref={rootRef} data-pane="prereq-tree" className="relative h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <div data-prereq-canvas className="bg-surface-container-low absolute inset-0">
          {graph.nodes.length > 0 ? (
            <PaneErrorBoundary fallback={<AccordionFallback graph={graph} rootId={activeCode ?? ""} />}>
              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                nodesDraggable={false}
                nodesConnectable={false}
                onNodesChange={onNodesChange}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                onPaneClick={closeCtxMenu}
                onMoveStart={closeCtxMenu}
                minZoom={MIN_ZOOM}
                nodesFocusable
                elementsSelectable
                proOptions={{ hideAttribution: true }}
                className={awaitingFit ? "opacity-0" : undefined}
              >
                <Background color="var(--border)" gap={16} />
                <FitOnChange bbox={graph.bbox} fitKey={fitKey} onFitted={onFitted} />
              </ReactFlow>
            </PaneErrorBoundary>
          ) : indexStatus === "ready" && !missingCode && !activeCode ? (
            <div className="text-muted grid h-full place-items-center px-6 text-center text-sm">
              Choose a course in Controls to render its prerequisite graph.
            </div>
          ) : null}
        </div>
        {ctxMenu ? (
          <TreeContextMenu
            menu={ctxMenu}
            onClose={closeCtxMenu}
            onOpenFinder={openInFinder}
            onAskAi={askAiAboutTree}
            aiLocked={isGuest}
          />
        ) : null}
      </ReactFlowProvider>
    </div>
  );

  if (toolsMode) {
    return (
      <WorkspacePage
        composition="split"
        title="Prereq tree"
        description="Trace prerequisites and corequisites from any course."
        view={mobileView}
        onViewChange={setMobileView}
        mainLabel="Graph"
        railLabel="Controls"
        rail={
          <WorkspaceRail>
            <WorkspacePanel title="Find a course" description="Choose the graph root" padding="md">
              <div className="flex flex-col gap-3">
                {searchForm}
                <p className="text-muted text-xs">Search a Vancouver course code, then choose a result or Show.</p>
                {feedback}
              </div>
            </WorkspacePanel>
          </WorkspaceRail>
        }
      >
        <WorkspaceCanvas overflow="hidden">{graphSurface}</WorkspaceCanvas>
      </WorkspacePage>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {graphSurface}
      {titlebarOutlet ? (
        createPortal(searchForm, titlebarOutlet)
      ) : (
        <div className="absolute top-3 right-3 left-3 z-20">{searchForm}</div>
      )}
      <div
        className={`pointer-events-none absolute right-3 left-3 z-10 mx-auto flex max-w-md flex-col gap-2 ${
          titlebarOutlet ? "top-3" : "top-16"
        } [&>*]:pointer-events-auto`}
      >
        {feedback}
      </div>
    </div>
  );
}
