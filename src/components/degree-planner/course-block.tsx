"use client";

// Single draggable course block inside a term. The block re-resolves its
// title/credits against the live course index at render time (we persist
// only the code), so a refreshed catalog flows through to existing plans.
//
// The error border + popup is the planner's only signal that prereqs
// aren't met — see degree-planner-pane.tsx for the cumulative-completed-set
// logic that fills `validation`.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { parsePrereq } from "@/src/shared/prereq-ast";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { CourseInfoPopup } from "./course-info-popup";
import { usePlanner } from "./planner-store";
import type { BlockValidation } from "./validation";

interface CourseBlockProps {
  blockId: string;
  code: string;
  entry: CourseIndexEntry | undefined;
  validation: BlockValidation;
  fulfillsRequirement?: boolean;
  ghost?: boolean;
}

export function CourseBlock({
  blockId,
  code,
  entry,
  validation,
  fulfillsRequirement = false,
  ghost = false,
}: CourseBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `block:${blockId}`,
    data: { kind: "block", blockId },
  });

  const title = entry?.title || code;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const borderClass = !validation.ok
    ? "border-error"
    : fulfillsRequirement
      ? "border-secondary hover:border-secondary"
      : "border-border hover:border-outline-variant";

  // Parse prereq/coreq trees once per block so the popup can render
  // them with clause-level highlighting against the snapshot completed
  // sets we stash on validation. Parsing is cheap and only runs when
  // the entry's text changes.
  const prereqAst = useMemo(() => parsePrereq(entry?.prerequisite), [entry?.prerequisite]);
  const coreqAst = useMemo(() => parsePrereq(entry?.corequisite), [entry?.corequisite]);

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const removeBlock = usePlanner((state) => state.removeBlock);

  function togglePopup(e: React.MouseEvent | React.FocusEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchorRect((prev) => (prev ? null : rect));
  }

  return (
    <div
      ref={ghost ? undefined : setNodeRef}
      style={ghost ? undefined : style}
      {...(ghost ? {} : attributes)}
      {...(ghost ? {} : listeners)}
      className={`group bg-surface flex w-full shrink-0 cursor-grab items-baseline gap-2 rounded-lg border px-2 py-1.5 text-sm select-none active:cursor-grabbing ${borderClass} ${
        ghost ? "shadow-lg" : "neu-raised"
      }`}
    >
      <span className="text-on-surface shrink-0 font-mono">{code}</span>
      <span className="text-on-surface-variant flex-1 truncate">{title}</span>
      {!ghost && (
        <button
          type="button"
          aria-label={`Remove ${code}`}
          title={`Remove ${code}`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            removeBlock(blockId);
          }}
          className="text-muted hover:bg-error-container hover:text-error flex size-5 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Icon name="close" size={13} />
        </button>
      )}
      {!ghost && entry && (
        <button
          type="button"
          aria-label="Show course details"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={togglePopup}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs leading-none transition-colors ${
            anchorRect
              ? "border-on-surface-variant text-on-surface bg-surface-container"
              : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-on-surface-variant"
          }`}
        >
          ?
        </button>
      )}
      {anchorRect && entry && (
        <CourseInfoPopup
          course={entry}
          anchorRect={anchorRect}
          prereqAst={prereqAst}
          coreqAst={coreqAst}
          completedBefore={validation.completedBefore}
          completedSameOrBefore={validation.completedSameOrBefore}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </div>
  );
}
