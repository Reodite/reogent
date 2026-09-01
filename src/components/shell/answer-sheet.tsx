"use client";

import type { CanvasView } from "@/src/components/shell/pane-registry";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const DISMISS_VELOCITY = 700;

/** Returns whether a downward sheet gesture crosses the distance or velocity threshold. */
export function shouldDismissAnswerSheet(distance: number, velocity: number, height: number): boolean {
  return distance >= height * 0.2 || velocity >= DISMISS_VELOCITY;
}

/** Keeps one Answer Canvas mounted while presenting it inline or as a mobile sheet. */
export function AnswerSheet({
  open,
  onClose,
  collapsed = false,
  view,
  children,
}: {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  view: CanvasView | null;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dragStart = useRef<{ pointerId: number; y: number; time: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
      return;
    }

    const sheet = sheetRef.current;
    if (!sheet) return;
    const activeSheet: HTMLDivElement = sheet;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeSheet.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && !activeSheet.contains(target) && target.closest("[data-dialog-root]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...activeSheet.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        activeSheet.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activeSheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeSheet.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = { pointerId: event.pointerId, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setDragY(Math.max(0, event.clientY - start.y));
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - start.y);
    const velocity = (distance / Math.max(1, event.timeStamp - start.time)) * 1000;
    dragStart.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    setDragY(0);
    if (shouldDismissAnswerSheet(distance, velocity, sheetRef.current?.offsetHeight ?? 0)) onClose();
  }

  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    setDragY(0);
  }

  const hasView = view !== null;
  const slotClass = `flex min-h-0 flex-col transition-[flex-grow,opacity,visibility,margin] duration-300 [transition-timing-function:var(--neu-ease)] sm:h-full ${
    collapsed || !hasView
      ? "sm:ml-0 sm:basis-0 sm:grow-0 sm:overflow-hidden sm:invisible sm:min-w-0 sm:pointer-events-none sm:opacity-0"
      : "sm:ml-3 sm:basis-0 sm:grow sm:overflow-hidden sm:visible sm:min-w-72 sm:opacity-100 lg:min-w-88"
  } ${
    open
      ? "max-sm:neu-panel max-sm:bg-surface max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:h-[80dvh] max-sm:overflow-hidden max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)] max-sm:visible max-sm:translate-y-0 max-sm:opacity-100"
      : "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:invisible max-sm:pointer-events-none max-sm:translate-y-full max-sm:opacity-0"
  }`;

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Close answer canvas"
        data-answer-scrim
        onClick={onClose}
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-300 sm:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={sheetRef}
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Answer canvas", tabIndex: -1 } : {})}
        data-answer-sheet={open ? "open" : "closed"}
        className={slotClass}
      >
        <div
          className={`flex h-full min-h-0 flex-col ${dragging ? "" : "transition-transform duration-250 [transition-timing-function:var(--neu-ease)]"}`}
          style={{ transform: `translateY(${dragY}px)` }}
        >
          {open && (
            <div
              aria-hidden="true"
              data-answer-drag-handle
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              className="flex shrink-0 cursor-grab touch-none items-center justify-center px-4 pt-3 pb-1 active:cursor-grabbing sm:hidden"
            >
              <span className="bg-outline/40 h-1.5 w-10 rounded-full" />
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  );
}
