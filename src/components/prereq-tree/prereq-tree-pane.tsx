"use client";

import "reactflow/dist/style.css";
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
import { CourseSearchField, type Candidate } from "@/src/components/course-search/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import { Button } from "@/src/components/ui/button";
import { LoadingStatus, RetryAlert } from "@/src/components/ui/feedback";
import { InlineAction } from "@/src/components/ui/inline-action";
import { announce } from "@/src/components/ui/live-region";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import { courseCodeToSlug } from "@/src/lib/pane-route";
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

/** Frames `bounds` (defaulting to every node) and snaps the camera there without animation. */
function useFitGraph() {
  const { getNodes, setViewport } = useReactFlow();
  const store = useStoreApi();
  return useCallback(
    (bounds?: Rect) => {
      const { width, height, minZoom } = store.getState();
      if (!width || !height) return;
      const rect = bounds ?? getNodesBounds(getNodes());
      if (!rect.width || !rect.height) return;
      setViewport(getViewportForBounds(rect, width, height, minZoom, FIT_MAX_ZOOM, FIT_PADDING));
    },
    [getNodes, setViewport, store],
  );
}

/** Centers the root when its measured layout settles so the primary course opens in view. */
function FitOnChange({
  bbox,
  rootBounds,
  fitKey,
  onFitted,
}: {
  bbox: Graph["bbox"];
  rootBounds: Rect | null;
  fitKey: string;
  onFitted: () => void;
}) {
  const fitGraph = useFitGraph();
  // Readiness gate: nodes measured means the canvas has a size to fit into.
  const nodesInitialized = useNodesInitialized();
  const boundsRef = useRef({ bbox, rootBounds });
  boundsRef.current = { bbox, rootBounds };
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey re-fires without tracking bounds because branch changes must not move the camera.
  useEffect(() => {
    const current = boundsRef.current;
    if (!current.bbox || !nodesInitialized) return;
    fitGraph(
      current.rootBounds ?? {
        x: current.bbox.minX,
        y: current.bbox.minY,
        width: current.bbox.maxX - current.bbox.minX,
        height: current.bbox.maxY - current.bbox.minY,
      },
    );
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

/** Keyboard-navigable prerequisite outline and crash fallback. */
function AccordionFallback({
  graph,
  rootId,
  onOpenCourse,
}: {
  graph: { nodes: Node[]; edges: Edge[] };
  rootId: string;
  onOpenCourse?: (code: string) => void;
}) {
  const childrenOf = useMemo(() => {
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const children = adjacency.get(edge.target);
      if (children) children.push(edge.source);
      else adjacency.set(edge.target, [edge.source]);
    }
    return adjacency;
  }, [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const seen = new Set<string>();
  const renderNode = (id: string): ReactNode => {
    if (seen.has(id)) return null;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return null;
    const data = node.data as {
      code?: string;
      title?: string;
      text?: string;
      options?: { display: string }[];
      selectedIdx?: number;
      onChange?: (index: number) => void;
    };
    const children = childrenOf.get(id) ?? [];
    const label = data.code ?? data.text ?? (data.options ? "Choose one prerequisite" : id);
    return (
      <details key={id} open={id === rootId} className="border-border-subtle bg-surface rounded-lg border text-sm">
        <summary className="text-on-surface flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2">
          <span className="font-mono font-medium">{label}</span>
          {data.title ? <span className="text-on-surface-variant min-w-0 truncate">{data.title}</span> : null}
        </summary>
        <div className="border-border-subtle flex flex-col gap-2 border-t p-2 pl-4">
          {data.code && onOpenCourse ? (
            <Button size="compact" className="self-start" onClick={() => onOpenCourse(data.code as string)}>
              Open course details
            </Button>
          ) : null}
          {data.options && data.onChange ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Choose a prerequisite branch</legend>
              {data.options.map((option, index) => (
                <button
                  key={option.display}
                  type="button"
                  aria-pressed={index === data.selectedIdx}
                  onClick={() => data.onChange?.(index)}
                  className={`focus-visible:ring-primary/40 min-h-11 rounded-lg px-3 py-2 text-left focus-visible:ring-2 ${
                    index === data.selectedIdx
                      ? "neu-inset bg-surface-container text-on-surface"
                      : "text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  {option.display}
                </button>
              ))}
            </fieldset>
          ) : null}
          {children.map(renderNode)}
        </div>
      </details>
    );
  };
  return (
    <div data-prereq-outline className="text-on-surface flex h-full flex-col gap-2 overflow-auto p-3">
      {renderNode(rootId)}
    </div>
  );
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
  const { host, titlebarOutlet } = useWorkspaceHost();
  const toolsMode = host === "tools";
  const { push: navigate } = useShellNavigation();
  const shell = useChatShellOptional();
  const { isGuest } = useAppAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [index, setIndex] = useState<CourseIndex | null>(null);
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState(initialQuery || initialRoot);
  const [activeCode, setActiveCode] = useState<string | null>(initialRoot ? normalize(initialRoot) : null);
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const [compactView, setCompactView] = useState<"outline" | "map">("outline");
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

  const lastInitialRoot = useRef(initialRoot);
  useEffect(() => {
    if (initialRoot === lastInitialRoot.current) return;
    lastInitialRoot.current = initialRoot;
    const nextRoot = initialRoot ? normalize(initialRoot) : null;
    setActiveCode(nextRoot);
    setQuery(nextRoot ?? "");
    setMissingCode(null);
  }, [initialRoot]);

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
      onChangeRoot?.(code);
      if (toolsMode) navigate(`/tools/prereq/${courseCodeToSlug(code)}`);
    },
    [navigate, onChangeRoot, toolsMode],
  );

  const pickSuggestion = useCallback(
    (code: string) => {
      setQuery(code);
      activate(code);
    },
    [activate],
  );

  const changeQuery = useCallback(
    (value: string) => {
      const next = value.toUpperCase();
      setQuery(next);
      if (next.trim() || !activeCode) return;
      setActiveCode(null);
      setMissingCode(null);
      onChangeRoot?.("");
      if (toolsMode) navigate("/tools/prereq");
    },
    [activeCode, navigate, onChangeRoot, toolsMode],
  );

  const openInFinder = useCallback(
    (code: string) => {
      if (toolsMode) navigate(`/tools/courses/${courseCodeToSlug(code)}`);
      else shell?.setActiveChannel("course-lookup", { code });
    },
    [navigate, shell, toolsMode],
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
      onNavigateCourse ?? openInFinder,
      measuredHeights,
    );
  }, [
    index,
    activeCode,
    selections,
    setSelection,
    softDisabled,
    toggleSoft,
    onNavigateCourse,
    openInFinder,
    measuredHeights,
  ]);

  const rootEntry = index && activeCode ? (index.get(activeCode) ?? null) : null;
  const noPrereqs = rootEntry && isNoneOrEmpty(rootEntry.prerequisite) && isNoneOrEmpty(rootEntry.corequisite);
  const rootNode = graph.nodes.find((node) => node.id === activeCode);
  const rootBounds: Rect | null = rootNode
    ? {
        x: rootNode.position.x,
        y: rootNode.position.y,
        width: Number(rootNode.style?.width) || rootNode.width || 300,
        height: measuredHeights.get(rootNode.id) || rootNode.height || 120,
      }
    : null;

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

  const searchShadowOn = titlebarOutlet ? "surface" : toolsMode ? "surface" : "surface-container-low";

  const searchForm = (
    <form onSubmit={submit} className={`flex w-full items-start gap-2 ${toolsMode ? "max-w-xl" : "mx-auto max-w-md"}`}>
      <div className="min-w-0 flex-1">
        <CourseSearchField
          value={query}
          onChange={changeQuery}
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
          inputRef={searchInputRef}
          openOnInitialValue={false}
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
      {noPrereqs && !toolsMode ? (
        <p className="text-muted bg-surface rounded-lg px-3 py-1.5 text-sm">
          {activeCode} has no prerequisites or corequisites listed in the calendar.
        </p>
      ) : null}
    </>
  );

  const noRootState = (
    <div className="text-muted grid h-full place-items-center px-6 text-center text-sm">
      Search for a course above to render its prerequisite tree.
    </div>
  );
  const noPrereqState = (
    <div className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
      <div>
        <h2 className="text-on-surface text-base font-medium">{activeCode} has no listed prerequisites</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          The UBC calendar does not list prerequisites or corequisites for this course.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => activeCode && openInFinder(activeCode)}>Open course details</Button>
        <Button
          variant="outline"
          onClick={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }}
        >
          Search another course
        </Button>
      </div>
    </div>
  );

  const graphSurface = (
    <div ref={rootRef} data-pane="prereq-tree" className="relative h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <div data-prereq-canvas className="bg-surface-container-low absolute inset-0">
          {toolsMode && noPrereqs ? (
            noPrereqState
          ) : graph.nodes.length > 0 ? (
            <PaneErrorBoundary
              fallback={<AccordionFallback graph={graph} rootId={activeCode ?? ""} onOpenCourse={openInFinder} />}
            >
              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                nodesDraggable={false}
                nodesConnectable={false}
                onNodesChange={onNodesChange}
                onNodeClick={(_event, node) => {
                  const code = node.type === "course" ? (node.data as { code?: string }).code : undefined;
                  if (code) openInFinder(code);
                }}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                onPaneClick={closeCtxMenu}
                onMoveStart={closeCtxMenu}
                minZoom={MIN_ZOOM}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable
                proOptions={{ hideAttribution: true }}
                className={awaitingFit ? "invisible" : "prereq-graph-ready"}
              >
                <Background color="var(--border)" gap={16} />
                <FitOnChange bbox={graph.bbox} rootBounds={rootBounds} fitKey={fitKey} onFitted={onFitted} />
              </ReactFlow>
            </PaneErrorBoundary>
          ) : indexStatus === "ready" && !missingCode && !activeCode ? (
            noRootState
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

  const outlineSurface = noPrereqs ? (
    noPrereqState
  ) : graph.nodes.length > 0 ? (
    <AccordionFallback graph={graph} rootId={activeCode ?? ""} onOpenCourse={openInFinder} />
  ) : (
    noRootState
  );

  if (toolsMode) {
    return (
      <WorkspacePage
        composition="canvas"
        title="Prereq tree"
        description="Choose a course, then trace the prerequisites and corequisites that lead to it."
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-2 @min-[40rem]:flex-row @min-[40rem]:items-start">
            {searchForm}
            <fieldset
              data-prereq-view-toggle
              className="neu-inset bg-surface-container-low flex shrink-0 gap-1 rounded-lg p-1 @min-[40rem]:hidden"
            >
              <legend className="sr-only">Prerequisite tree view</legend>
              {(["outline", "map"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={compactView === view}
                  onClick={() => setCompactView(view)}
                  className={`focus-visible:ring-primary/40 min-h-11 flex-1 rounded-md px-4 text-sm font-medium capitalize focus-visible:ring-2 ${
                    compactView === view ? "neu-raised bg-surface text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {view}
                </button>
              ))}
            </fieldset>
          </div>
          <div data-prereq-feedback className="min-h-5 shrink-0">
            {feedback}
          </div>
          <div data-prereq-compact-view={compactView} className="min-h-0 flex-1">
            <WorkspaceCanvas overflow="hidden">
              <div className={compactView === "outline" ? "h-full @min-[40rem]:hidden" : "hidden"}>
                {outlineSurface}
              </div>
              <div className={compactView === "map" ? "h-full" : "hidden h-full @min-[40rem]:block"}>
                {graphSurface}
              </div>
            </WorkspaceCanvas>
          </div>
        </div>
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
