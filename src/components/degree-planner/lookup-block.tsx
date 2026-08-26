"use client";

// Draggable variant for mini-lookup results. Distinct from CourseBlock —
// it does NOT participate in any SortableContext (lookup results don't
// reorder), and dropping it on a term spawns a NEW PlannedBlock rather
// than moving an existing one. The DnD payload includes `kind: 'lookup'`
// so the pane's onDragEnd switches to the addBlock branch.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { CourseInfoPopup } from "./course-info-popup";

interface LookupBlockProps {
  entry: CourseIndexEntry;
  ghost?: boolean;
}

export function LookupBlock({ entry, ghost = false }: LookupBlockProps) {
  const code = entry.code;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `lookup:${code}`,
    data: { kind: "lookup", code },
    disabled: ghost,
  });
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  return (
    <div
      ref={ghost ? undefined : setNodeRef}
      {...(ghost ? {} : attributes)}
      {...(ghost ? {} : listeners)}
      className={`border-border-subtle bg-surface flex items-baseline gap-2 rounded-lg border px-2 py-1.5 text-sm select-none ${
        ghost ? "shadow-lg" : "hover:border-outline-variant cursor-grab active:cursor-grabbing"
      }`}
    >
      <span className="text-on-surface shrink-0 font-mono">{code}</span>
      <span className="text-on-surface-variant flex-1 truncate" title={entry.title}>
        {entry.title}
      </span>
      {!ghost && (
        <button
          type="button"
          aria-label="Show course details"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => setAnchorRect(e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setAnchorRect(null)}
          onFocus={(e) => setAnchorRect(e.currentTarget.getBoundingClientRect())}
          onBlur={() => setAnchorRect(null)}
          className="border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-on-surface-variant flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border text-xs leading-none"
        >
          ?
        </button>
      )}
      {anchorRect && <CourseInfoPopup course={entry} anchorRect={anchorRect} />}
    </div>
  );
}
