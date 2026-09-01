"use client";

// Draggable variant for mini-lookup results. Distinct from CourseBlock —
// it does NOT participate in any SortableContext (lookup results don't
// reorder), and dropping it on a term spawns a NEW PlannedBlock rather
// than moving an existing one. The DnD payload includes `kind: 'lookup'`
// so the pane's onDragEnd switches to the addBlock branch.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { CourseInfoPopup } from "./course-info-popup";

interface LookupBlockProps {
  entry: CourseIndexEntry;
  ghost?: boolean;
}

export function LookupBlock({ entry, ghost = false }: LookupBlockProps) {
  const code = entry.code;
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `lookup:${code}`,
    data: { kind: "lookup", code },
    disabled: ghost,
  });
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Whole row is the drag surface; interactive controls opt out.
  function startDrag(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a, select, input")) return;
    listeners?.onPointerDown?.(e);
  }

  return (
    <div
      ref={ghost ? undefined : setNodeRef}
      data-lookup-code={code}
      onPointerDown={ghost ? undefined : startDrag}
      className={`group flex min-h-11 cursor-grab touch-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm select-none active:cursor-grabbing ${
        ghost ? "neu-raised bg-surface-container scale-[1.03]" : "hover:bg-surface-container-low"
      } ${isDragging ? "opacity-0" : ""}`}
    >
      <div className="min-w-0 flex-1 leading-tight">
        <span className="text-on-surface block truncate font-mono text-xs">{code}</span>
        <span className="text-on-surface-variant block truncate text-xs" title={entry.title}>
          {entry.title}
        </span>
      </div>
      <span className="text-muted w-9 shrink-0 text-right text-xs tabular-nums">
        {entry.credits != null ? `${entry.credits} cr` : ""}
      </span>
      {!ghost && (
        <button
          type="button"
          aria-label={`Show ${code} details`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setAnchorRect((current) => (current ? null : rect));
          }}
          className="text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex size-7 shrink-0 items-center justify-center rounded-md opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <Icon name="info" size={14} />
        </button>
      )}
      {anchorRect && <CourseInfoPopup course={entry} anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />}
    </div>
  );
}
