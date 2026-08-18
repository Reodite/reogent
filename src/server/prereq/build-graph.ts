import type { CanonicalCode } from "@/src/shared/course-code";
import { displayExpr, MAX_DEPTH, parsePrereq, walkCodeLeaves, type Expr } from "@/src/shared/prereq-ast";
import type { SearchClient } from "../core/types";
import { findByCode } from "../modules/courses";

/** React-Flow-ready node emitted by {@link buildPrereqGraph}. */
export type PrereqNode = {
  id: string;
  kind: "course" | "coreq" | "dropdown" | "radio" | "literal" | "soft";
  code?: string;
  variant?: "root" | "known" | "unknown" | "note" | "coreq";
  label: string;
  /** BFS depth from the root course (course-lookup hops). Client columns and the depth-cap oracle read this. */
  depth?: number;
  children?: string[];
  selectionKey?: string;
  ui?: "dropdown" | "stacked";
  optional?: boolean;
};

export type PrereqEdge = {
  id: string;
  source: string;
  target: string;
  optional?: boolean;
};

export type PrereqGraph = {
  rootCode: string;
  nodes: PrereqNode[];
  edges: PrereqEdge[];
  selectionKeys: string[];
  hasPrereqs: boolean;
  hasCoreqs: boolean;
  found: boolean;
};

export type BuildPrereqGraphOpts = {
  includeCoreqs?: boolean;
  depthCap?: number;
};

/** Builds the transitive prereq graph for `root` by walking the `courses` Meilisearch index. */
export async function buildPrereqGraph(
  root: CanonicalCode,
  search: SearchClient,
  opts: BuildPrereqGraphOpts = {},
): Promise<PrereqGraph> {
  const depthCap = opts.depthCap ?? MAX_DEPTH;
  const includeCoreqs = opts.includeCoreqs ?? true;
  const rootCode = root.raw;

  const empty: PrereqGraph = {
    rootCode,
    nodes: [],
    edges: [],
    selectionKeys: [],
    hasPrereqs: false,
    hasCoreqs: false,
    found: false,
  };

  const rootDoc = await findByCode(search, rootCode);
  if (!rootDoc) return empty;

  const nodes: PrereqNode[] = [];
  const edges: PrereqEdge[] = [];
  const selectionKeys: string[] = [];
  const nodeByCode = new Map<string, string>();
  const visited = new Set<string>();
  let edgeSeq = 0;
  const edge = (source: string, target: string, optional: boolean): PrereqEdge => {
    const e: PrereqEdge = { id: `e${edgeSeq++}`, source, target };
    if (optional) e.optional = true;
    return e;
  };
  const childPath = (parent: string, index: number) => (parent === "" ? `${index}` : `${parent}.${index}`);

  const ensureCourseNode = (code: string, depth: number): string => {
    const existing = nodeByCode.get(code);
    if (existing) return existing;
    const id = code;
    nodes.push({ id, kind: "course", code, label: code, depth });
    nodeByCode.set(code, id);
    return id;
  };

  type Owner = { code: string; nodeId: string; depth: number; path: string; optional: boolean };

  // Walks one course's prereq AST, emitting graph nodes/edges/selection keys and
  // enqueuing code leaves for transitive lookup. Top-level Literals drop out of
  // the visual tree; Literals inside an Or render as note rows. A Soft wrapper
  // marks every edge it touches as optional.
  const expand = (ast: Expr | null, owner: Owner): void => {
    if (!ast) return;
    switch (ast.kind) {
      case "literal":
        return;
      case "code": {
        const id = ensureCourseNode(ast.code, owner.depth + 1);
        edges.push(edge(owner.nodeId, id, owner.optional));
        if (!visited.has(ast.code)) {
          queue.push({ code: ast.code, nodeId: id, depth: owner.depth + 1, optional: owner.optional });
        }
        return;
      }
      case "soft":
        expand(ast.child, { ...owner, optional: true });
        return;
      case "and":
        ast.children.forEach((c, i) => {
          expand(c, { ...owner, path: childPath(owner.path, i) });
        });
        return;
      case "or": {
        const selectionKey = `${owner.code}::${owner.path}`;
        const orId = `disj:${owner.code}::${owner.path}`;
        selectionKeys.push(selectionKey);
        const childIds: string[] = [];
        ast.children.forEach((c, i) => {
          const cp = childPath(owner.path, i);
          if (c.kind === "code") {
            const cid = ensureCourseNode(c.code, owner.depth + 1);
            childIds.push(cid);
            // Dropdown-absorption (REQ-8.5): edges to the selected code route into the dropdown group node.
            edges.push(edge(orId, cid, owner.optional));
            if (!visited.has(c.code)) {
              queue.push({ code: c.code, nodeId: cid, depth: owner.depth + 1, optional: owner.optional });
            }
          } else if (c.kind === "literal") {
            const lid = `lit:${orId}::${i}`;
            nodes.push({
              id: lid,
              kind: "literal",
              variant: "note",
              label: c.text || "(empty)",
              depth: owner.depth + 1,
            });
            childIds.push(lid);
            edges.push(edge(orId, lid, owner.optional));
          } else if (c.kind === "flattened") {
            const fid = `flat:${orId}::${i}`;
            nodes.push({ id: fid, kind: "literal", variant: "note", label: displayExpr(c), depth: owner.depth + 1 });
            childIds.push(fid);
            edges.push(edge(orId, fid, owner.optional));
            if (c.subExpr) {
              expand(c.subExpr, {
                code: owner.code,
                nodeId: fid,
                depth: owner.depth + 1,
                path: cp,
                optional: owner.optional,
              });
            }
          } else {
            // Nested And/Or/Soft inside a disjunction option: recurse under the dropdown node.
            expand(c, { code: owner.code, nodeId: orId, depth: owner.depth + 1, path: cp, optional: owner.optional });
          }
        });
        nodes.push({
          id: orId,
          kind: ast.ui === "stacked" ? "radio" : "dropdown",
          ui: ast.ui,
          children: childIds,
          selectionKey,
          label: displayExpr(ast),
          optional: owner.optional,
          depth: owner.depth + 1,
        });
        edges.push(edge(owner.nodeId, orId, owner.optional));
        return;
      }
      case "flattened": {
        const fid = `flat:${owner.code}::${owner.path}`;
        nodes.push({ id: fid, kind: "literal", variant: "note", label: displayExpr(ast), depth: owner.depth + 1 });
        edges.push(edge(owner.nodeId, fid, owner.optional));
        if (ast.subExpr) {
          expand(ast.subExpr, {
            code: owner.code,
            nodeId: fid,
            depth: owner.depth + 1,
            path: owner.path,
            optional: owner.optional,
          });
        }
        return;
      }
    }
  };

  type Entry = { code: string; nodeId: string; depth: number; optional: boolean };
  const queue: Entry[] = [];

  const rootId = rootCode;
  nodes.push({ id: rootId, kind: "course", variant: "root", code: rootCode, label: rootCode, depth: 0 });
  nodeByCode.set(rootCode, rootId);
  visited.add(rootCode);

  const hasPrereqs = !!rootDoc.prerequisite;
  const hasCoreqs = includeCoreqs && !!rootDoc.corequisite;

  if (!hasPrereqs && !hasCoreqs) {
    return { rootCode, nodes, edges, selectionKeys, hasPrereqs: false, hasCoreqs: false, found: true };
  }

  // Seed: root's own prereq AST + coreq column. Gated so depthCap = 0 emits root only.
  if (depthCap > 0) {
    if (hasPrereqs) {
      expand(parsePrereq(rootDoc.prerequisite), {
        code: rootCode,
        nodeId: rootId,
        depth: 0,
        path: "",
        optional: false,
      });
    }
    if (hasCoreqs) {
      // Coreq column: emit each coreq code adjacent to root (REQ-7.3), enqueue its prereq chain but not its coreqs (REQ-7.4). A code already visited via the prereq chain is reused (REQ-7.5).
      for (const { leaf } of walkCodeLeaves(parsePrereq(rootDoc.corequisite))) {
        const code = leaf.code;
        const existing = nodeByCode.get(code);
        const id = existing ?? ensureCourseNode(code, 1);
        if (!existing) {
          const node = nodes.find((n) => n.id === id);
          if (node) {
            node.kind = "coreq";
            node.variant = "coreq";
          }
        }
        edges.push(edge(rootId, id, false));
        if (!visited.has(code)) {
          queue.push({ code, nodeId: id, depth: 1, optional: false });
        }
      }
    }
  }

  while (queue.length > 0) {
    const { code, nodeId, depth, optional } = queue.shift() as Entry;
    if (visited.has(code)) continue;
    visited.add(code);
    const doc = await findByCode(search, code);
    const node = nodes.find((n) => n.id === nodeId);
    if (!doc) {
      if (node && node.kind === "course") node.variant = "unknown";
      continue;
    }
    if (node && node.kind === "course") node.variant = "known";
    // Cap expansions so the deepest emitted node sits at depthCap (REQ-7.2).
    if (depth < depthCap && doc.prerequisite) {
      expand(parsePrereq(doc.prerequisite), { code, nodeId, depth, path: "", optional });
    }
  }

  return { rootCode, nodes, edges, selectionKeys, hasPrereqs, hasCoreqs, found: true };
}
