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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({
    id: `lookup:${code}`,
    data: { kind: "lookup", code },
    disabled: ghost,
  });
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  return (
    <div
      ref={ghost ? undefined : setNodeRef}
      className={`border-border-subtle bg-surface flex min-h-10 items-center gap-1 rounded-lg border px-1 py-1 text-sm select-none ${
        ghost ? "shadow-lg" : "hover:border-outline-variant"
      }`}
    >
      {!ghost && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted hover:bg-surface-container hover:text-on-surface flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
          aria-label={`Drag ${code}`}
        >
          <Icon name="menu" size={14} />
        </button>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <span className="text-on-surface block truncate font-mono text-xs">{code}</span>
        <span className="text-on-surface-variant block truncate text-[10px]" title={entry.title}>
          {entry.title}
        </span>
      </div>
      {!ghost && (
        <button
          type="button"
          aria-label={`Show ${code} details`}
          onClick={(event) =>
            setAnchorRect((current) => (current ? null : event.currentTarget.getBoundingClientRect()))
          }
          className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface flex size-7 shrink-0 items-center justify-center rounded-md"
        >
          <Icon name="info" size={14} />
        </button>
      )}
      {anchorRect && <CourseInfoPopup course={entry} anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />}
    </div>
  );
}
