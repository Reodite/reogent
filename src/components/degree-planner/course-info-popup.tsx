"use client";

// Portal-rendered course-detail popup. Anchored to a `?` button's bounding
// rect so it can escape the planner's overflow-clip without being trapped
// inside year columns or term scroll areas.
//
// Highlighting strategy:
//   The popup shows UBC's *verbatim* prereq/coreq text and paints unmet
//   portions in the error palette. We walk the AST to find the topmost unmet
//   subtrees (an OR group counts as one clause; an AND is "transparent" and
//   only contributes its unmet children), collect each clause's codes and
//   prose fragments, locate them in the original source, and merge
//   overlapping ranges. Each clause's range is then extended left to
//   include any leading "either" / "one of" / "(a)" / "(" that UBC
//   wrote, and right to include a trailing ")" — so what gets painted
//   matches what UBC bracketed, regardless of whether their phrasing
//   uses "either", "one of", "any of", labeled (a)/(b) lists, etc.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { courseCodeToSlug } from "@/src/lib/pane-route";
import { isSatisfied, type Expr } from "@/src/shared/prereq-ast";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const POPUP_WIDTH = 320;
const POPUP_GAP = 8;
const VIEWPORT_PAD = 8;

// Descriptions aren't in the course index (it would triple the payload), so
// the popup pulls them from /api/courses/{code} on first open and caches for
// the session. `null` = fetched, none available.
const descriptionCache = new Map<string, string | null>();

interface CourseInfoPopupProps {
  course: CourseIndexEntry;
  anchorRect: DOMRect;
  prereqAst?: Expr | null;
  coreqAst?: Expr | null;
  completedBefore?: Set<string>;
  completedSameOrBefore?: Set<string>;
  onClose?: () => void;
}

export function CourseInfoPopup({
  course,
  anchorRect,
  prereqAst,
  coreqAst,
  completedBefore,
  completedSameOrBefore,
  onClose,
}: CourseInfoPopupProps) {
  const api = useApi();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [description, setDescription] = useState<string | null>(descriptionCache.get(course.code) ?? null);

  useEffect(() => {
    if (descriptionCache.has(course.code)) return;
    let cancelled = false;
    api
      .getCourse(course.code)
      .then((doc) => {
        const desc = doc.description?.trim() || null;
        descriptionCache.set(course.code, desc);
        if (!cancelled) setDescription(desc);
      })
      .catch(() => {
        // Leave the cache empty so a later open can retry.
      });
    return () => {
      cancelled = true;
    };
  }, [api, course.code]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: description growth re-measures the popup height so it stays inside the viewport.
  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const popupHeight = popupRef.current.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.right + POPUP_GAP;
    if (left + POPUP_WIDTH > viewportWidth - VIEWPORT_PAD) {
      left = anchorRect.left - POPUP_WIDTH - POPUP_GAP;
    }
    left = Math.max(VIEWPORT_PAD, Math.min(left, viewportWidth - POPUP_WIDTH - VIEWPORT_PAD));

    let top = anchorRect.top;
    if (top + popupHeight > viewportHeight - VIEWPORT_PAD) {
      top = viewportHeight - popupHeight - VIEWPORT_PAD;
    }
    top = Math.max(VIEWPORT_PAD, top);

    setPos({ top, left });
  }, [anchorRect, description]);

  useEffect(() => {
    if (!onClose) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPUP_WIDTH,
        opacity: pos ? 1 : 0,
        zIndex: 50,
      }}
      className="neu-raised bg-surface border-border-subtle flex flex-col gap-2 rounded-lg border p-3 text-sm"
    >
      <h4 className="text-on-surface font-semibold">
        <span className="font-mono">{course.code}</span>
        {course.title && <span className="text-on-surface-variant"> — {course.title}</span>}
      </h4>
      {course.credits != null && (
        <p className="text-on-surface-variant text-xs">
          Credits: <span className="text-on-surface">{course.credits}</span>
        </p>
      )}
      {description && <p className="text-on-surface text-xs leading-relaxed whitespace-pre-wrap">{description}</p>}
      {course.prerequisite && (
        <p className="text-on-surface-variant text-xs">
          <span className="text-muted">Prerequisites: </span>
          <span className="text-on-surface">
            <HighlightedClause source={course.prerequisite} ast={prereqAst} completed={completedBefore} />
          </span>
        </p>
      )}
      {course.corequisite && (
        <p className="text-on-surface-variant text-xs">
          <span className="text-muted">Corequisites: </span>
          <span className="text-on-surface">
            <HighlightedClause source={course.corequisite} ast={coreqAst} completed={completedSameOrBefore} />
          </span>
        </p>
      )}
      <Link
        href={`/tools/courses/${courseCodeToSlug(course.code)}`}
        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
      >
        Open in Course Finder
        <Icon name="externalLink" size={12} />
      </Link>
    </div>,
    document.body,
  );
}

// Render `source` verbatim, painting unmet clauses (per `ast` evaluated
// against `completed`) in the error palette. Falls back to plain text when
// AST or completed-set is missing (lookup results have neither).
function HighlightedClause({
  source,
  ast,
  completed,
}: {
  source: string;
  ast?: Expr | null;
  completed?: Set<string>;
}): ReactNode {
  if (!ast || !completed) return source;
  const spans = collectUnmetSpans(ast, completed, source);
  if (spans.length === 0) return source;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const [start, end] of spans) {
    if (start > cursor) parts.push(source.slice(cursor, start));
    parts.push(
      <mark key={key++} className="bg-error-container text-on-error-container rounded px-1">
        {source.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}

// Walk the AST and emit highlight ranges for each topmost-unmet clause.
//   - and: transparent (recurse into unmet children only)
//   - or:  if all branches unmet, this is one clause covering every code
//          and prose fragment underneath
//   - code: own clause when missing
//   - flattened: own clause when its subExpr is unmet (rendered as the
//                prose UBC used for the branch)
//   - soft / literal: never emit (recommendations don't gate; literals
//                     are unevaluable prose)
//
// Special root case: when the entire prereq is one unmet group (OR or
// flattened at the AST root), highlight the whole source string. UBC's
// labeled "Either (a) … or (b) … or (c) … as a corequisite" pattern
// dominates the text and any trailing prose lives inside that group —
// trying to compute a tight span from token positions inevitably misses
// part of the wording the parser flattened. Honouring the simple
// "anything under the group is red" rule sidesteps that.
function collectUnmetSpans(expr: Expr, completed: Set<string>, source: string): Array<[number, number]> {
  if (isSatisfied(expr, completed)) return [];
  if (expr.kind === "or" || expr.kind === "flattened") {
    return [[0, source.length]];
  }
  const ranges: Array<[number, number]> = [];
  const used = new Array<boolean>(source.length).fill(false);
  walk(expr, ranges, used, completed, source);
  return mergeSpans(ranges);
}

function walk(expr: Expr, out: Array<[number, number]>, used: boolean[], completed: Set<string>, source: string) {
  switch (expr.kind) {
    case "and":
      for (const child of expr.children) {
        if (!isSatisfied(child, completed)) {
          walk(child, out, used, completed, source);
        }
      }
      return;
    case "or": {
      if (!isSatisfied(expr, completed)) {
        const span = clauseSpan(expr, source, used);
        if (span) out.push(span);
      }
      return;
    }
    case "code":
      if (!completed.has(expr.code)) {
        const span = findCode(source, expr.code, used);
        if (span) out.push(span);
      }
      return;
    case "flattened":
      if (expr.subExpr !== null && !isSatisfied(expr.subExpr, completed)) {
        const span = findText(source, expr.text, used);
        if (span) out.push(span);
      }
      return;
    case "soft":
    case "literal":
      return;
  }
}

// Find the source range spanned by all codes + prose fragments inside an
// AST subtree, then extend it left to include any leading grouping words
// ("either", "one of", "any of", labeled "(a)", an opening "(") and
// right to include a trailing ")". This is how an unmet OR gets painted
// as "either A or B" verbatim instead of just "A or B".
function clauseSpan(node: Expr, source: string, used: boolean[]): [number, number] | null {
  const inner: Array<[number, number]> = [];
  collectInnerRanges(node, source, used, inner);
  if (inner.length === 0) return null;
  let start = Math.min(...inner.map((r) => r[0]));
  let end = Math.max(...inner.map((r) => r[1]));
  start = extendLeft(source, start);
  end = extendRight(source, end);
  // Reserve the extended range so a nested same-text code inside another
  // clause doesn't re-claim a position we already covered.
  for (let i = start; i < end; i++) used[i] = true;
  return [start, end];
}

function collectInnerRanges(node: Expr, source: string, used: boolean[], out: Array<[number, number]>) {
  switch (node.kind) {
    case "code": {
      const s = findCode(source, node.code, used);
      if (s) out.push(s);
      return;
    }
    case "literal": {
      const s = findText(source, node.text, used);
      if (s) out.push(s);
      return;
    }
    case "flattened": {
      // Capture the verbatim prose UBC wrote ("advanced credit for MATH
      // 100", "SCIE 001 as a corequisite", …) and also walk subExpr so
      // any code mentioned inside the prose contributes to the range
      // even when the prose-level findText misses (e.g. parser-vs-source
      // whitespace drift). `used` is updated as each range is claimed,
      // so the same span isn't counted twice.
      const s = findText(source, node.text, used);
      if (s) out.push(s);
      if (node.subExpr) collectInnerRanges(node.subExpr, source, used, out);
      return;
    }
    case "and":
    case "or":
      for (const c of node.children) collectInnerRanges(c, source, used, out);
      return;
    case "soft":
      collectInnerRanges(node.child, source, used, out);
      return;
  }
}

const KEYWORD_PREFIXES = ["either", "one of", "any of", "both of", "all of"];

// Walk left from `idx` and absorb whatever grouping wrappers UBC put
// before the unmet clause. Loops until no further progress because a
// single clause can carry multiple layers — e.g. "Either (a) one of …"
// chains <keyword "either"> + <label "(a)"> + <keyword "one of"> before
// the first code, and we want the highlight to include all of them.
function extendLeft(source: string, idx: number): number {
  let i = idx;
  while (true) {
    const before = i;
    i = skipWsLeft(source, i);
    const labelMatch = source.slice(0, i).match(/\(([a-z]|[ivx]+)\)\s*$/i);
    if (labelMatch && labelMatch.index !== undefined) {
      i = labelMatch.index;
    }
    i = skipWsLeft(source, i);
    for (const kw of KEYWORD_PREFIXES) {
      const start = i - kw.length;
      if (start >= 0 && source.slice(start, i).toLowerCase() === kw) {
        // Only accept the keyword if there's a word boundary on the
        // left — otherwise we'd grab the tail of an unrelated word.
        if (start === 0 || !/[A-Za-z]/.test(source[start - 1])) {
          i = start;
          break;
        }
      }
    }
    i = skipWsLeft(source, i);
    if (i > 0 && source[i - 1] === "(") i--;
    if (i === before) break;
  }
  return i;
}

function extendRight(source: string, idx: number): number {
  let i = idx;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (i < source.length && source[i] === ")") i++;
  return i;
}

function skipWsLeft(source: string, i: number): number {
  let j = i;
  while (j > 0 && /\s/.test(source[j - 1])) j--;
  return j;
}

// Locate a course code in `source`. Accepts the canonical "CPSC 110"
// form *or* UBC's "CPSC_V 110" alternate, case-insensitively, and skips
// occurrences that fall inside an already-claimed range so two AST
// nodes referring to the same code (e.g. branch (a) and branch (c)
// both mentioning SCIE 001) attach to *distinct* source occurrences.
// Marks the returned range as used immediately so the next call gets
// the next match.
function findCode(source: string, code: string, used: boolean[]): [number, number] | null {
  const sp = code.indexOf(" ");
  if (sp === -1) return null;
  const subj = code.slice(0, sp);
  const num = code.slice(sp + 1);
  const re = new RegExp(`\\b${escapeRegExp(subj)}(?:_V)?\\s+${escapeRegExp(num)}\\b`, "gi");
  let m: RegExpExecArray | null = re.exec(source);
  while (m !== null) {
    if (!used[m.index]) {
      const range: [number, number] = [m.index, m.index + m[0].length];
      markUsed(used, range[0], range[1]);
      return range;
    }
    m = re.exec(source);
  }
  return null;
}

// Find a literal prose snippet (used for `flattened` text). Case-
// insensitive substring search; whitespace in the needle is collapsed
// to a forgiving \s+ pattern so minor reformatting between parser and
// source doesn't miss the match. Marks the returned range as used so a
// nested code reference inside doesn't re-claim the same span.
function findText(source: string, text: string, used: boolean[]): [number, number] | null {
  const needle = text.trim();
  if (!needle) return null;
  const pattern = needle.split(/\s+/).map(escapeRegExp).join("\\s+");
  const re = new RegExp(pattern, "gi");
  let m: RegExpExecArray | null = re.exec(source);
  while (m !== null) {
    if (!used[m.index]) {
      const range: [number, number] = [m.index, m.index + m[0].length];
      markUsed(used, range[0], range[1]);
      return range;
    }
    m = re.exec(source);
  }
  return null;
}

function markUsed(used: boolean[], start: number, end: number) {
  for (let i = start; i < end && i < used.length; i++) used[i] = true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push([cur[0], cur[1]]);
    }
  }
  return out;
}
