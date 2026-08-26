"use client";

// Droppable trash zone for the right sidebar. Lights up when a block is
// dragged over. The actual removal happens in the pane's onDragEnd when
// active.id is a block and over.id is 'trash'.
//
// `compact` is used by the collapsed-sidebar strip — just an icon-sized
// drop target with the same id so DnD still routes deletes through it.
import { Icon } from "@/src/components/icons";
import { useDroppable } from "@dnd-kit/core";

interface TrashBinProps {
  compact?: boolean;
}

export function TrashBin({ compact = false }: TrashBinProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "trash",
    data: { kind: "trash" },
  });
  if (compact) {
    return (
      <div
        ref={setNodeRef}
        title="Drop course here to delete"
        className={`w-full rounded-lg border-2 border-dashed p-1 text-center text-sm transition-colors ${
          isOver ? "border-error bg-error-container text-error" : "border-border-subtle text-muted"
        }`}
      >
        <Icon name="trash" size={16} className="mx-auto" />
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
        isOver ? "border-error bg-error-container text-error" : "border-border-subtle bg-surface text-muted"
      }`}
    >
      <span className="flex items-center justify-center gap-1.5">
        <Icon name="trash" size={16} />
        Drop course here to delete
      </span>
    </div>
  );
}
