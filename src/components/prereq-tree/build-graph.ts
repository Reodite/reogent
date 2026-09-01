import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { displayExpr, MAX_DEPTH, parsePrereq, type Expr } from "@/src/shared/prereq-ast";
import type { Edge, Node } from "reactflow";
import type { OptionalEdgeData } from "./edges/OptionalEdge";
import type { CourseNodeVariant } from "./nodes/CourseNode";
import type { DisjunctionData, DisjunctionDetail, EitherOrData } from "./nodes/DisjunctionNode";

/** The client-side course index: canonical "CPSC 110" → catalog record. */
export type CourseIndex = Map<string, CourseIndexEntry>;

/** Matches the bare "none" placeholder the calendar writes when prereqs /
 *  coreqs are absent. Drives the "no prerequisites or corequisites listed"
 *  empty state for both literally-empty values and the explicit "None". */
export function isNoneOrEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^\s*none\s*\.?\s*$/i.test(value);
}

/** Folds a typed query to the canonical "SUBJ NUM" form ("cpsc110", "CPSC_V 110"
 *  → "CPSC 110"). Non-code-shaped input just gets case/whitespace folding. */
export function normalize(query: string): string {
  const m = query.toUpperCase().match(/^([A-Z]{2,4})(?:_V)?\s*(\d{2,4}[A-Z]?)$/);
  if (!m) return query.toUpperCase().replace(/\s+/g, " ").trim();
  return `${m[1]} ${m[2]}`;
}

/** Canonical "SUBJ" / "SUBJ NUM" prefix for the type-ahead dropdown. Mirrors
 *  normalize()'s folding but tolerates partial input — a bare subject ("CPSC")
 *  or a partial number ("CPSC 1") both yield a usable prefix. Null when the
 *  input is empty / too short / not code-shaped (no suggestions render). */
export function suggestionPrefix(query: string): string | null {
  const q = query.toUpperCase().replace(/\s+/g, " ").trim();
  if (q.length < 2) return null;
  const m = q.match(/^([A-Z]{2,4})(?:_V)?(?:\s*(\d{1,4}[A-Z]?))?$/);
  if (!m) return null;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

/** Cap on rendered type-ahead rows; a footer row tells the user to keep typing. */
export const SUGGESTION_CAP = 100;

export interface Graph {
  nodes: Node[];
  edges: Edge[];
  depthCount: number;
  /** True top/left/bottom/right of the placed nodes in layout space, tracking
   *  each node's full vertical extent. Null when no nodes were placed. */
  bbox: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

// Per-column items. `course` is a real course (or unknown code referenced in
// some other course's prereqs); `group` is a disjunction / either-or block
// that only expands its currently-selected child upstream.
type ColumnItem =
  | {
      kind: "course";
      id: string;
      code: string;
      parsed: CourseIndexEntry | null;
      role: "root" | "prereq" | "coreq" | "note";
      /** Present only via a disabled soft branch: rendered faded, prereqs not loaded. */
      faded?: boolean;
    }
  | {
      kind: "group";
      id: string;
      ui: "dropdown" | "stacked";
      optionCount: number;
      data: DisjunctionData | EitherOrData;
      faded?: boolean;
    };

const X_STEP = 280;
const Y_STEP = 90; // minimum vertical slot per item — taller blocks grow past this
const Y_GAP = 20;
export const NODE_WIDTH = 200;
/** The root card renders 50% larger than every other block. */
export const ROOT_SCALE = 1.5;
const ROOT_WIDTH = NODE_WIDTH * ROOT_SCALE;
// Columns after the root shift right by the root's overhang plus half the
// standard column gap again, so the bigger root card keeps a proportionally
// larger (1.5×) gap to its first neighbor.
const ROOT_COLUMN_EXTRA = (ROOT_WIDTH - NODE_WIDTH) / 2 + (X_STEP - NODE_WIDTH) * (ROOT_SCALE - 1);

// Vertical gap between stacked coreq blocks (and the topmost coreq and the
// root). The coreq edge between blocks carries the "co-req" label pill, so
// the gap accommodates the pill's height plus breathing room.
const COREQ_LABEL_PILL_HEIGHT = 22;
const COREQ_PILL_BREATHING = 8;
const COREQ_VERTICAL_GAP = COREQ_LABEL_PILL_HEIGHT + COREQ_PILL_BREATHING * 2;

const TEXT_LINE_HEIGHT = 15;

// Every edge names both handles. The tree reads left to right — root leftmost,
// prereqs extending rightward — so a prereq edge leaves the prereq's LEFT side
// and enters its dependent's RIGHT side; coreq edges flow vertically (bottom →
// top). Every node renders all four invisible handles. Hard prereq edges use
// the default bezier styled by globals.css ([data-pane="prereq-tree"]); coreq
// edges carry the "co-req" label pill in our secondary token; soft edges use
// the OptionalEdge component (dashed + toggle pill).
const PREREQ_EDGE_STYLE = {
  sourceHandle: "left-source",
  targetHandle: "right-target",
} as const;

const COREQ_EDGE_STYLE = {
  sourceHandle: "bottom-source",
  targetHandle: "top-target",
  label: "co-req",
  style: { stroke: "var(--secondary)", strokeWidth: 1.5 },
  labelStyle: { fill: "var(--secondary)", fontSize: 10 },
  labelBgStyle: { fill: "var(--surface)", stroke: "var(--border)", strokeWidth: 1 },
  labelBgPadding: [4, 6] as [number, number],
  labelBgBorderRadius: 4,
} as const;

const SOFT_EDGE_STYLE = {
  sourceHandle: "left-source",
  targetHandle: "right-target",
  type: "optional",
} as const;

/** Carried through walkAst inside a `kind: 'soft'` wrapper: the key identifies
 *  the wrapper (so the edge toggle knows which branch to flip) and `disabled`
 *  governs whether attachments fade their nodes / suppress upstream walks. */
type SoftContext = { key: string; disabled: boolean };

// Block heights are estimated from text length (not measured) so the column
// layout can leave the right amount of vertical room. Chars-per-line bounds
// are deliberately tight so the estimator over-shoots by a line — extra gap
// is cheap, overlap is the bug.
function estimateLines(text: string, charsPerLine: number): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    if (used === 0) {
      used = word.length;
    } else if (used + 1 + word.length <= charsPerLine) {
      used += 1 + word.length;
    } else {
      lines += 1;
      used = word.length;
    }
    while (used > charsPerLine) {
      lines += 1;
      used -= charsPerLine;
    }
  }
  return lines;
}

/** Real rendered height when React Flow has measured this node (exact vertical
 *  centering — a chain of single-item columns sits perfectly level), estimated
 *  from text length otherwise (first paint before measurement lands). */
function heightOf(item: ColumnItem, measured?: Map<string, number>): number {
  const real = measured?.get(item.id);
  if (real) return real;
  if (item.kind === "course") {
    if (item.role === "note") {
      const lines = Math.max(1, estimateLines(item.code, 24));
      return 20 + TEXT_LINE_HEIGHT * lines;
    }
    const titleText = item.parsed?.title ?? "(not in calendar)";
    const titleLines = Math.max(1, estimateLines(titleText, 24));
    const h = 20 + TEXT_LINE_HEIGHT + 13 + TEXT_LINE_HEIGHT * titleLines;
    // Root scales up 50% and carries an extra ROOT badge line.
    return item.role === "root" ? Math.round((h + TEXT_LINE_HEIGHT) * ROOT_SCALE) : h;
  }
  if (item.ui === "dropdown") {
    const data = item.data as DisjunctionData;
    let h = 14 + 24;
    if (data.detail) {
      const text = data.detail.kind === "literal" ? data.detail.text : (data.detail.title ?? "(not in calendar)");
      const lines = Math.max(1, estimateLines(text, 26));
      h += 13 + TEXT_LINE_HEIGHT * lines;
    }
    return h;
  }
  const data = item.data as EitherOrData;
  let h = 30;
  for (let i = 0; i < data.options.length; i++) {
    const opt = data.options[i];
    const text = (opt.label ? `(${opt.label}) ` : "") + opt.display;
    const lines = Math.max(1, estimateLines(text, 19));
    h += 10 + TEXT_LINE_HEIGHT * lines;
    if (i < data.options.length - 1) h += 4;
  }
  return h;
}

/** Pre-pass: walk the prereq tree once with the same selection logic the main
 *  BFS uses, recording every dropdown absorption in a code → groupId map.
 *  Running this before the main BFS guarantees any course processed later
 *  (regardless of order) sees the alias and redirects its edge to the dropdown
 *  instead of a stale regular node. */
function computeAbsorptions(
  rootCode: string,
  index: CourseIndex,
  selections: Map<string, number>,
  softDisabled: Map<string, boolean>,
): Map<string, string> {
  const aliases = new Map<string, string>();
  const visited = new Set<string>();

  function visit(code: string, depth: number): void {
    if (depth > MAX_DEPTH) return;
    if (visited.has(code)) return;
    visited.add(code);
    const parsed = index.get(code);
    if (!parsed) return;
    const ast = parsePrereq(parsed.prerequisite);
    if (ast) walkAst(ast, code, depth, "", false);
    if (depth === 0) {
      const coreqAst = parsePrereq(parsed.corequisite);
      if (coreqAst) walkAst(coreqAst, code, 0, "coreq", true);
    }
  }

  function walkAst(expr: Expr, ownerCode: string, depth: number, path: string, isCoreq: boolean): void {
    if (depth > MAX_DEPTH) return;
    switch (expr.kind) {
      case "and":
        expr.children.forEach((child, i) => {
          walkAst(child, ownerCode, depth, `${path}.and[${i}]`, isCoreq);
        });
        return;
      case "or": {
        const key = `${ownerCode}::${path}.or`;
        const groupId = `grp:${key}`;
        const chosenIdx = selections.get(key) ?? 0;
        const safeChosen = Math.max(0, Math.min(chosenIdx, expr.children.length - 1));
        const chosenExpr = expr.children[safeChosen];
        if (expr.ui === "dropdown" && chosenExpr?.kind === "code") {
          // Last writer wins if the same code is the chosen option of two
          // distinct dropdowns — matches the main BFS closely enough.
          aliases.set(chosenExpr.code, groupId);
        }
        if (!chosenExpr) return;
        if (chosenExpr.kind === "code") {
          visit(chosenExpr.code, depth + 1);
        } else if (chosenExpr.kind === "and" || chosenExpr.kind === "or") {
          walkAst(chosenExpr, ownerCode, depth + 1, `${path}.or[${safeChosen}]`, isCoreq);
        }
        return;
      }
      case "code":
        visit(expr.code, depth + 1);
        return;
      case "literal":
        return;
      case "flattened":
        if (expr.subExpr) walkAst(expr.subExpr, ownerCode, depth, `${path}.flat`, isCoreq);
        return;
      case "soft":
        // Skip the wrapped subtree when the user toggled this branch off;
        // otherwise we'd leave stale aliases pointing at unrendered dropdowns.
        if (softDisabled.get(`${ownerCode}::${path}.soft`)) return;
        walkAst(expr.child, ownerCode, depth, `${path}.soft`, isCoreq);
        return;
    }
  }

  visit(rootCode, 0);
  return aliases;
}

/** Builds the React-Flow graph (nodes with layout positions + edges) for
 *  `rootCode`, applying the current disjunction selections and soft toggles.
 *  Ported from reodite's PrereqTree buildGraph so tree logic matches exactly:
 *  BFS over expanded courses, dropdown absorption via a pre-pass alias map,
 *  note literals, faded soft blocks with promotion, coreq column chained above
 *  the root, and barycenter column sorting. */
export function buildGraph(
  rootCode: string,
  index: CourseIndex,
  selections: Map<string, number>,
  setSelection: (key: string, idx: number) => void,
  softDisabled: Map<string, boolean>,
  toggleSoft: (key: string) => void,
  onNavigate?: (code: string) => void,
  measuredHeights?: Map<string, number>,
): Graph {
  const root = index.get(rootCode);
  if (!root) return { nodes: [], edges: [], depthCount: 0, bbox: null };

  // BFS over courses we've decided to expand. Nodes (course or group) live in
  // `byId`, edges accumulate flat. `enqueued` is keyed by canonical course
  // code; first-seen-depth wins. Group ids derive from a stable
  // `${ownerCode}::${path}` selection key so they dedup naturally.
  const byId = new Map<string, ColumnItem & { depth: number }>();
  byId.set(rootCode, { kind: "course", id: rootCode, code: rootCode, parsed: root, role: "root", depth: 0 });
  const edges: Edge[] = [];
  // Dedupe edges by id at the push site: duplicate `Code(X)` children in one
  // AST (credit-exclusion prose re-mentioning a code) would otherwise emit two
  // edges with the same id and orphan a <path> on selection flips.
  const seenEdgeIds = new Set<string>();
  const pushEdge = (edge: Edge): void => {
    const id = typeof edge.id === "string" ? edge.id : "";
    if (seenEdgeIds.has(id)) return;
    seenEdgeIds.add(id);
    edges.push(edge);
  };
  const enqueued = new Set<string>([rootCode]);
  const coreqIds = new Set<string>();
  // Courses in the graph only because of a disabled soft branch: rendered
  // faded, no upstream walk. Reaching one later via a hard path promotes it.
  const fadedOnly = new Set<string>();
  // When a dropdown's chosen option is a course code, the dropdown block IS
  // that course — any other path pointing at the absorbed code points at the
  // dropdown's group id instead. Computed up front so order doesn't matter.
  const codeAliases = computeAbsorptions(rootCode, index, selections, softDisabled);

  type QItem = { code: string; parsed: CourseIndexEntry; depth: number };
  const queue: QItem[] = [{ code: rootCode, parsed: root, depth: 0 }];

  while (queue.length > 0) {
    const cur = queue.shift() as QItem;
    if (cur.depth >= MAX_DEPTH) continue;
    const ast = parsePrereq(cur.parsed.prerequisite);
    if (!ast) continue;
    walkAst(ast, cur.code, cur.depth + 1, "", cur.code);
  }

  // Direct corequisites of the root only — coreqs are taken alongside, not
  // "before", so their own coreq trees aren't expanded (their prereq chains are).
  const coreqAst = parsePrereq(root.corequisite);
  if (coreqAst) walkAst(coreqAst, rootCode, 0, "coreq", rootCode, true);

  function walkAst(
    expr: Expr,
    ownerCode: string,
    depth: number,
    path: string,
    targetId: string,
    isCoreq = false,
    softContext: SoftContext | null = null,
  ): void {
    if (depth > MAX_DEPTH) return;
    switch (expr.kind) {
      case "and":
        // AND children all sit at the parent's level — a soft parent makes
        // every child's edge to the target soft too.
        expr.children.forEach((child, i) => {
          walkAst(child, ownerCode, depth, `${path}.and[${i}]`, targetId, isCoreq, softContext);
        });
        return;
      case "soft": {
        // Recommendation wrapper: tag the immediate edge(s) out of this
        // subtree with a SoftContext so they render dashed with a toggle.
        // While disabled, first-level blocks still render (faded) but their
        // upstream walk is suppressed.
        const key = `${ownerCode}::${path}.soft`;
        const nextCtx: SoftContext = { key, disabled: softDisabled.get(key) ?? false };
        walkAst(expr.child, ownerCode, depth, `${path}.soft`, targetId, isCoreq, nextCtx);
        return;
      }
      case "or": {
        const key = `${ownerCode}::${path}.or`;
        const groupId = `grp:${key}`;
        const chosen = selections.get(key) ?? 0;
        const safeChosen = Math.max(0, Math.min(chosen, expr.children.length - 1));
        const chosenExpr = expr.children[safeChosen];

        // Dropdown variant absorbs the selected course's identity (no trailing
        // course node) — the detail row shows what that course node would.
        let dropdownDetail: DisjunctionDetail = null;
        if (expr.ui === "dropdown" && chosenExpr) {
          if (chosenExpr.kind === "code") {
            const absorbed = index.get(chosenExpr.code);
            dropdownDetail = { kind: "course", code: chosenExpr.code, title: absorbed?.title ?? null };
          } else if (chosenExpr.kind === "literal") {
            dropdownDetail = { kind: "literal", text: chosenExpr.text };
          }
        }

        registerGroup(groupId, key, expr, safeChosen, depth, isCoreq, dropdownDetail, softContext?.disabled === true);
        pushEdge(
          softContext
            ? buildSoftEdge(groupId, targetId, softContext)
            : {
                id: `${isCoreq ? "coreq" : "prereq"}:${groupId}->${targetId}`,
                source: groupId,
                target: targetId,
                ...(isCoreq ? COREQ_EDGE_STYLE : PREREQ_EDGE_STYLE),
              },
        );

        if (!chosenExpr) return;
        // Soft + disabled: the block stays (faded) but nothing upstream loads.
        if (softContext?.disabled) return;

        // Dropdown + course → dropdown IS the course; walk the absorbed
        // course's own prereqs inline with target = groupId. Those edges are
        // plain prereq edges — they're prereqs OF the absorbed course.
        if (expr.ui === "dropdown" && chosenExpr.kind === "code") {
          const absorbed = index.get(chosenExpr.code);
          if (absorbed && depth + 1 <= MAX_DEPTH) {
            const absorbedAst = parsePrereq(absorbed.prerequisite);
            if (absorbedAst) walkAst(absorbedAst, chosenExpr.code, depth + 1, "", groupId);
          }
          return;
        }

        // Dropdown + literal: detail already shown under the dropdown.
        if (expr.ui === "dropdown" && chosenExpr.kind === "literal") return;

        // Either-or stacked, or dropdown with a nested chosen expression:
        // edges target the group id. Inner walks drop softContext — once the
        // user opts in, the inner expression is required for that path.
        if (isCoreq) {
          if (chosenExpr.kind === "code") {
            attachCoreqCode(chosenExpr.code, groupId);
          } else if (chosenExpr.kind === "and" || chosenExpr.kind === "or") {
            walkAst(chosenExpr, ownerCode, depth + 1, `${path}.or[${safeChosen}]`, groupId, true);
          } else if (chosenExpr.kind === "flattened") {
            if (chosenExpr.subExpr) {
              walkAst(chosenExpr.subExpr, ownerCode, depth + 1, `${path}.or[${safeChosen}].flat`, groupId, true);
            }
          }
          return;
        }
        if (chosenExpr.kind === "code") {
          attachPrereqCode(chosenExpr.code, depth + 1, groupId);
        } else if (chosenExpr.kind === "and" || chosenExpr.kind === "or") {
          walkAst(chosenExpr, ownerCode, depth + 1, `${path}.or[${safeChosen}]`, groupId);
        } else if (chosenExpr.kind === "flattened") {
          // Flattened branch ("a score of 80% or higher in one of …"): the
          // radio row shows the prose; the structured sub-expression walks
          // upstream so real blocks (and their prereqs) trail the literal.
          if (chosenExpr.subExpr) {
            walkAst(chosenExpr.subExpr, ownerCode, depth + 1, `${path}.or[${safeChosen}].flat`, groupId);
          }
        }
        // literal in stacked: terminates — the radio's text is the display.
        return;
      }
      case "code":
        if (isCoreq) attachCoreqCode(expr.code, targetId);
        else attachPrereqCode(expr.code, depth, targetId, softContext);
        return;
      case "literal":
        // A real prereq the parser couldn't structure (class-standing prose,
        // credit requirements, consent, …) renders as a small note block.
        if (expr.text.trim()) {
          attachNoteLiteral(expr.text, `${ownerCode}::${path}`, depth, targetId, isCoreq, softContext);
        }
        return;
      case "flattened":
        if (expr.subExpr) {
          walkAst(expr.subExpr, ownerCode, depth, `${path}.flat`, targetId, isCoreq, softContext);
        }
        return;
    }
  }

  function buildSoftEdge(sourceId: string, targetId: string, ctx: SoftContext): Edge {
    const data: OptionalEdgeData = { softKey: ctx.key, disabled: ctx.disabled, onToggle: toggleSoft };
    return {
      // softKey in the id keeps two soft branches into the same target unique.
      id: `soft:${ctx.key}:${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
      ...SOFT_EDGE_STYLE,
      data,
    };
  }

  function attachPrereqCode(
    code: string,
    depth: number,
    targetId: string,
    softContext: SoftContext | null = null,
  ): void {
    // Resolve through codeAliases so an absorbed code's edge points at the
    // dropdown's group id, not a phantom course node.
    const sourceId = codeAliases.get(code) ?? code;
    if (sourceId === targetId) return;
    pushEdge(
      softContext
        ? buildSoftEdge(sourceId, targetId, softContext)
        : { id: `prereq:${sourceId}->${targetId}`, source: sourceId, target: targetId, ...PREREQ_EDGE_STYLE },
    );
    if (codeAliases.has(code)) return;

    const isFadedAttach = softContext?.disabled === true;

    if (byId.has(code)) {
      // Promote a previously faded-only node when a hard path reaches it:
      // clear the flag and walk its prereqs after all.
      if (!isFadedAttach && fadedOnly.has(code)) {
        fadedOnly.delete(code);
        const existing = byId.get(code);
        if (existing && existing.kind === "course") {
          byId.set(code, { ...existing, faded: false });
          enqueued.add(code);
          if (existing.parsed) queue.push({ code, parsed: existing.parsed, depth: existing.depth });
        }
      }
      return;
    }

    const parsed = index.get(code) ?? null;
    byId.set(code, { kind: "course", id: code, code, parsed, role: "prereq", depth, faded: isFadedAttach });
    if (isFadedAttach) {
      // Faded-only attachment: visible but no transitive prereq walk.
      fadedOnly.add(code);
      return;
    }
    enqueued.add(code);
    if (parsed) queue.push({ code, parsed, depth });
  }

  /** Class-standing prose surfaced as a note block. Source id is keyed by
   *  `${ownerCode}::${pathInExpr}` so two courses' notes don't collide. */
  function attachNoteLiteral(
    text: string,
    key: string,
    depth: number,
    targetId: string,
    isCoreq: boolean,
    softContext: SoftContext | null = null,
  ): void {
    const sourceId = `note:${key}`;
    if (sourceId === targetId) return;
    pushEdge(
      softContext
        ? buildSoftEdge(sourceId, targetId, softContext)
        : {
            id: `${isCoreq ? "coreq" : "prereq"}:${sourceId}->${targetId}`,
            source: sourceId,
            target: targetId,
            ...(isCoreq ? COREQ_EDGE_STYLE : PREREQ_EDGE_STYLE),
          },
    );
    if (byId.has(sourceId)) return;
    byId.set(sourceId, {
      kind: "course",
      id: sourceId,
      code: text,
      parsed: null,
      role: "note",
      depth: isCoreq ? 0 : depth,
      faded: softContext?.disabled === true,
    });
    if (isCoreq) coreqIds.add(sourceId);
  }

  function attachCoreqCode(code: string, targetId: string): void {
    const sourceId = codeAliases.get(code) ?? code;
    if (sourceId === targetId) return;
    pushEdge({ id: `coreq:${sourceId}->${targetId}`, source: sourceId, target: targetId, ...COREQ_EDGE_STYLE });
    if (codeAliases.has(code)) return;
    if (enqueued.has(code)) return;
    enqueued.add(code);
    coreqIds.add(code);
    const parsed = index.get(code) ?? null;
    byId.set(code, { kind: "course", id: code, code, parsed, role: "coreq", depth: 0 });
    // A coreq is still a course — its prereq chain renders like any other
    // (edges come back through attachPrereqCode as plain prereq edges).
    if (parsed) queue.push({ code, parsed, depth: 0 });
  }

  function registerGroup(
    groupId: string,
    key: string,
    expr: Expr & { kind: "or" },
    selectedIdx: number,
    depth: number,
    isCoreq: boolean,
    detail: DisjunctionDetail,
    faded: boolean,
  ): void {
    if (isCoreq) coreqIds.add(groupId);
    if (byId.has(groupId)) return;
    const onChange = (idx: number) => setSelection(key, idx);
    if (expr.ui === "dropdown") {
      const data: DisjunctionData = {
        options: expr.children.map((child) => ({ display: displayExpr(child), isCode: child.kind === "code" })),
        selectedIdx,
        onChange,
        detail,
      };
      byId.set(groupId, {
        kind: "group",
        id: groupId,
        ui: "dropdown",
        optionCount: expr.children.length,
        data,
        depth: isCoreq ? 0 : depth,
        faded,
      });
    } else {
      const data: EitherOrData = {
        options: expr.children.map((child, i) => ({
          label: String.fromCharCode("a".charCodeAt(0) + i),
          display: displayExpr(child),
        })),
        selectedIdx,
        onChange,
      };
      byId.set(groupId, {
        kind: "group",
        id: groupId,
        ui: "stacked",
        optionCount: expr.children.length,
        data,
        depth: isCoreq ? 0 : depth,
        faded,
      });
    }
  }

  // ---------- Layout ----------
  // Columns by depth (prereq side) or 'coreq' (stacked above the root).
  type Placed = ColumnItem & { depth: number };
  const byColumn = new Map<string, Placed[]>();
  let depthCount = 0;
  for (const placed of byId.values()) {
    const isCoreq = coreqIds.has(placed.id) || (placed.kind === "course" && placed.role === "coreq");
    const colKey = isCoreq ? "coreq" : `d${placed.depth}`;
    if (!byColumn.has(colKey)) byColumn.set(colKey, []);
    byColumn.get(colKey)?.push(placed);
    if (!isCoreq && placed.kind === "course") depthCount = Math.max(depthCount, placed.depth);
  }

  const nodes: Node[] = [];
  // Layout-space bbox accumulator tracking each node's full vertical extent
  // (top + estimated height) — `position.y` alone only sees top edges and
  // would bias the auto-fit camera upward.
  let bboxMinX = Number.POSITIVE_INFINITY;
  let bboxMaxX = Number.NEGATIVE_INFINITY;
  let bboxMinY = Number.POSITIVE_INFINITY;
  let bboxMaxY = Number.NEGATIVE_INFINITY;
  const pushNode = (node: Node, height: number, width = NODE_WIDTH) => {
    nodes.push(node);
    const { x, y } = node.position;
    if (x < bboxMinX) bboxMinX = x;
    if (x + width > bboxMaxX) bboxMaxX = x + width;
    if (y < bboxMinY) bboxMinY = y;
    if (y + height > bboxMaxY) bboxMaxY = y + height;
  };
  // Top-level coreq ids in vertical order — their edges are rewritten into a
  // chain after layout (topmost → next → … → root).
  const coreqChain: string[] = [];

  // Barycenter sort: order each prereq column by the mean y of already-placed
  // successors to reduce edge crossings. Ties fall through to
  // courses-before-groups + alphabetical so order stays deterministic.
  const successors = new Map<string, string[]>();
  for (const e of edges) {
    if (typeof e.source !== "string" || typeof e.target !== "string") continue;
    const list = successors.get(e.source);
    if (list) list.push(e.target);
    else successors.set(e.source, [e.target]);
  }
  const yByItem = new Map<string, number>();
  const baryOf = (item: ColumnItem): number => {
    const succs = successors.get(item.id);
    if (!succs) return 0;
    let sum = 0;
    let count = 0;
    for (const s of succs) {
      const y = yByItem.get(s);
      if (y !== undefined) {
        sum += y;
        count++;
      }
    }
    return count === 0 ? 0 : sum / count;
  };
  const tiebreak = (a: ColumnItem, b: ColumnItem): number => {
    if (a.kind !== b.kind) return a.kind === "course" ? -1 : 1;
    if (a.kind === "course" && b.kind === "course") return a.code.localeCompare(b.code);
    return a.id.localeCompare(b.id);
  };

  // Columns lay out shallowest-first (d0, coreq stack, d1, d2, …) so deeper
  // columns can read successors' y's. The coreq column slots right after the
  // root so its children in d1+ inherit its above-root position when sorting.
  const sortedColKeys = [...byColumn.keys()].sort((a, b) => {
    const rank = (k: string) => (k === "coreq" ? 0.5 : Number(k.slice(1)));
    return rank(a) - rank(b);
  });

  const fadedStyle = (item: Placed) => (item.faded ? { opacity: 0.4 } : null);
  const courseData = (item: Extract<ColumnItem, { kind: "course" }>, isRoot: boolean, isCoreqCol: boolean) => {
    if (item.role === "note") return { variant: "note" as CourseNodeVariant, text: item.code };
    const variant: CourseNodeVariant = isRoot ? "root" : item.parsed !== null ? "known" : "unknown";
    return {
      variant,
      code: item.code,
      title: item.parsed?.title ?? "(not in calendar)",
      coreq: isCoreqCol || undefined,
      onNavigate,
    };
  };

  for (const colKey of sortedColKeys) {
    const items = byColumn.get(colKey) as Placed[];
    const isCoreqCol = colKey === "coreq";
    if (isCoreqCol) {
      items.sort(tiebreak);
    } else {
      items.sort((a, b) => {
        const da = baryOf(a);
        const db = baryOf(b);
        if (da !== db) return da - db;
        return tiebreak(a, b);
      });
    }

    if (isCoreqCol) {
      // Coreq column shares the root's x, stacked directly above it. Iterate
      // bottom-up so the bottommost item lands just above the root with a
      // pill-sized clear band, and each item above stacks its own height up.
      const x = 0;
      const rootItem = byId.get(rootCode);
      const rootTop = rootItem ? -heightOf(rootItem, measuredHeights) / 2 : 0;
      let nextBottomY = rootTop - COREQ_VERTICAL_GAP;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const h = heightOf(item, measuredHeights);
        const positionY = nextBottomY - h;
        if (item.kind === "course") {
          pushNode(
            {
              id: item.id,
              type: "course",
              position: { x, y: positionY },
              data: courseData(item, false, true),
              style: { width: NODE_WIDTH, ...fadedStyle(item) },
            },
            h,
          );
        } else {
          pushNode(
            {
              id: item.id,
              type: item.ui === "stacked" ? "radio" : "dropdown",
              position: { x, y: positionY },
              data: item.data,
              style: { width: NODE_WIDTH, ...fadedStyle(item) },
            },
            h,
          );
        }
        yByItem.set(item.id, positionY + h / 2);
        nextBottomY = positionY - COREQ_VERTICAL_GAP;
      }
      for (const it of items) coreqChain.push(it.id);
      continue;
    }

    const depth = Number(colKey.slice(1));
    const x = depth * X_STEP + (depth > 0 ? ROOT_COLUMN_EXTRA : 0);
    const slotHeights = items.map((item) => Math.max(heightOf(item, measuredHeights), Y_STEP));
    const totalHeight = slotHeights.reduce((a, b) => a + b, 0) + Math.max(0, items.length - 1) * Y_GAP;
    let cursor = -totalHeight / 2;
    items.forEach((item, i) => {
      const slot = slotHeights[i];
      const yCenter = cursor + slot / 2;
      cursor += slot + (i < items.length - 1 ? Y_GAP : 0);
      yByItem.set(item.id, yCenter);

      const h = heightOf(item, measuredHeights);
      if (item.kind === "course") {
        const isRoot = item.role === "root";
        const w = isRoot ? ROOT_WIDTH : NODE_WIDTH;
        pushNode(
          {
            id: item.id,
            type: "course",
            // The wider root shifts left by half the extra width so it stays
            // centered on its column (and under the coreq stack).
            position: { x: x - (w - NODE_WIDTH) / 2, y: yCenter - h / 2 },
            data: courseData(item, isRoot, false),
            style: { width: w, ...fadedStyle(item) },
          },
          h,
          w,
        );
      } else {
        pushNode(
          {
            id: item.id,
            type: item.ui === "stacked" ? "radio" : "dropdown",
            position: { x, y: yCenter - h / 2 },
            data: item.data,
            style: { width: NODE_WIDTH, ...fadedStyle(item) },
          },
          h,
        );
      }
    });
  }

  // Rewrite top-level coreq edges (target = root) into a chain: each item's
  // edge points at the item below it; the bottommost still points at root.
  if (coreqChain.length > 0) {
    const targetById = new Map<string, string>();
    for (let i = 0; i < coreqChain.length; i++) {
      targetById.set(coreqChain[i], i < coreqChain.length - 1 ? coreqChain[i + 1] : rootCode);
    }
    for (const edge of edges) {
      if (
        edge.target === rootCode &&
        typeof edge.id === "string" &&
        edge.id.startsWith("coreq:") &&
        targetById.has(edge.source)
      ) {
        const newTarget = targetById.get(edge.source) as string;
        edge.target = newTarget;
        edge.id = `coreq:${edge.source}->${newTarget}`;
        edge.targetHandle = "top-target";
        edge.sourceHandle = "bottom-source";
      }
    }
  }

  const bbox = nodes.length > 0 ? { minX: bboxMinX, maxX: bboxMaxX, minY: bboxMinY, maxY: bboxMaxY } : null;
  return { nodes, edges, depthCount, bbox };
}

// Auto-fit keeps small trees framed while the minimum zoom protects readable
// node labels on larger trees, which remain pannable.
export const FIT_PADDING = 0.05;
export const FIT_MAX_ZOOM = 1;
export const MIN_ZOOM = 0.8;
