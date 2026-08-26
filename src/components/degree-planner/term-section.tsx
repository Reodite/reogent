"use client";

// One term inside a year column — a droppable container with a sortable
// list of CourseBlocks. The drop target id encodes the term coordinates
// so onDragEnd in degree-planner-pane.tsx can route the move/add to the
// right slot.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { CourseBlock } from "./course-block";
import type { Term, TermSeason } from "./planner-store";
import { EMPTY_VALIDATION, type BlockValidation } from "./validation";

const SEASON_LABEL: Record<TermSeason, string> = {
  fall: "Term 1",
  spring: "Term 2",
  summer: "Term 3",
  term4: "Term 4",
};

interface TermSectionProps {
  yearId: string;
  termIdx: number;
  term: Term;
  courseIndex: Map<string, CourseIndexEntry>;
  validations: Map<string, BlockValidation>;
  requirementCodes: Set<string>;
}

export function TermSection({ yearId, termIdx, term, courseIndex, validations, requirementCodes }: TermSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `term:${yearId}:${termIdx}`,
    data: { kind: "term", yearId, termIdx },
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
  // Variable-credit courses count their catalog value; missing → 0. Close
  // enough for a planner subtotal.
  const creditTotal = term.blocks.reduce((sum, b) => sum + (courseIndex.get(b.code)?.credits ?? 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${
        highlighted ? "border-primary bg-accent-subtle" : "border-border bg-surface-container-low neu-inset"
      } flex min-h-[6rem] flex-1 flex-col gap-1.5 p-2`}
    >
      <div className="flex shrink-0 items-baseline justify-between text-xs">
        <span className="text-on-surface-variant">{SEASON_LABEL[term.season]}</span>
        <span className="text-muted">Credits: {creditTotal}</span>
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
              fulfillsRequirement={requirementCodes.has(b.code)}
            />
          ))}
          {term.blocks.length === 0 && <p className="text-muted px-1 py-2 text-xs italic">Drag courses here</p>}
        </div>
      </SortableContext>
    </div>
  );
}
