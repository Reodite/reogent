"use client";

// Drag target used while a course is moving. The planner removes the block in
// onDragEnd when the resolved target id is "trash".
import { Icon } from "@/src/components/icons";
import { useDroppable } from "@dnd-kit/core";

export function TrashBin() {
  const { setNodeRef, isOver } = useDroppable({
    id: "trash",
    data: { kind: "trash" },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-12 items-center justify-center rounded-full border-2 border-dashed px-4 text-sm shadow-lg transition-colors ${
        isOver
          ? "border-error bg-error-container text-error"
          : "border-border bg-surface-container-high text-on-surface-variant"
      }`}
    >
      <span className="flex items-center justify-center gap-1.5">
        <Icon name="trash" size={15} />
        Drop here to remove
      </span>
    </div>
  );
}
