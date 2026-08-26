"use client";

// Degree Planner pane. Four+-column year canvas with per-term course
// blocks, drag-and-drop reordering, prereq/coreq validation, and a right
// sidebar holding the program selector + mini-lookup + trash zone.
//
// DnD architecture: one DndContext for the whole pane. Three drag sources
// (sortable course blocks, draggable lookup results, ghost overlay) and
// two drop targets (term sections, trash bin). onDragEnd switches on the
// active.id prefix and the over.id to route the move/add/delete.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import {
  getProgramIndex,
  getRequirementsFor,
  optionMatches,
  type ProgramRequirements,
} from "@/src/lib/program-requirements";
import {
  autofillCodesForRequirement,
  hasYearRequirements,
  isRequirementMet,
  parseProgramYears,
  requirementKey,
} from "@/src/lib/program-years";
import { isSatisfied, missingPrereqs, parsePrereq, type Expr } from "@/src/shared/prereq-ast";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { CourseBlock } from "./course-block";
import { LookupBlock } from "./lookup-block";
import { MiniCourseLookup } from "./mini-course-lookup";
import { PlanStructure } from "./plan-structure";
import { usePlanner, type PlannerSidebarTab, type Year } from "./planner-store";
import { ProgramProgress, ProgramSelectors } from "./program-requirements";
import { TrashBin } from "./trash-bin";
import { usePlanSync } from "./use-plan-sync";
import { EMPTY_VALIDATION, type BlockValidation } from "./validation";
import { YearColumn } from "./year-column";

const ACTIVE_BLOCK_PREFIX = "block:";
const ACTIVE_LOOKUP_PREFIX = "lookup:";
const TERM_PREFIX = "term:";

// Resolve drop targets in priority order:
//  1. Trash — only when the pointer is literally inside the trash drop
//     zone (pointerWithin).
//  2. Sortable blocks — only when the pointer is literally inside a
//     block (pointerWithin again). This gives precise reorder positions
//     when the user hovers a destination block, and crucially *fails*
//     when the cursor is over an empty term, instead of snapping to
//     "whatever block is geometrically closest" — that previous behaviour
//     masked every empty term because closestCenter always wins.
//  3. Term containers — closestCenter falls back here so dropping in the
//     blank area of a term still lands you in that term, even if it's
//     visually a bit far from any block.
const blockFirstCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const isBlockOrLookup = activeId.startsWith(ACTIVE_BLOCK_PREFIX) || activeId.startsWith(ACTIVE_LOOKUP_PREFIX);
  if (isBlockOrLookup) {
    const trashHit = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => String(c.id) === "trash"),
    });
    if (trashHit.length > 0) return trashHit;

    const blockHit = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(ACTIVE_BLOCK_PREFIX)),
    });
    if (blockHit.length > 0) return blockHit;
  }
  // Last resort: closest term. Filter the candidate set so we don't
  // accidentally resolve to a far-away block again.
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => {
      const id = String(c.id);
      return id.startsWith(TERM_PREFIX) || id === "trash";
    }),
  });
};

function requirementCodesInPlan(req: ProgramRequirements | null, plannedCodes: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!req) return out;
  if (req.kind === "structured") {
    for (const code of plannedCodes) {
      if (req.categories.some((cat) => cat.options.some((opt) => optionMatches(opt, code)))) {
        out.add(code);
      }
    }
    return out;
  }

  const parsed = parseProgramYears(req.text);
  const listedCodes = hasYearRequirements(parsed)
    ? parsed.years.flatMap((year) => year.items.flatMap((item) => (item.kind === "course" ? item.codes : [])))
    : (req.referenced_courses ?? []);
  for (const code of listedCodes) {
    if (plannedCodes.has(code)) out.add(code);
  }
  return out;
}

export function DegreePlannerPane() {
  const api = useApi();
  // Server-backed plan for signed-in accounts (guests stay local-only).
  usePlanSync();
  const years = usePlanner((s) => s.years);
  const major = usePlanner((s) => s.major);
  const addBlock = usePlanner((s) => s.addBlock);
  const moveBlock = usePlanner((s) => s.moveBlock);
  const removeBlock = usePlanner((s) => s.removeBlock);
  const clearAllBlocks = usePlanner((s) => s.clearAllBlocks);
  const ignoredBlocks = usePlanner((s) => s.ignoredBlocks);
  const sidebarCollapsed = usePlanner((s) => s.sidebarCollapsed);
  const sidebarTab = usePlanner((s) => s.sidebarTab);
  const setSidebarTab = usePlanner((s) => s.setSidebarTab);
  const toggleSidebar = usePlanner((s) => s.toggleSidebar);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);

  const [courseIndex, setCourseIndex] = useState<Map<string, CourseIndexEntry> | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [activeDrag, setActiveDrag] = useState<
    { kind: "block"; blockId: string; code: string } | { kind: "lookup"; code: string } | null
  >(null);
  const [requirements, setRequirements] = useState<ProgramRequirements | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadNonce re-triggers the fetch from the Retry button.
  useEffect(() => {
    let cancelled = false;
    setIndexError(false);
    api
      .getCourseIndex()
      .then(({ courses }) => {
        if (!cancelled) setCourseIndex(new Map(courses.map((c) => [c.code, c])));
      })
      .catch(() => {
        if (!cancelled) setIndexError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, loadNonce]);

  useEffect(() => {
    let cancelled = false;
    if (!major) {
      queueMicrotask(() => {
        if (!cancelled) setRequirements(null);
      });
      return () => {
        cancelled = true;
      };
    }
    getRequirementsFor(major).then((req) => {
      if (!cancelled) setRequirements(req);
    });
    return () => {
      cancelled = true;
    };
  }, [major]);

  // Keyboard shortcuts for the planner: Ctrl/Cmd+Z undoes, Ctrl/Cmd+
  // Shift+Z and Ctrl+Y redo. Skipped while a text field is focused so we
  // don't hijack native editing in inputs or the course search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      e.preventDefault();
      const { past, future } = usePlanner.getState();
      if (key === "y" || (key === "z" && e.shiftKey)) {
        if (future.length > 0) redo();
      } else if (past.length > 0) {
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const sensors = useSensors(
    // 4-px activation distance so a click on a block (e.g. to read the
    // details popup) doesn't immediately start a drag and consume the event.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Per-block validation. Walks years/terms in order, building the
  // cumulative completed-set as we go: prereqs check against strictly-
  // earlier terms, coreqs check against earlier-or-same. Recomputes
  // whenever the years tree changes or the course index resolves.
  const ignoredSet = useMemo(() => new Set(ignoredBlocks), [ignoredBlocks]);

  const validations = useMemo<Map<string, BlockValidation>>(() => {
    const out = new Map<string, BlockValidation>();
    if (!courseIndex) return out;
    const cumulative = new Set<string>();
    for (const year of years) {
      for (const term of year.terms) {
        const codesThisTerm = new Set(term.blocks.map((b) => b.code));
        const completedBefore = new Set(cumulative);
        const completedSameOrBefore = new Set([...cumulative, ...codesThisTerm]);
        for (const block of term.blocks) {
          const entry = courseIndex.get(block.code);
          if (!entry) {
            out.set(block.id, {
              ok: true,
              missing: [],
              completedBefore,
              completedSameOrBefore,
            });
            continue;
          }
          const prereqAst = parsePrereq(entry.prerequisite);
          const coreqAst = parsePrereq(entry.corequisite);
          const missing: string[] = [];
          if (prereqAst && !isSatisfied(prereqAst, completedBefore)) {
            missing.push(...missingPrereqs(prereqAst, completedBefore).map((m) => `prereq ${m}`));
          }
          if (coreqAst && !isSatisfied(coreqAst, completedSameOrBefore)) {
            missing.push(...missingPrereqs(coreqAst, completedSameOrBefore).map((m) => `coreq ${m}`));
          }
          const ignored = ignoredSet.has(block.id);
          out.set(block.id, {
            ok: missing.length === 0 || ignored,
            missing,
            completedBefore,
            completedSameOrBefore,
          });
        }
        for (const code of codesThisTerm) cumulative.add(code);
      }
    }
    return out;
  }, [years, courseIndex, ignoredSet]);

  const plannedCodes = useMemo(() => {
    const out = new Set<string>();
    for (const year of years) {
      for (const term of year.terms) {
        for (const block of term.blocks) out.add(block.code);
      }
    }
    return out;
  }, [years]);

  const requirementCodes = useMemo(
    () => requirementCodesInPlan(requirements, plannedCodes),
    [requirements, plannedCodes],
  );

  function findBlockYearTerm(blockId: string): { year: Year; termIdx: number; pos: number } | null {
    for (const year of years) {
      for (let ti = 0; ti < year.terms.length; ti++) {
        const pos = year.terms[ti].blocks.findIndex((b) => b.id === blockId);
        if (pos !== -1) return { year, termIdx: ti, pos };
      }
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith(ACTIVE_BLOCK_PREFIX)) {
      const blockId = id.slice(ACTIVE_BLOCK_PREFIX.length);
      for (const year of years) {
        for (const term of year.terms) {
          const b = term.blocks.find((x) => x.id === blockId);
          if (b) {
            setActiveDrag({ kind: "block", blockId, code: b.code });
            return;
          }
        }
      }
      return;
    }
    if (id.startsWith(ACTIVE_LOOKUP_PREFIX)) {
      setActiveDrag({ kind: "lookup", code: id.slice(ACTIVE_LOOKUP_PREFIX.length) });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // === Lookup → term: spawn a new block. Dropping a lookup on trash
    // is a no-op (you can't delete something that never existed). ===
    if (activeId.startsWith(ACTIVE_LOOKUP_PREFIX)) {
      const code = activeId.slice(ACTIVE_LOOKUP_PREFIX.length);
      if (!code) return;
      if (overId === "trash") return;
      // Drop target can be either a term container or another block
      // inside one (closestCenter likes to resolve to the nearest sortable
      // item). Walk the data to recover (yearId, termIdx).
      const dest = resolveTermDrop(overId, years);
      if (!dest) return;
      addBlock(dest.yearId, dest.termIdx, code);
      return;
    }

    // === Block → trash: delete. ===
    if (overId === "trash" && activeId.startsWith(ACTIVE_BLOCK_PREFIX)) {
      removeBlock(activeId.slice(ACTIVE_BLOCK_PREFIX.length));
      return;
    }

    // === Block → term (or another block): move/reorder. ===
    if (activeId.startsWith(ACTIVE_BLOCK_PREFIX)) {
      const blockId = activeId.slice(ACTIVE_BLOCK_PREFIX.length);
      const src = findBlockYearTerm(blockId);
      if (!src) return;
      const dest = resolveTermDrop(overId, years);
      if (!dest) return;
      let insertPos = dest.pos;
      if (insertPos === -1) {
        const destTerm = years.find((y) => y.id === dest.yearId)?.terms[dest.termIdx];
        insertPos = destTerm?.blocks.length ?? 0;
      } else if (src.year.id === dest.yearId && src.termIdx === dest.termIdx && src.pos < dest.pos) {
        // Dragging downward within the same term: insert AFTER the
        // target block so the move is visible. Without this +1 the
        // `sourcePos < toPos` adjustment in moveBlock collapses the
        // move back to the original position.
        insertPos = dest.pos + 1;
      }
      moveBlock(blockId, dest.yearId, dest.termIdx, insertPos);
    }
  }

  if (indexError) {
    return (
      <div className="grid h-full place-items-center p-6">
        <p role="alert" className="border-error/30 bg-error-container text-error rounded-lg border px-3 py-2 text-sm">
          Couldn't load the course index.{" "}
          <button
            type="button"
            className="focus-visible:ring-primary/40 text-primary rounded-sm underline focus-visible:ring-2"
            onClick={() => setLoadNonce((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }
  if (!courseIndex) {
    return (
      <div className="text-muted flex h-full items-center justify-center gap-1.5 p-6 text-sm" aria-live="polite">
        <span className="border-muted size-3 animate-spin rounded-full border-2 border-t-transparent" />
        Loading course index…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={blockFirstCollision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div data-pane-root="degree-planner" className="flex h-full min-h-0 flex-col p-4">
        <div
          className="grid min-h-0 flex-1 gap-4"
          style={{
            gridTemplateColumns: sidebarCollapsed ? "minmax(0,1fr) 2.5rem" : "minmax(0,1fr) 20rem",
          }}
        >
          <div className="flex min-h-0 flex-col gap-3">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Degree Planner</h2>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div
                className="grid h-full gap-3"
                style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))` }}
              >
                {years.map((year) => (
                  <YearColumn
                    key={year.id}
                    year={year}
                    courseIndex={courseIndex}
                    validations={validations}
                    requirementCodes={requirementCodes}
                  />
                ))}
              </div>
            </div>
          </div>

          {sidebarCollapsed ? (
            <CollapsedSidebar
              onExpand={(tab) => {
                setSidebarTab(tab);
                toggleSidebar();
              }}
              onToggle={toggleSidebar}
            />
          ) : (
            <aside className="neu-panel border-border bg-surface-container-low flex min-h-0 flex-col gap-2 rounded-xl border p-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-lg p-1"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <Icon name="right" size={16} />
                </button>
                <div className="flex flex-1 gap-1">
                  <SidebarTabButton
                    active={sidebarTab === "preferences"}
                    onClick={() => setSidebarTab("preferences")}
                    label="Info"
                    icon="info"
                  />
                  <SidebarTabButton
                    active={sidebarTab === "progress"}
                    onClick={() => setSidebarTab("progress")}
                    label="Progress"
                    icon="checkbox"
                  />
                  <SidebarTabButton
                    active={sidebarTab === "courses"}
                    onClick={() => setSidebarTab("courses")}
                    label="Courses"
                    icon="book2"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                {sidebarTab === "preferences" && (
                  <div className="flex flex-col gap-4">
                    <PlanStructure />
                    <ProgramSelectors />
                  </div>
                )}
                {sidebarTab === "progress" && <ProgramProgress courseIndex={courseIndex} plannedCodes={plannedCodes} />}
                {sidebarTab === "courses" && <MiniCourseLookup courseIndex={courseIndex} />}
              </div>
              {/* Actions live as a footer under the Courses tab, just above
                  the trash bin. */}
              {sidebarTab === "courses" && (
                <ActionsSection
                  years={years}
                  validations={validations}
                  ignoredSet={ignoredSet}
                  courseIndex={courseIndex}
                  plannedCodes={plannedCodes}
                  onClearAll={() => {
                    const total = years.reduce((n, y) => n + y.terms.reduce((m, t) => m + t.blocks.length, 0), 0);
                    if (total === 0) return;
                    if (window.confirm(`Remove all ${total} course(s) from the plan?`)) {
                      clearAllBlocks();
                    }
                  }}
                />
              )}
              {/* Trash sits outside the tab area so it's always a valid
                  drop target regardless of which page is showing. */}
              <TrashBin />
            </aside>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.kind === "block" && (
          <CourseBlock
            blockId={activeDrag.blockId}
            code={activeDrag.code}
            entry={courseIndex.get(activeDrag.code)}
            validation={validations.get(activeDrag.blockId) ?? EMPTY_VALIDATION}
            fulfillsRequirement={requirementCodes.has(activeDrag.code)}
            ghost
          />
        )}
        {activeDrag?.kind === "lookup" && courseIndex.get(activeDrag.code) && (
          <div style={{ width: "18rem" }}>
            <LookupBlock entry={courseIndex.get(activeDrag.code) as CourseIndexEntry} ghost />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SidebarTabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: IconName;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors ${
        active
          ? "neu-raised bg-surface text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      <Icon name={icon} size={14} className="text-primary shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

// Slim strip shown when the right sidebar is collapsed. Holds the expand
// arrow, page-icon shortcuts (click to expand + jump to that page), and
// the trash drop zone so deletion still works without expanding.
function CollapsedSidebar({
  onExpand,
  onToggle,
}: {
  onExpand: (tab: PlannerSidebarTab) => void;
  onToggle: () => void;
}) {
  const stripBtn =
    "text-on-surface-variant hover:bg-surface-container hover:text-on-surface flex w-full justify-center rounded-lg p-1";
  return (
    <aside className="neu-panel border-border bg-surface-container-low flex flex-col items-center gap-2 rounded-xl border p-1">
      <button type="button" onClick={onToggle} className={stripBtn} aria-label="Expand sidebar" title="Expand sidebar">
        <Icon name="left" size={16} />
      </button>
      <button type="button" onClick={() => onExpand("preferences")} className={stripBtn} title="Info">
        <Icon name="info" size={16} className="text-primary" />
      </button>
      <button type="button" onClick={() => onExpand("progress")} className={stripBtn} title="Progress">
        <Icon name="checkbox" size={16} className="text-primary" />
      </button>
      <button type="button" onClick={() => onExpand("courses")} className={stripBtn} title="Courses">
        <Icon name="book2" size={16} className="text-primary" />
      </button>
      <div className="flex-1" />
      <TrashBin compact />
    </aside>
  );
}

function ActionsSection({
  years,
  validations,
  ignoredSet,
  courseIndex,
  plannedCodes,
  onClearAll,
}: {
  years: Year[];
  validations: Map<string, BlockValidation>;
  ignoredSet: Set<string>;
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
  onClearAll: () => void;
}) {
  const shell = useChatShellOptional();
  const major = usePlanner((s) => s.major);
  const addBlocks = usePlanner((s) => s.addBlocks);
  const toggleIgnoreBlock = usePlanner((s) => s.toggleIgnoreBlock);
  const checkedRequirements = usePlanner((s) => s.checkedRequirements);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  const erroredBlocks = useMemo(() => {
    const out: { id: string; code: string }[] = [];
    for (const year of years) {
      for (const term of year.terms) {
        for (const block of term.blocks) {
          const v = validations.get(block.id);
          if (v && v.missing.length > 0) out.push(block);
        }
      }
    }
    return out;
  }, [years, validations]);

  // Autofill in two passes: (1) place each required course as early as its
  // prerequisites and corequisites allow, then (2) push courses back, term by
  // term, until every term is within the computed course load target
  // (required courses / total terms, rounded up). One-of rows take the first
  // listed course, all-of rows take every course; rows already fulfilled (a
  // satisfying course planned, or a manual check), unknown codes, and anything
  // already in the plan are skipped.
  async function handleAutofill() {
    if (!major) {
      window.alert("Select a major / program first.");
      return;
    }
    setFilling(true);
    try {
      const req = await getRequirementsFor(major);
      const parsed = req?.kind === "prose" ? parseProgramYears(req.text) : null;
      if (!req || !parsed || !hasYearRequirements(parsed)) {
        window.alert("No year-by-year requirements found for this program.");
        return;
      }
      const checked = new Set(checkedRequirements);
      // Existing blocks are fixed anchors — autofill never moves what the user
      // placed by hand; it only schedules the courses it adds.
      const planned = new Set(plannedCodes);

      // 1) Gather the courses to place — a flat list in requirement order.
      //    One-of → first listed course; all-of → every course.
      //    Skip rows already fulfilled / manually checked, unknown codes, and
      //    anything already in the plan.
      const toPlace: string[] = [];
      const willPlace = new Set<string>();
      const requiredCourseCodes = new Set<string>();
      const preferredWindow = new Map<string, { start: number; end: number }>();
      const placeOrder = new Map<string, number>();
      const yearNameToIndex: Record<string, number> = {
        "1": 0,
        first: 0,
        one: 0,
        "2": 1,
        second: 1,
        two: 1,
        "3": 2,
        third: 2,
        three: 2,
        "4": 3,
        fourth: 3,
        four: 3,
        "5": 4,
        fifth: 4,
        five: 4,
      };
      const requirementYearWindow = (label: string, fallback: number): { start: number; end: number } => {
        const lower = label.toLowerCase();
        const word = lower.match(
          /\b(first|second|third|fourth|fifth)\b(?:\s+and\s+\b(first|second|third|fourth|fifth)\b)?/,
        );
        if (word) {
          const first = yearNameToIndex[word[1]];
          const second = word[2] ? yearNameToIndex[word[2]] : first;
          return { start: Math.min(first, second), end: Math.max(first, second) };
        }
        const numeric = lower.match(/\byear\s+([1-5]|one|two|three|four|five)\b/);
        if (numeric) {
          const yearIdx = yearNameToIndex[numeric[1]];
          return { start: yearIdx, end: yearIdx };
        }
        return { start: fallback, end: fallback };
      };
      const scheduledCodesForRequirement = (item: {
        mode: "oneof" | "all";
        codes: string[];
        groups: string[][];
      }): string[] => {
        if (item.groups.length > 0) {
          return item.groups.map((group) => group.find((c) => planned.has(c)) ?? group[0]).filter(Boolean);
        }
        if (item.mode === "oneof") {
          const code = item.codes.find((c) => planned.has(c)) ?? item.codes[0];
          return code ? [code] : [];
        }
        return item.codes;
      };
      const addAutofillCourse = (code: string, window: { start: number; end: number }): void => {
        if (!courseIndex.has(code)) return;
        if (!preferredWindow.has(code)) preferredWindow.set(code, window);
        if (!placeOrder.has(code)) placeOrder.set(code, toPlace.length);
        if (planned.has(code) || willPlace.has(code)) return;
        willPlace.add(code);
        toPlace.push(code);
      };
      for (const [pyearIdx, pyear] of parsed.years.entries()) {
        const rawWindow = requirementYearWindow(pyear.label, pyearIdx);
        const window = {
          start: Math.max(0, Math.min(rawWindow.start, years.length - 1)),
          end: Math.max(0, Math.min(rawWindow.end, years.length - 1)),
        };
        for (const item of pyear.items) {
          if (item.kind !== "course") continue;
          const key = requirementKey(req.program_url, pyear.label, item);
          if (!checked.has(key)) {
            for (const code of scheduledCodesForRequirement(item)) {
              if (courseIndex.has(code)) requiredCourseCodes.add(code);
            }
          }
          if (isRequirementMet(item, planned) || checked.has(key)) continue;
          const chosen = autofillCodesForRequirement(item);
          for (const code of chosen) {
            addAutofillCourse(code, window);
          }
        }
      }

      // Every code referenced anywhere in a parsed requirement expression.
      // Used to expand prerequisite closure and wire up the push-back safety
      // map.
      const astCodes = (e: Expr | null): string[] => {
        if (!e) return [];
        switch (e.kind) {
          case "code":
            return [e.code];
          case "and":
          case "or":
            return e.children.flatMap(astCodes);
          case "flattened":
            return astCodes(e.subExpr);
          case "soft":
            return astCodes(e.child);
          default:
            return [];
        }
      };
      const prereqAstOf = (code: string): Expr | null => {
        const entry = courseIndex.get(code);
        return entry ? parsePrereq(entry.prerequisite) : null;
      };
      const coreqAstOf = (code: string): Expr | null => {
        const entry = courseIndex.get(code);
        return entry ? parsePrereq(entry.corequisite) : null;
      };
      const pickPrereqCodes = (e: Expr | null, selected: Set<string>): string[] => {
        if (!e) return [];
        switch (e.kind) {
          case "code":
            return courseIndex.has(e.code) ? [e.code] : [];
          case "and":
            return [
              ...new Set(
                e.children.flatMap((c) =>
                  c.kind === "literal" || c.kind === "soft" ? [] : pickPrereqCodes(c, selected),
                ),
              ),
            ];
          case "or": {
            const options = e.children
              .map((child, idx) => ({ idx, codes: pickPrereqCodes(child, selected) }))
              .filter((option) => option.codes.length > 0);
            options.sort(
              (a, b) =>
                a.codes.filter((code) => !selected.has(code)).length -
                  b.codes.filter((code) => !selected.has(code)).length ||
                a.codes.length - b.codes.length ||
                a.idx - b.idx,
            );
            return options[0]?.codes ?? [];
          }
          case "flattened":
            return pickPrereqCodes(e.subExpr, selected);
          case "soft":
          case "literal":
            return [];
        }
      };
      const prerequisiteWindowFor = (dependentCode: string): { start: number; end: number } => {
        const dependentWindow = preferredWindow.get(dependentCode);
        if (!dependentWindow) return { start: 0, end: years.length - 1 };
        return { start: 0, end: Math.max(0, dependentWindow.start) };
      };
      for (let i = 0; i < toPlace.length; i++) {
        const code = toPlace[i];
        const selected = new Set([...planned, ...willPlace]);
        for (const prereq of pickPrereqCodes(prereqAstOf(code), selected)) {
          if (!courseIndex.has(prereq)) continue;
          requiredCourseCodes.add(prereq);
          addAutofillCourse(prereq, prerequisiteWindowFor(code));
        }
      }
      if (toPlace.length === 0) {
        window.alert("All requirements are already in the plan or fulfilled.");
        return;
      }

      // Every code that will live in the plan once we're done. Only courses
      // actually present can constrain ordering, so prereq/coreq edges below
      // are filtered to this set.
      const planSet = new Set([...planned, ...willPlace]);

      // Linear list of (year, term) slots in chronological order, and where
      // each course currently sits. Existing blocks seed `slot` as anchors.
      const slotOf: { yearIdx: number; termIdx: number }[] = [];
      const slot = new Map<string, number>();
      for (const [y, year] of years.entries()) {
        for (const [t, term] of year.terms.entries()) {
          const gi = slotOf.length;
          slotOf.push({ yearIdx: y, termIdx: t });
          for (const b of term.blocks) slot.set(b.code, gi);
        }
      }
      const lastSlot = slotOf.length - 1;
      if (lastSlot < 0) return;
      const coursesPerTermTarget = Math.max(1, Math.ceil(requiredCourseCodes.size / slotOf.length));
      const firstSlotInYear = years.map((_, yearIdx) => slotOf.findIndex((s) => s.yearIdx === yearIdx));
      const preferredStartSlot = (code: string): number => {
        const window = preferredWindow.get(code);
        if (!window) return 0;
        const gi = firstSlotInYear[window.start];
        return gi >= 0 ? gi : 0;
      };

      // 2) PLACE NEAR THE REQUIREMENT YEAR. To order a course we walk its
      //    prereq / coreq AST and ask: by which term does the *plan* satisfy
      //    it? The course starts no earlier than the year where the requirement
      //    row starts unless an existing prerequisite/corequisite anchor
      //    forces it later. An AND needs its latest child; an OR (an "either A,
      //    B, C") needs only its EARLIEST satisfiable branch — so a big "or"
      //    never floats a course to term 0 just because two of its options
      //    happen to both be planned, and never forces it after options it
      //    doesn't need. Branches the plan can't satisfy (a code not planned)
      //    and prose conditions ("third-year standing") impose no ordering.
      //    `reqSlot` returns that term, or null when nothing in the plan
      //    constrains it. Memoised + cycle-safe; an existing anchor reports
      //    its fixed slot.
      const earliestMemo = new Map<string, number>();
      function reqSlot(e: Expr | null, stack: Set<string>): number | null {
        if (!e) return null;
        switch (e.kind) {
          case "code":
            return planSet.has(e.code) ? earliest(e.code, stack) : null;
          case "and": {
            // Need every evaluable conjunct; satisfied at the latest planned
            // one. Missing/unplanned conjuncts still show as validation
            // errors later, but they must not erase ordering constraints from
            // the planned prerequisites we do know about.
            let max = -1;
            for (const c of e.children) {
              if (c.kind === "literal" || c.kind === "soft") continue;
              const s = reqSlot(c, stack);
              if (s !== null) max = Math.max(max, s);
            }
            return max < 0 ? null : max;
          }
          case "or": {
            // Any one branch suffices — constrain by the earliest satisfiable.
            let min = Number.POSITIVE_INFINITY;
            for (const c of e.children) {
              const s = reqSlot(c, stack);
              if (s !== null) min = Math.min(min, s);
            }
            return min === Number.POSITIVE_INFINITY ? null : min;
          }
          case "flattened":
            return reqSlot(e.subExpr, stack);
          case "soft":
          case "literal":
            return null;
        }
      }
      function earliest(code: string, stack = new Set<string>()): number {
        if (slot.has(code) && !willPlace.has(code)) return slot.get(code) as number;
        const cached = earliestMemo.get(code);
        if (cached != null) return cached;
        if (stack.has(code)) return preferredStartSlot(code);
        stack.add(code);
        let e = preferredStartSlot(code);
        const pre = reqSlot(prereqAstOf(code), stack);
        if (pre !== null) e = Math.max(e, pre + 1); // prereqs finish earlier
        const co = reqSlot(coreqAstOf(code), stack);
        if (co !== null) e = Math.max(e, co); // coreqs may share the term
        stack.delete(code);
        e = Math.min(e, lastSlot);
        earliestMemo.set(code, e);
        return e;
      }
      for (const code of toPlace) slot.set(code, earliest(code));

      // Per-term course count, plus a reverse dependency map so the push-back
      // pass never moves a course onto — or past — something that might need it
      // first (existing blocks included). We treat any in-plan code a course
      // references as a potential edge: conservative, so a push is only ever
      // wrongly blocked (term left a touch heavy), never wrongly allowed.
      const load: number[] = slotOf.map(() => 0);
      for (const gi of slot.values()) load[gi]++;
      const dependents = new Map<string, { code: string; type: "pre" | "co" }[]>();
      const addDep = (dep: string, code: string, type: "pre" | "co") => {
        const arr = dependents.get(dep) ?? [];
        arr.push({ code, type });
        dependents.set(dep, arr);
      };
      for (const code of planSet) {
        for (const p of astCodes(prereqAstOf(code))) if (planSet.has(p)) addDep(p, code, "pre");
        for (const q of astCodes(coreqAstOf(code))) if (planSet.has(q)) addDep(q, code, "co");
      }
      // Moving `code` into slot `toGi` is safe only while every dependent still
      // lands later (prereq) or no earlier (coreq).
      const canPush = (code: string, toGi: number): boolean => {
        for (const d of dependents.get(code) ?? []) {
          const dGi = slot.get(d.code);
          if (dGi == null) continue;
          if (d.type === "pre" && dGi <= toGi) return false;
          if (d.type === "co" && dGi < toGi) return false;
        }
        return true;
      };
      const preferredYearDistance = (code: string, gi: number): number => {
        const window = preferredWindow.get(code);
        if (!window) return 0;
        const yearIdx = slotOf[gi].yearIdx;
        if (yearIdx < window.start) return window.start - yearIdx;
        if (yearIdx > window.end) return yearIdx - window.end;
        return 0;
      };
      const worsensPreferredYearDistance = (code: string, fromGi: number, toGi: number): boolean =>
        preferredYearDistance(code, toGi) > preferredYearDistance(code, fromGi);
      const pushCost = (code: string, toGi: number): number =>
        preferredYearDistance(code, toGi) * 1000 + Math.max(0, toGi - preferredStartSlot(code));

      // 3) PUSH BACK TO MEET THE LIMIT. Sweep terms earliest → latest; while a
      //    term is over the computed load target, push one course we added into
      //    the next term (never a user-placed block), choosing one that can
      //    move without breaking an order. Prefer moves that stay in the
      //    mentioned year/window; when the year is over capacity, allow
      //    spillover but make each extra year increasingly expensive. Then
      //    choose the course with the fewest dependents (keep the heavily-
      //    depended-on courses early). Repeat the sweep because moving a
      //    dependent course later can open room for its prerequisite on an
      //    earlier term. The limit is a soft target: if nothing can move, the
      //    term is left a little heavy rather than dropping a required course.
      let pushed = true;
      while (pushed) {
        pushed = false;
        for (let gi = 0; gi < lastSlot; gi++) {
          while (load[gi] > coursesPerTermTarget) {
            const movable = toPlace.filter((c) => slot.get(c) === gi && canPush(c, gi + 1));
            if (movable.length === 0) break;
            const preferredMovable = movable.filter((c) => !worsensPreferredYearDistance(c, gi, gi + 1));
            const candidates = preferredMovable.length > 0 ? preferredMovable : movable;
            candidates.sort(
              (a, b) =>
                pushCost(a, gi + 1) - pushCost(b, gi + 1) ||
                (dependents.get(a)?.length ?? 0) - (dependents.get(b)?.length ?? 0) ||
                (placeOrder.get(b) ?? 0) - (placeOrder.get(a) ?? 0) ||
                a.localeCompare(b),
            );
            const c = candidates[0];
            slot.set(c, gi + 1);
            load[gi]--;
            load[gi + 1]++;
            pushed = true;
          }
        }
      }

      // Insert as one batch so the whole autofill is a single undo step.
      addBlocks(
        toPlace.map((code) => {
          const { yearIdx, termIdx } = slotOf[slot.get(code) as number];
          return { yearId: years[yearIdx].id, termIdx, code };
        }),
      );
    } finally {
      setFilling(false);
    }
  }

  // Plain-text table of the current plan. Sent as the Ask AI attachment so the
  // agent sees exactly what's on the board; shown in chat as a file bubble.
  async function handleAskAi() {
    const lines: string[] = [];
    if (major) {
      try {
        const title = (await getProgramIndex()).byUrl.get(major)?.title;
        if (title) lines.push(`Program: ${title}`, "");
      } catch {
        // Program index unavailable — the table alone is still useful.
      }
    }
    for (const year of years) {
      lines.push(year.label);
      for (const [i, term] of year.terms.entries()) {
        const credits = term.blocks.reduce((sum, b) => sum + (courseIndex.get(b.code)?.credits ?? 0), 0);
        lines.push(`  Term ${i + 1} (${credits} credits):`);
        if (term.blocks.length === 0) lines.push("    (empty)");
        for (const b of term.blocks) {
          const entry = courseIndex.get(b.code);
          lines.push(
            `    ${b.code} — ${entry?.title ?? "Unknown course"}${entry?.credits != null ? ` (${entry.credits} cr)` : ""}`,
          );
        }
      }
      lines.push("");
    }
    shell?.askAi("Help me plan my degree:", { title: "Degree course table", content: lines.join("\n").trimEnd() });
  }

  const btnClass =
    "neu-button bg-surface flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-xs text-on-surface-variant hover:text-on-surface transition-colors";
  // Undo/Redo reuse btnClass but dim + lock when their stack is empty.
  const disabledBtnClass = `${btnClass} disabled:opacity-40 disabled:pointer-events-none`;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-on-surface text-sm font-semibold">Actions</h3>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={disabledBtnClass}>
          <Icon name="undo" size={14} className="text-primary" />
          <span>Undo</span>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className={disabledBtnClass}
        >
          <Icon name="redo" size={14} className="text-primary" />
          <span>Redo</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={onClearAll} className={btnClass}>
          <Icon name="trash" size={14} className="text-primary" />
          <span>Clear All</span>
        </button>
        <button type="button" onClick={() => setIgnoreOpen((o) => !o)} aria-pressed={ignoreOpen} className={btnClass}>
          <Icon name="eyeOff" size={14} className="text-primary" />
          <span>Ignore Error</span>
        </button>
        <button type="button" onClick={handleAutofill} disabled={filling} className={`${btnClass} disabled:opacity-50`}>
          <Icon name="sparkles" size={14} className="text-primary" />
          <span>{filling ? "Filling…" : "Autofill"}</span>
        </button>
        <button type="button" onClick={handleAskAi} className={btnClass}>
          <Icon name="chat1" size={14} className="text-primary" />
          <span>Ask AI</span>
        </button>
      </div>
      {ignoreOpen && (
        <div className="border-border bg-surface flex flex-col gap-1 rounded-lg border p-2">
          {erroredBlocks.length === 0 ? (
            <p className="text-muted text-xs italic">No errors to ignore</p>
          ) : (
            erroredBlocks.map((block) => (
              <label
                key={block.id}
                className="hover:bg-surface-container flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={ignoredSet.has(block.id)}
                  onChange={() => toggleIgnoreBlock(block.id)}
                  className="accent-primary"
                />
                <span className="text-on-surface font-mono">{block.code}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Drop targets come in two shapes: explicit term droppables (id pattern
// `term:${yearId}:${termIdx}`) and sortable course blocks within a term
// (id pattern `block:${blockId}`). When the user drops on a block,
// resolve the (year, term, position) of *that block* so the new item
// inserts just before it.
function resolveTermDrop(overId: string, years: Year[]): { yearId: string; termIdx: number; pos: number } | null {
  if (overId.startsWith(TERM_PREFIX)) {
    const rest = overId.slice(TERM_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    if (sep === -1) return null;
    const yearId = rest.slice(0, sep);
    const termIdx = Number(rest.slice(sep + 1));
    if (Number.isNaN(termIdx)) return null;
    return { yearId, termIdx, pos: -1 };
  }
  if (overId.startsWith("block:")) {
    const blockId = overId.slice("block:".length);
    for (const year of years) {
      for (let ti = 0; ti < year.terms.length; ti++) {
        const pos = year.terms[ti].blocks.findIndex((b) => b.id === blockId);
        if (pos !== -1) return { yearId: year.id, termIdx: ti, pos };
      }
    }
  }
  return null;
}
