"use client";

// One term inside a year column — a droppable container with a sortable
// list of CourseBlocks. The drop target id encodes the term coordinates
// so onDragEnd in degree-planner-pane.tsx can route the move/add to the
// right slot.
//
// Two render forms:
//  - study: the normal block list with a season header + credit summary
//  - coop: a compact work-term card; not a drop target, holds no blocks
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { CourseBlock } from "./course-block";
import { isSummer, SEASON_META, TERM_CREDIT_WARN, usePlanner, type Term } from "./planner-store";
import { EMPTY_VALIDATION, type BlockValidation } from "./validation";

interface TermSectionProps {
  yearId: string;
  termIdx: number;
  term: Term;
  courseIndex: Map<string, CourseIndexEntry>;
  validations: Map<string, BlockValidation>;
}

export function TermSection({ yearId, termIdx, term, courseIndex, validations }: TermSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `term:${yearId}:${termIdx}`,
    data: { kind: "term", yearId, termIdx },
    disabled: term.kind === "coop",
  });
  const blockIds = term.blocks.map((b) => `block:${b.id}`);

  // useDroppable's `isOver` only fires when the drop target is this term
  // container itself. When the user drags over a block *inside* the term,
  // dnd-kit's collision resolves to that block (which is also droppable
  // via useSortable), so the term stays unhighlighted even though it's
  // the destination. Listen to drag events and also light up when one of
  // our descendant blocks is the active over-target.
  const [isOverDescendant, setIsOverDescendant] = useState(false);
  useDndMonitor({
    onDragMove(event) {
      const rawOver = event.over?.id;
      if (rawOver == null) {
        setIsOverDescendant(false);
        return;
      }
      const overId = String(rawOver);
      if (overId.startsWith("block:")) {
        const id = overId.slice("block:".length);
        setIsOverDescendant(term.blocks.some((b) => b.id === id));
      } else {
        setIsOverDescendant(false);
      }
    },
    onDragEnd() {
      setIsOverDescendant(false);
    },
    onDragCancel() {
      setIsOverDescendant(false);
    },
  });
  const highlighted = isOver || isOverDescendant;
  const meta = SEASON_META[term.season];
  const coopEnabled = usePlanner((s) => s.coop);
  const setTermKind = usePlanner((s) => s.setTermKind);

  if (term.kind === "coop") {
    return (
      <div className="border-border bg-surface-container-low/60 animate-planner-term-in flex flex-1 flex-col justify-center gap-1 rounded-lg border border-dashed px-2 py-3">
        <div className="flex items-center gap-2">
          <Icon name="briefcase" size={16} className="text-on-surface-variant shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-xs font-semibold">Co-op work term</p>
            <p className="text-muted text-[11px]">
              {meta.months} · {term.code ?? "full-time placement"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTermKind(yearId, termIdx, "study")}
            title="Switch back to a study term"
            aria-label="Switch back to a study term"
            className="text-muted hover:bg-surface-container hover:text-on-surface flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors"
          >
            <Icon name="book2" size={13} />
            Study
          </button>
        </div>
      </div>
    );
  }

  // Variable-credit courses count their catalog value; missing → 0. Close
  // enough for a planner subtotal.
  const creditTotal = term.blocks.reduce((sum, b) => sum + (courseIndex.get(b.code)?.credits ?? 0), 0);
  const creditOverload = creditTotal > TERM_CREDIT_WARN[term.season];
  const summer = isSummer(term.season);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${
        highlighted
          ? "border-primary/40 bg-accent-subtle/40 border-dashed"
          : "border-border bg-surface-container-low neu-inset"
      } animate-planner-term-in flex min-h-[5.5rem] flex-1 flex-col gap-1.5 p-2`}
    >
      <div className="flex shrink-0 items-baseline gap-2 text-xs">
        <span className="text-on-surface shrink-0 font-medium">{meta.short}</span>
        <span className="text-muted shrink-0 text-[11px]">{meta.months}</span>
        <span className="text-muted ml-auto shrink-0 text-[11px] tabular-nums">
          {creditTotal} cr
          {creditOverload && (
            <span className="text-error ml-1 inline-flex items-center gap-0.5 font-medium">
              <Icon name="warning" size={12} />
              heavy
            </span>
          )}
          {summer && !creditOverload && creditTotal > 0 && <span className="text-muted"> · summer pace</span>}
        </span>
        {coopEnabled && (
          <TermKindButton yearId={yearId} termIdx={termIdx} onSet={() => setTermKind(yearId, termIdx, "coop")} />
        )}
      </div>
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {term.blocks.map((b) => (
            <CourseBlock
              key={b.id}
              blockId={b.id}
              code={b.code}
              entry={courseIndex.get(b.code)}
              validation={validations.get(b.id) ?? EMPTY_VALIDATION}
            />
          ))}
          {term.blocks.length === 0 && (
            <p className="text-muted px-1 py-1 text-[11px] italic">
              {summer ? "No summer courses" : "Drag courses here"}
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// Tiny briefcase button in a study-term header marking the term as a
// co-op work term. Guarded by a confirm when flipping would drop placed
// blocks. Co-op cards carry their own explicit "Study" switch-back
// control, so this button only ever appears on study terms.
function TermKindButton({ yearId, termIdx, onSet }: { yearId: string; termIdx: number; onSet: () => void }) {
  const years = usePlanner((s) => s.years);
  const term = years.find((y) => y.id === yearId)?.terms[termIdx];
  const hasBlocks = (term?.blocks.length ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => {
        if (hasBlocks && !window.confirm("Marking this as a co-op work term removes its courses. Continue?")) {
          return;
        }
        onSet();
      }}
      title="Mark as co-op work term"
      aria-label="Mark as co-op work term"
      className="text-muted hover:text-on-surface flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
    >
      <Icon name="briefcase" size={14} />
    </button>
  );
}
