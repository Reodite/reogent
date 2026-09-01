"use client";

// Single draggable course block inside a term. The block re-resolves its
// title/credits against the live course index at render time (we persist
// only the code), so a refreshed catalog flows through to existing plans.
//
// The error border, alert icon, Issues popover, and popup flag unmet
// prereqs — see degree-planner-pane.tsx for the cumulative-completed-set
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

  // The whole chip is draggable; interactive controls opt out.
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

  const borderClass = !validation.ok ? "border-error" : "border-transparent";

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
      className={`group bg-surface-container relative flex min-h-14 w-full min-w-0 shrink-0 cursor-grab touch-none flex-col items-stretch gap-0.5 rounded-lg border px-2 py-1.5 text-sm select-none active:cursor-grabbing ${borderClass} ${
        ghost ? "neu-raised scale-[1.03]" : "neu-raised"
      } ${flashing ? "planner-flash" : ""}`}
      data-block-id={blockId}
    >
      <div className="flex h-7 min-w-0 items-center gap-1">
        <span className="text-on-surface min-w-0 flex-1 truncate font-mono text-xs">{code}</span>
        {!ghost && (
          <div className="flex shrink-0 items-center gap-0.5">
            {entry && (
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
                    ? "bg-surface-container-high text-on-surface"
                    : validation.ok
                      ? "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                      : "text-error hover:bg-error-container"
                }`}
              >
                <Icon name={validation.ok ? "info" : "alert"} size={14} />
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${code}`}
              title={`Remove ${code}`}
              onClick={() => removeBlock(blockId)}
              className="text-muted hover:bg-error-container hover:text-error flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 leading-tight">
        <span className="text-on-surface-variant min-w-0 flex-1 truncate text-[11px]" title={title}>
          {title}
        </span>
        <span className="text-muted w-9 shrink-0 text-right text-[11px] tabular-nums">
          {entry?.credits != null ? `${entry.credits} cr` : ""}
        </span>
      </div>
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
