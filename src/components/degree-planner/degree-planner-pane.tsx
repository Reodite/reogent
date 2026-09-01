"use client";

// Degree Planner pane. Four+-column year canvas with per-term course
// blocks, drag-and-drop reordering, prereq/coreq validation, and a left rail
// holding requirements and course search.
//
// DnD architecture: one DndContext for the whole pane. Three drag sources
// (sortable course blocks, draggable lookup results, ghost overlay) and
// two drop targets (term sections, trash bin). onDragEnd switches on the
// active.id prefix and the over.id to route the move/add/delete.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useChatShellOptional } from "@/src/components/chat/chat-shell-context";
import {
  DRAG_DROP_ANIMATION,
  DragOverlayFrame,
  useDragOverlayPhysics,
} from "@/src/components/dnd/drag-overlay-physics";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { Button } from "@/src/components/ui/button";
import { RetryAlert } from "@/src/components/ui/feedback";
import { buildAutofillPlan, type AutofillResult } from "@/src/lib/planner-autofill";
import { getProgramIndex, getRequirementsFor } from "@/src/lib/program-requirements";
import { hasYearRequirements, parseProgramYears } from "@/src/lib/program-years";
import { isSatisfied, missingPrereqs, parsePrereq } from "@/src/shared/prereq-ast";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { CourseBlock } from "./course-block";
import { LookupBlock } from "./lookup-block";
import { MiniCourseLookup } from "./mini-course-lookup";
import { PlanStructure } from "./plan-structure";
import { SEASON_META, usePlanner, type Year } from "./planner-store";
import { ProgramProgress, ProgramSelectors } from "./program-requirements";
import { TrashBin } from "./trash-bin";
import { usePlanSync } from "./use-plan-sync";
import { describeIssue, EMPTY_VALIDATION, findDuplicateCourseCodes, type BlockValidation } from "./validation";
import { YearColumn } from "./year-column";

const ACTIVE_BLOCK_PREFIX = "block:";
const ACTIVE_LOOKUP_PREFIX = "lookup:";
const ACTIVE_REQUIREMENT_PREFIX = "requirement:";
const TERM_PREFIX = "term:";

function setPlannerDragCursor(dragging: boolean) {
  document.documentElement.toggleAttribute("data-planner-dragging", dragging);
}

function resolvePlannerDragSource(event: DragStartEvent): HTMLElement | null {
  const target = event.activatorEvent.target;
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-block-id], [data-lookup-code], [data-requirement-key]")
    : null;
}

// Resolve drop targets in priority order:
//  1. Trash — only when the pointer is literally inside the trash drop
//     zone (pointerWithin).
//  2. Sortable blocks — only when the pointer is literally inside a
//     block (pointerWithin again). This gives precise reorder positions
//     when the user hovers a destination block, and crucially *fails*
//     when the cursor is over an empty term; without this priority,
//     closestCenter would resolve the nearest block in another term and
//     the empty term would never receive the drop.
//  3. Term containers — closestCenter falls back here so dropping in the
//     blank area of a term still lands you in that term, even if it's
//     visually a bit far from any block.
const blockFirstCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const isCourseDrag =
    activeId.startsWith(ACTIVE_BLOCK_PREFIX) ||
    activeId.startsWith(ACTIVE_LOOKUP_PREFIX) ||
    activeId.startsWith(ACTIVE_REQUIREMENT_PREFIX);
  if (isCourseDrag) {
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

function dropLabel(overId: string, years: Year[]): string | null {
  if (overId === "trash") return "remove area";
  const destination = resolveTermDrop(overId, years);
  if (!destination) return null;
  const year = years.find((item) => item.id === destination.yearId);
  const term = year?.terms[destination.termIdx];
  return year && term ? `${year.label}, ${SEASON_META[term.season].short}` : null;
}

export function DegreePlannerPane() {
  const api = useApi();
  // Server-backed plan for signed-in accounts (guests stay local-only).
  usePlanSync();
  const years = usePlanner((s) => s.years);
  const addBlock = usePlanner((s) => s.addBlock);
  const moveBlock = usePlanner((s) => s.moveBlock);
  const removeBlock = usePlanner((s) => s.removeBlock);
  const clearAllBlocks = usePlanner((s) => s.clearAllBlocks);
  const ignoredBlocks = usePlanner((s) => s.ignoredBlocks);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);

  const [courseIndex, setCourseIndex] = useState<Map<string, CourseIndexEntry> | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [activeDrag, setActiveDrag] = useState<
    { kind: "block"; blockId: string; code: string } | { kind: "lookup"; code: string } | null
  >(null);
  const { anchor, move, reducedMotion, rotate, settle, start } = useDragOverlayPhysics({
    resolveSourceElement: resolvePlannerDragSource,
  });

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

  useEffect(() => () => setPlannerDragCursor(false), []);

  // Per-block validation. Walks years/terms in order, building the
  // cumulative completed-set as we go: prereqs check against strictly-
  // earlier terms, coreqs check against earlier-or-same. Recomputes
  // whenever the years tree changes or the course index resolves.
  const ignoredSet = useMemo(() => new Set(ignoredBlocks), [ignoredBlocks]);

  const validations = useMemo<Map<string, BlockValidation>>(() => {
    const out = new Map<string, BlockValidation>();
    if (!courseIndex) return out;
    const duplicateCodes = findDuplicateCourseCodes(years);
    const cumulative = new Set<string>();
    for (const year of years) {
      for (const term of year.terms) {
        const codesThisTerm = new Set(term.blocks.map((b) => b.code));
        const completedBefore = new Set(cumulative);
        const completedSameOrBefore = new Set([...cumulative, ...codesThisTerm]);
        for (const block of term.blocks) {
          const entry = courseIndex.get(block.code);
          const missing = duplicateCodes.has(block.code) ? ["duplicate course in plan"] : [];
          if (!entry) {
            const ignored = ignoredSet.has(block.id);
            out.set(block.id, {
              ok: missing.length === 0 || ignored,
              missing,
              completedBefore,
              completedSameOrBefore,
            });
            continue;
          }
          const prereqAst = parsePrereq(entry.prerequisite);
          const coreqAst = parsePrereq(entry.corequisite);
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
    setPlannerDragCursor(true);
    start(event);
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
      return;
    }
    if (id.startsWith(ACTIVE_REQUIREMENT_PREFIX)) {
      const code = event.active.data.current?.code;
      if (typeof code === "string") setActiveDrag({ kind: "lookup", code });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setPlannerDragCursor(false);
    setActiveDrag(null);
    settle();
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Search and requirement drags create a block in the resolved term.
    if (activeId.startsWith(ACTIVE_LOOKUP_PREFIX) || activeId.startsWith(ACTIVE_REQUIREMENT_PREFIX)) {
      const draggedCode = activeId.startsWith(ACTIVE_LOOKUP_PREFIX)
        ? activeId.slice(ACTIVE_LOOKUP_PREFIX.length)
        : active.data.current?.code;
      if (typeof draggedCode !== "string" || !draggedCode || overId === "trash") return;
      const dest = resolveTermDrop(overId, years);
      if (!dest) return;
      addBlock(dest.yearId, dest.termIdx, draggedCode);
      return;
    }

    // A planned block dropped on trash is removed.
    if (overId === "trash" && activeId.startsWith(ACTIVE_BLOCK_PREFIX)) {
      removeBlock(activeId.slice(ACTIVE_BLOCK_PREFIX.length));
      return;
    }

    // A planned block dropped on a term or another block is moved.
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
        <RetryAlert onRetry={() => setLoadNonce((n) => n + 1)}>Couldn't load the course index.</RetryAlert>
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
      accessibility={{
        announcements: {
          onDragStart: () => "Course picked up.",
          onDragOver: ({ over }) => {
            const label = over ? dropLabel(String(over.id), years) : null;
            return label ? `Course over ${label}.` : "Course outside a drop target.";
          },
          onDragEnd: ({ over }) => {
            const label = over ? dropLabel(String(over.id), years) : null;
            return label ? `Course dropped on ${label}.` : "Course drag cancelled.";
          },
          onDragCancel: () => "Course drag cancelled.",
        },
      }}
      onDragStart={onDragStart}
      onDragMove={move}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setPlannerDragCursor(false);
        setActiveDrag(null);
        settle();
      }}
    >
      <div
        data-pane-root="degree-planner"
        className="flex h-full min-h-0 flex-col gap-4 p-6 max-md:overflow-y-auto max-sm:p-4"
      >
        <header className="relative z-30 flex shrink-0 flex-col gap-3 max-xl:pl-12">
          <div>
            <h2 className="text-on-surface text-xl font-medium tracking-[-0.02em]">Degree Planner</h2>
            <p className="text-muted text-xs">Plan your UBC degree, term by term.</p>
          </div>
          <div className="flex w-full flex-wrap items-end justify-between gap-3">
            <ProgramSelectors />
            <ActionsSection
              years={years}
              validations={validations}
              courseIndex={courseIndex}
              onClearAll={() => {
                const total = years.reduce((n, y) => n + y.terms.reduce((m, t) => m + t.blocks.length, 0), 0);
                if (total > 0 && window.confirm(`Remove all ${total} course(s) from the plan?`)) clearAllBlocks();
              }}
            />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)] gap-4 max-md:flex max-md:flex-none max-md:flex-col">
          <aside className="grid min-h-0 min-w-0 grid-rows-2 gap-4 max-md:order-2 max-md:h-[44rem] max-md:shrink-0">
            <section className="neu-panel bg-surface flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl">
              <header className="flex h-12 shrink-0 items-center gap-2 px-4">
                <h3 className="text-on-surface text-sm font-medium">Requirements</h3>
              </header>
              <div className="border-border-subtle min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto border-t px-2 pb-2">
                <ProgramProgress courseIndex={courseIndex} plannedCodes={plannedCodes} />
              </div>
            </section>
            <section className="neu-panel bg-surface flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl">
              <MiniCourseLookup courseIndex={courseIndex} plannedCodes={plannedCodes} />
            </section>
          </aside>

          <section
            aria-label="Degree plan"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable year board needs a keyboard focus target.
            tabIndex={0}
            className="border-border bg-surface-container-low/40 relative flex min-h-0 [scrollbar-gutter:stable] flex-col overflow-auto rounded-xl border p-4 max-md:order-1 max-md:min-h-[36rem] max-md:shrink-0"
          >
            <div
              className="grid min-h-0 flex-1 gap-4"
              style={{
                gridTemplateColumns: `repeat(${years.length}, minmax(10.5rem, 1fr))`,
                minWidth: `${years.length * 10.5 + Math.max(0, years.length - 1)}rem`,
              }}
            >
              {years.map((year) => (
                <YearColumn key={year.id} year={year} courseIndex={courseIndex} validations={validations} />
              ))}
            </div>
            {activeDrag && (
              <div className="pointer-events-none sticky bottom-2 z-20 mx-auto h-0 w-72">
                <div className="pointer-events-auto -translate-y-14">
                  <TrashBin />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <DragOverlay dropAnimation={activeDrag?.kind === "lookup" ? null : DRAG_DROP_ANIMATION}>
        {activeDrag && (
          <DragOverlayFrame
            key={activeDrag.kind === "block" ? activeDrag.blockId : activeDrag.code}
            anchor={anchor}
            reducedMotion={reducedMotion}
            rotate={rotate}
          >
            {activeDrag.kind === "block" && (
              <CourseBlock
                blockId={activeDrag.blockId}
                code={activeDrag.code}
                entry={courseIndex.get(activeDrag.code)}
                validation={validations.get(activeDrag.blockId) ?? EMPTY_VALIDATION}
                ghost
              />
            )}
            {activeDrag.kind === "lookup" && courseIndex.get(activeDrag.code) && (
              <div style={{ width: anchor.width || 288 }}>
                <LookupBlock entry={courseIndex.get(activeDrag.code) as CourseIndexEntry} ghost />
              </div>
            )}
          </DragOverlayFrame>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function ActionsSection({
  years,
  validations,
  courseIndex,
  onClearAll,
}: {
  years: Year[];
  validations: Map<string, BlockValidation>;
  courseIndex: Map<string, CourseIndexEntry>;
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
  const [structureOpen, setStructureOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);

  useEffect(() => {
    if (!structureOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setStructureOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [structureOpen]);

  const erroredBlocks = useMemo(() => {
    const out: { id: string; code: string; place: string; issues: string[] }[] = [];
    for (const year of years) {
      for (const term of year.terms) {
        for (const block of term.blocks) {
          const v = validations.get(block.id);
          if (v && v.missing.length > 0) {
            out.push({
              id: block.id,
              code: block.code,
              place: `${year.label} · ${SEASON_META[term.season].short}`,
              issues: v.missing,
            });
          }
        }
      }
    }
    return out;
  }, [years, validations]);

  const flashTimer = useRef<number | null>(null);
  const setFlashBlockId = usePlanner((s) => s.setFlashBlockId);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  function locateBlock(blockId: string) {
    setIgnoreOpen(false);
    setFlashBlockId(blockId);
    document.querySelector(`[data-block-id="${blockId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashBlockId(null), 1500);
  }

  useEffect(() => {
    if (!ignoreOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIgnoreOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [ignoreOpen]);

  async function handleAutofill() {
    if (!major) {
      setAutofillResult({ placements: [], placedCodes: [], choices: [], remaining: ["Select a major first"] });
      return;
    }
    setFilling(true);
    try {
      const requirements = await getRequirementsFor(major);
      const parsed = requirements?.kind === "prose" ? parseProgramYears(requirements.text) : null;
      if (!requirements || !parsed || !hasYearRequirements(parsed)) {
        setAutofillResult({
          placements: [],
          placedCodes: [],
          choices: [],
          remaining: ["No year-by-year requirements are available for this program"],
        });
        return;
      }
      const result = buildAutofillPlan({
        years,
        courseIndex,
        parsed,
        programUrl: requirements.program_url,
        checkedRequirements,
      });
      addBlocks(result.placements);
      setAutofillResult(result);
    } catch {
      setAutofillResult({
        placements: [],
        placedCodes: [],
        choices: [],
        remaining: ["Autofill could not load this program's requirements"],
      });
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

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-md:ml-0 max-md:w-full max-md:justify-start">
      <div className="neu-inset bg-surface-container-low flex items-center gap-0.5 rounded-xl p-1">
        <button
          type="button"
          onClick={() => {
            setAutofillResult(null);
            undo();
          }}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="undo" size={13} />
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            setAutofillResult(null);
            redo();
          }}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="redo" size={13} />
          Redo
        </button>
      </div>

      <Button size="toolbar" onClick={handleAutofill} disabled={filling}>
        <Icon name="sparkles" size={14} />
        <span>{filling ? "Filling…" : "Autofill"}</span>
      </Button>

      <div className="relative">
        <Button size="toolbar" onClick={() => setStructureOpen((open) => !open)} aria-expanded={structureOpen}>
          <Icon name="settings" size={14} />
          <span>Structure</span>
          <Icon name="down" size={12} className={`transition-transform ${structureOpen ? "rotate-180" : ""}`} />
        </Button>
        {structureOpen && (
          <div className="neu-panel bg-surface absolute top-10 right-0 z-50 rounded-2xl p-4">
            <h3 className="text-on-surface mb-3 text-sm font-medium">Plan structure</h3>
            <PlanStructure />
          </div>
        )}
      </div>

      <div className="relative">
        <Button
          size="toolbar"
          onClick={() => setIgnoreOpen((open) => !open)}
          aria-expanded={ignoreOpen}
          className="min-w-[92px]"
        >
          <Icon name="eyeOff" size={14} className={erroredBlocks.length > 0 ? "text-error" : undefined} />
          <span>Issues</span>
          {erroredBlocks.length > 0 && (
            <span className="bg-error-container text-on-error-container rounded-full px-1.5 text-xs tabular-nums">
              {erroredBlocks.length}
            </span>
          )}
        </Button>
        {ignoreOpen && (
          <div className="neu-panel bg-surface absolute top-10 right-0 z-50 flex max-h-80 w-80 flex-col gap-1 overflow-y-auto rounded-2xl p-2">
            <p className="text-on-surface px-2 pt-1 text-xs font-medium">
              {erroredBlocks.length === 0 ? "No placement issues" : `${erroredBlocks.length} placement issue(s)`}
            </p>
            {erroredBlocks.length > 0 && (
              <p className="text-muted px-2 pb-1 text-xs">Select an issue to highlight the course on the board.</p>
            )}
            {erroredBlocks.map((block) => (
              <div
                key={block.id}
                className="hover:bg-surface-container-low flex items-start gap-1 rounded-lg px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => locateBlock(block.id)}
                  className="min-w-0 flex-1 text-left"
                  title="Locate on the board"
                >
                  <p className="text-xs">
                    <span className="text-on-surface font-mono font-medium">{block.code}</span>
                    <span className="text-muted"> · {block.place}</span>
                  </p>
                  <p className="text-on-surface-variant mt-0.5 text-xs leading-snug">
                    {block.issues.map(describeIssue).join(" ")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleIgnoreBlock(block.id)}
                  title="Mute this issue"
                  aria-label={`Mute issue for ${block.code}`}
                  className="text-muted hover:bg-surface-container hover:text-on-surface mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
                >
                  <Icon name="eyeOff" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="danger"
        size="toolbar"
        onClick={() => {
          setAutofillResult(null);
          onClearAll();
        }}
      >
        <Icon name="trash" size={14} />
        <span>Clear</span>
      </Button>
      <Button variant="primary" onClick={handleAskAi}>
        <Icon name="chat1" size={14} />
        <span>Ask AI</span>
      </Button>
      {autofillResult && <AutofillSummary result={autofillResult} onClose={() => setAutofillResult(null)} />}
    </div>
  );
}

function AutofillSummary({ result, onClose }: { result: AutofillResult; onClose: () => void }) {
  const placed = result.placedCodes.slice(0, 10);
  const remaining = result.remaining.slice(0, 3);
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-border bg-surface-container fixed right-5 bottom-5 z-50 w-80 rounded-xl border p-3 shadow-xl"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-on-surface text-sm font-semibold">
            {result.placedCodes.length > 0
              ? `Added ${result.placedCodes.length} courses`
              : result.remaining.length > 0
                ? "Autofill needs your input"
                : "Course requirements are covered"}
          </h3>
          {placed.length > 0 && (
            <p className="text-on-surface-variant mt-1 text-xs">
              {placed.join(", ")}
              {result.placedCodes.length > placed.length && ` +${result.placedCodes.length - placed.length} more`}
            </p>
          )}
          {result.choices.length > 0 && (
            <p className="text-muted mt-1 text-xs">
              One-of choices: {result.choices.map((choice) => choice.code).join(", ")}
            </p>
          )}
          {remaining.length > 0 && (
            <p className="text-muted mt-1 text-xs">
              Add manually: {remaining.join("; ")}
              {result.remaining.length > remaining.length && ` +${result.remaining.length - remaining.length} more`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:bg-surface-container-high hover:text-on-surface rounded-lg p-1"
          aria-label="Dismiss autofill summary"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
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
