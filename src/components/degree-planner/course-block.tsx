"use client";

import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CourseChip } from "./course-chip";
import type { BlockValidation } from "./validation";

interface CourseBlockProps {
  blockId: string;
  code: string;
  entry: CourseIndexEntry | undefined;
  validation: BlockValidation;
  ghost?: boolean;
}

/** Connects a planned course chip to term sorting without changing its drag-overlay layout. */
export function CourseBlock({ blockId, code, entry, validation, ghost = false }: CourseBlockProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `block:${blockId}`,
    data: { kind: "block", blockId },
    disabled: ghost,
  });

  return (
    <CourseChip
      ref={setNodeRef}
      blockId={blockId}
      code={code}
      entry={entry}
      validation={validation}
      ghost={ghost}
      listeners={listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    />
  );
}
