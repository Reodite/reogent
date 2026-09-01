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
import { SEASON_META, TERM_CREDIT_WARN, usePlanner, type Term } from "./planner-store";
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
      <div className="neu-inset bg-surface-container-low animate-planner-term-in flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl p-3 text-center">
        <Icon name="briefcase" size={18} className="text-on-surface-variant" />
        <p className="text-on-surface text-sm font-medium">Co-op work term</p>
        <p className="text-muted text-xs">
          {meta.months} · {term.code ?? "Full-time placement"}
        </p>
        <button
          type="button"
          onClick={() => setTermKind(yearId, termIdx, "study")}
          className="neu-button text-on-surface-variant hover:text-on-surface mt-auto h-9 w-full rounded-lg text-xs"
        >
          Switch to study term
        </button>
      </div>
    );
  }

  // Variable-credit courses count their catalog value; missing → 0. Close
  // enough for a planner subtotal.
  const creditTotal = term.blocks.reduce((sum, b) => sum + (courseIndex.get(b.code)?.credits ?? 0), 0);
  const creditOverload = creditTotal > TERM_CREDIT_WARN[term.season];

  return (
    <div
      ref={setNodeRef}
      className={`neu-inset animate-planner-term-in flex min-h-28 min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3 ${
        highlighted
          ? "border-muted/70 bg-surface-container border-dashed"
          : "bg-surface-container-low border-transparent"
      }`}
    >
      <div className="flex h-6 shrink-0 items-baseline gap-2 text-xs">
        <span className="text-on-surface shrink-0 font-medium">{meta.short}</span>
        <span className="text-muted min-w-0 truncate text-[11px]">{meta.months}</span>
        <span
          className={`ml-auto shrink-0 text-right text-[11px] tabular-nums ${creditOverload ? "text-error" : "text-muted"}`}
          title={creditOverload ? "Over the usual credit load for this term" : undefined}
        >
          {creditTotal} cr
        </span>
      </div>
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 px-0.5 pt-0.5 ${
            term.blocks.length > 0 ? "overflow-y-auto" : "overflow-hidden"
          }`}
        >
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
            <p className="text-muted flex flex-1 items-center justify-center px-2 text-center text-xs">
              Drop courses here.
            </p>
          )}
        </div>
      </SortableContext>
      {coopEnabled && (
        <TermKindButton yearId={yearId} termIdx={termIdx} onSet={() => setTermKind(yearId, termIdx, "coop")} />
      )}
    </div>
  );
}

// Marks a study term as a co-op work term and confirms before removing courses.
// Co-op cards carry their own switch-back control.
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
      className="neu-button text-on-surface-variant hover:text-on-surface h-9 w-full shrink-0 rounded-lg px-2 text-xs"
    >
      Mark as co-op work term
    </button>
  );
}
