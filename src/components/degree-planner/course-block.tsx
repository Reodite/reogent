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
      className={`group bg-surface-container relative flex min-h-11 w-full shrink-0 cursor-grab touch-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm select-none active:cursor-grabbing ${borderClass} ${
        ghost ? "neu-raised scale-[1.03]" : "neu-raised"
      } ${flashing ? "planner-flash" : ""}`}
      data-block-id={blockId}
    >
      <div className="min-w-0 flex-1 leading-tight">
        <span className="text-on-surface block truncate font-mono text-xs">{code}</span>
        <span className="text-on-surface-variant block truncate text-[11px]" title={title}>
          {title}
        </span>
      </div>
      {!ghost && (
        // The gradient masks text before actions appear. Invalid courses keep
        // the issue button visible while removal waits for hover or focus.
        <div
          className={`from-surface-container absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-gradient-to-l from-60% to-transparent transition-opacity ${
            !validation.ok
              ? "pl-4 opacity-100"
              : "pl-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          }`}
        >
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
            className={`text-muted hover:bg-error-container hover:text-error size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
              validation.ok ? "flex" : "hidden group-focus-within:flex group-hover:flex"
            }`}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
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
