import type { PrereqEdge, PrereqGraph, PrereqNode } from "@/src/server/prereq/build-graph";

/**
 * Applies the per-soft-path toggle to a finished {@link PrereqGraph}.
 *
 * `softPath`-stamped optional edges (the soft's incoming structural edges) are
 * always kept — the SoftToggle pill on them is the affordance that flips state
 * back. When a path is disabled (`softToggles[path] === 0`) the wrapped
 * subtree's HARD outgoing edges (the child course's own prerequisite chain) are
 * pruned, along with the descendant nodes reachable through them, so nothing
 * downstream of the soft's block orphan-floats (REQ-10.2). The block nodes
 * themselves stay rendered (faded by the parent), matching the donor's "immediate
 * edge + pill persist, upstream suppressed" semantics.
 */
export function visibleGraph(
  graph: PrereqGraph,
  softToggles: Record<string, 0 | 1>,
): { nodes: PrereqNode[]; edges: PrereqEdge[] } {
  const hiddenPaths = new Set<string>();
  for (const [p, v] of Object.entries(softToggles)) if (v === 0) hiddenPaths.add(p);
  if (hiddenPaths.size === 0) return { nodes: graph.nodes, edges: graph.edges };

  // Hard adjacency (skip softPath-stamped edges; the soft subtree's hard
  // descendants hang off hard edges). ponytail: O(edges) BFS per hidden path;
  // per-path diff sets if the graph grows large enough that a single traversal
  // matters.
  const hardAdj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.optional && e.softPath !== undefined) continue;
    const list = hardAdj.get(e.source);
    if (list) list.push(e.target);
    else hardAdj.set(e.source, [e.target]);
  }

  // Block = the soft's immediate children (the targets of each path's
  // softPath-stamped edges); they stay rendered. Descendants = everything
  // reachable from the block through hard edges; they hide when disabled.
  const block = new Set<string>();
  const descendants = new Set<string>();
  for (const p of hiddenPaths) {
    const roots = graph.edges.filter((e) => e.optional && e.softPath === p).map((e) => e.target);
    const queue: string[] = [];
    for (const r of roots) {
      block.add(r);
      queue.push(r);
    }
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const nb of hardAdj.get(cur) ?? []) {
        if (!block.has(nb) && !descendants.has(nb)) {
          descendants.add(nb);
          queue.push(nb);
        }
      }
    }
  }

  const edges = graph.edges.filter((e) => {
    if (e.optional && e.softPath !== undefined) return true;
    return !block.has(e.source) && !descendants.has(e.source) && !descendants.has(e.target);
  });
  const nodes = graph.nodes.filter((n) => !descendants.has(n.id));
  return { nodes, edges };
}
