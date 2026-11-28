import type { PaneId } from "@/src/shared/panes";

let pending: { paneId: PaneId; element: HTMLButtonElement } | undefined;

export function rememberPaneTrigger(paneId: PaneId, element: HTMLButtonElement): void {
  pending = { paneId, element };
}

export function restorePaneTrigger(paneId: PaneId): void {
  const target = pending;
  pending = undefined;
  if (target?.paneId === paneId && target.element.isConnected && document.activeElement === document.body) {
    target.element.focus();
  }
}
