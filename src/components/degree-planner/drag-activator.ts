import type { DraggableSyntheticListeners } from "@dnd-kit/core";

export function forwardPlannerDragActivator(
  event: React.MouseEvent | React.TouchEvent,
  listeners: DraggableSyntheticListeners,
) {
  if ((event.target as HTMLElement).closest("button, a, select, input")) return;
  const listener = event.type === "touchstart" ? listeners?.onTouchStart : listeners?.onMouseDown;
  listener?.(event);
}
