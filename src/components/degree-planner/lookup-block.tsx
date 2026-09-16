"use client";

import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useDraggable } from "@dnd-kit/core";
import { CourseChip } from "./course-chip";

interface LookupBlockProps {
  entry: CourseIndexEntry;
  ghost?: boolean;
  onPlaced?: () => void;
}

/** Adds a course from search using the same chip layout as the plan and drag overlay. */
export function LookupBlock({ entry, ghost = false, onPlaced }: LookupBlockProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `lookup:${entry.code}`,
    data: { kind: "lookup", code: entry.code },
    disabled: ghost,
  });

  return (
    <CourseChip
      ref={setNodeRef}
      code={entry.code}
      entry={entry}
      ghost={ghost}
      onPlaced={onPlaced}
      listeners={listeners}
      style={{ opacity: isDragging ? 0 : 1 }}
    />
  );
}
