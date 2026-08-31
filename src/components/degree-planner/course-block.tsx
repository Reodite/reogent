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
  ghost?: boolean;
}

export function CourseBlock({ blockId, code, entry, validation, ghost = false }: CourseBlockProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `block:${blockId}`,
    data: { kind: "block", blockId },
  });

  // The whole chip is the drag surface (grab anywhere). Pointer events
  // that land on interactive controls are routed back to them, so the
  // info/remove buttons keep working.
  function startDrag(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a, select, input")) return;
    listeners?.onPointerDown?.(e);
  }

  const title = entry?.title || code;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const borderClass = !validation.ok ? "border-error" : "border-border hover:border-outline-variant";

  // Parse prereq/coreq trees once per block so the popup can render
  // them with clause-level highlighting against the snapshot completed
  // sets we stash on validation. Parsing is cheap and only runs when
  // the entry's text changes.
  const prereqAst = useMemo(() => parsePrereq(entry?.prerequisite), [entry?.prerequisite]);
  const coreqAst = useMemo(() => parsePrereq(entry?.corequisite), [entry?.corequisite]);

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const removeBlock = usePlanner((state) => state.removeBlock);
  const flashing = usePlanner((state) => state.flashBlockId === blockId);

  function togglePopup(e: React.MouseEvent | React.FocusEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchorRect((prev) => (prev ? null : rect));
  }

  return (
    <div
      ref={ghost ? undefined : setNodeRef}
      style={ghost ? undefined : style}
      onPointerDown={ghost ? undefined : startDrag}
      className={`bg-surface flex min-h-10 w-full shrink-0 cursor-grab touch-none items-center gap-1 rounded-lg border px-1.5 py-1 text-sm select-none active:cursor-grabbing ${borderClass} ${
        ghost ? "scale-[1.03] shadow-xl" : "neu-raised"
      } } ${flashing ? "planner-flash" : ""}`}
      data-block-id={blockId}
    >
      <div className="min-w-0 flex-1 leading-tight">
        <span className="text-on-surface block truncate font-mono text-xs">{code}</span>
        <span className="text-on-surface-variant block truncate text-[10px]" title={title}>
          {title}
        </span>
      </div>
      {!ghost && (
        <button
          type="button"
          aria-label={`Remove ${code}`}
          title={`Remove ${code}`}
          onClick={() => removeBlock(blockId)}
          className="text-muted hover:bg-error-container hover:text-error flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Icon name="close" size={14} />
        </button>
      )}
      {!ghost && entry && (
        <button
          type="button"
          aria-label={
            validation.ok
              ? `Show ${code} details`
              : `Show ${code} details (${validation.missing.length} placement issue${validation.missing.length === 1 ? "" : "s"})`
          }
          onClick={togglePopup}
          className={`flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
            anchorRect
              ? "text-on-surface bg-surface-container"
              : validation.ok
                ? "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                : "text-error hover:bg-error-container"
          }`}
        >
          <Icon name={validation.ok ? "info" : "alert"} size={14} />
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
          issues={validation.missing}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </div>
  );
}
