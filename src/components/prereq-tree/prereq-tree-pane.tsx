"use client";

import "reactflow/dist/style.css";
import { useApi } from "@/src/components/providers";
import { announce } from "@/src/components/ui/live-region";
import type { PrereqGraph, PrereqNode } from "@/src/server/prereq/build-graph";
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import ReactFlow, { type Edge, type Node } from "reactflow";
import { DisjunctionDetailStrip, type DisjunctionDetail } from "./DisjunctionDetailStrip";
import { HardEdge } from "./edges/HardEdge";
import { OptionalEdge } from "./edges/OptionalEdge";
import { CourseNode } from "./nodes/CourseNode";
import { DropdownDisjunctionNode, StackedDisjunctionNode } from "./nodes/DisjunctionNode";
import type { SelectionKeyMap } from "./selection-key";
import { visibleGraph } from "./soft-hide";

// ponytail: naive BFS column layout (x = depth*240, y = per-column counter). dagre
// would pack tighter but adds a dep; fitView zooms to fit. Revisit if columns look sparse.
const COLUMN_W = 240;
const ROW_H = 110;
const DEBOUNCE_MS = 250;

function layoutNodes(
  nodes: PrereqNode[],
  edges: PrereqGraph["edges"],
  rootId: string,
): Map<string, { x: number; y: number }> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const d = depth.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      if (!depth.has(nb)) {
        depth.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }
  const counter = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const y = counter.get(d) ?? 0;
    counter.set(d, y + 1);
    pos.set(n.id, { x: d * COLUMN_W, y: y * ROW_H });
  }
  return pos;
}

function optionDisplay(n: PrereqNode): string {
  if (n.variant === "unknown") return "(not in calendar)";
  if (n.variant === "known" && n.title) return n.title;
  return n.label;
}

const NODE_TYPES = {
  course: CourseNode,
  coreq: CourseNode,
  literal: CourseNode,
  dropdown: DropdownDisjunctionNode,
  radio: StackedDisjunctionNode,
};

const EDGE_TYPES = { optional: OptionalEdge, hard: HardEdge };

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
    <p role="alert" className="border-error/30 bg-error-container/30 text-error rounded-lg border px-3 py-2 text-sm">
      {code} isn't in the catalog. Try{" "}
      <button type="button" className="text-primary underline" onClick={() => onPick("CPSC 110")}>
        CPSC 110
      </button>{" "}
      or{" "}
      <button type="button" className="text-primary underline" onClick={() => onPick("MATH 200")}>
        MATH 200
      </button>
      .
    </p>
  );
}

function AccordionFallback({ graph }: { graph: PrereqGraph }) {
  const childrenOf = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = adj.get(e.source);
      if (list) list.push(e.target);
      else adj.set(e.source, [e.target]);
    }
    return adj;
  }, [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const root = graph.nodes.find((n) => n.variant === "root");
  if (!root) return <p className="text-muted text-sm">Tree unavailable.</p>;
  const seen = new Set<string>();
  const renderNode = (id: string): ReactNode => {
    if (seen.has(id)) return null;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return null;
    const kids = childrenOf.get(id) ?? [];
    return (
      <details key={id} className="ml-3 text-sm">
        <summary className="cursor-pointer font-mono">
          {node.code ?? node.label}
          {node.title ? ` — ${node.title}` : ""}
        </summary>
        {kids.map(renderNode)}
      </details>
    );
  };
  return <div className="text-on-surface overflow-auto">{renderNode(root.id)}</div>;
}

export function PrereqTreePane({
  initialRoot = "CPSC 320",
  onChangeRoot,
  onNavigateCourse,
}: {
  initialRoot?: string;
  onChangeRoot?: (root: string) => void;
  onNavigateCourse?: (code: string) => void;
}) {
  const api = useApi();
  const [root, setRoot] = useState(initialRoot);
  const [code, setCode] = useState(initialRoot);
  const [graph, setGraph] = useState<PrereqGraph | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selections, setSelections] = useState<SelectionKeyMap>({});
  // Soft-toggle state (REQ-10.2): `softToggles[path]` flips the wrapped
  // subtree's hard descendant edges on/off via `visibleGraph`. The soft's
  // incoming edges + block stay (the pill re-enables).
  const [softToggles, setSoftToggles] = useState<Record<string, 0 | 1>>({});

  useEffect(() => {
    if (!root) {
      setGraph(null);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setGraph(null);
    api
      .getPrereqTree(root)
      .then((g) => {
        if (cancelled) return;
        setGraph(g);
        setStatus("ready");
        onChangeRoot?.(root);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [root, api, onChangeRoot]);

  // Live debounced: typing changes `code`; after DEBOUNCE_MS, push to `root`
  // to (re)fetch the tree.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = code.trim();
      if (trimmed && trimmed !== root) setRoot(trimmed);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [code, root]);

  const onSelect = useCallback((selectionKey: string, index: number) => {
    setSelections((prev) => ({ ...prev, [selectionKey]: index }));
    announce(`Prereq selection updated: option ${index + 1}`);
  }, []);

  const onToggle = useCallback((path: string) => {
    setSoftToggles((prev) => ({ ...prev, [path]: prev[path] === 0 ? 1 : 0 }));
  }, []);

  const transformed = useMemo(() => {
    if (!graph?.found) return null;
    const { nodes, edges } = visibleGraph(graph, softToggles);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const root = nodes.find((n) => n.variant === "root");
    const positions = layoutNodes(nodes, edges, root?.id ?? nodes[0]?.id ?? "");
    const rfNodes: Node[] = nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      if (n.kind === "dropdown" || n.kind === "radio") {
        const options = (n.children ?? []).map((cid) => {
          const child = byId.get(cid);
          return { childId: cid, label: child ? optionDisplay(child) : cid };
        });
        return {
          id: n.id,
          type: n.kind,
          position: pos,
          data: {
            id: n.id,
            selectionKey: n.selectionKey,
            options,
            selected: (n.selectionKey && selections[n.selectionKey]) ?? 0,
            onSelect,
          },
        };
      }
      return {
        id: n.id,
        type: n.kind,
        position: pos,
        data: { id: n.id, code: n.code, label: n.label, variant: n.variant, onNavigate: onNavigateCourse },
      };
    });
    const rfEdges: Edge[] = edges.map((e) => {
      if (e.optional) {
        const path = e.softPath ?? "";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "optional",
          data: { path, softToggled: softToggles[path] === 0, onToggle },
        };
      }
      return { id: e.id, source: e.source, target: e.target, type: "hard" };
    });
    const disjunctions: DisjunctionDetail[] = nodes
      .filter((n) => (n.kind === "dropdown" || n.kind === "radio") && n.selectionKey)
      .map((n) => ({
        selectionKey: n.selectionKey as string,
        path: n.selectionKey as string,
        options: (n.children ?? []).map((cid) => {
          const child = byId.get(cid);
          return child ? optionDisplay(child) : cid;
        }),
      }));
    return { rfNodes, rfEdges, disjunctions };
  }, [graph, selections, softToggles, onSelect, onToggle, onNavigateCourse]);

  const showTree = !!(transformed && graph?.found && (graph?.hasPrereqs || graph?.hasCoreqs));

  return (
    <div data-pane="prereq-tree" className="flex h-full flex-col gap-3 p-3">
      <input
        aria-label="Root course code"
        placeholder="Search a root course — CPSC 320, MATH 200"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 h-11 w-full rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1"
      />
      {status === "loading" && (
        <p className="text-muted inline-flex items-center gap-1.5 text-xs" aria-live="polite">
          <span className="border-muted size-3 animate-spin rounded-full border-2 border-t-transparent" />
          Loading course index…
        </p>
      )}
      {status === "error" && (
        <p
          role="alert"
          className="border-error/30 bg-error-container/30 text-error rounded-lg border px-3 py-2 text-sm"
        >
          Couldn't load the tree.{" "}
          <button type="button" className="text-primary underline" onClick={() => setRoot((r) => r)}>
            Retry
          </button>
        </p>
      )}
      {status === "ready" && graph && !graph.found && <NotFoundAlert code={root} onPick={setCode} />}
      {status === "ready" && graph && graph.found && !graph.hasPrereqs && !graph.hasCoreqs && (
        <p className="text-muted text-sm">{root} has no prerequisites or corequisites listed in the calendar.</p>
      )}
      {showTree && transformed && graph && (
        <PaneErrorBoundary fallback={<AccordionFallback graph={graph} />}>
          <div data-prereq-canvas className="relative min-h-0 flex-1">
            <ReactFlow
              nodes={transformed.rfNodes}
              edges={transformed.rfEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesFocusable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            />
            <DisjunctionDetailStrip disjunctions={transformed.disjunctions} selections={selections} />
          </div>
        </PaneErrorBoundary>
      )}
    </div>
  );
}
