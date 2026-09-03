"use client";

import type { CanvasView } from "@/src/components/shell/pane-registry";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const DISMISS_VELOCITY = 700;
const DEFAULT_SPLIT_POSITION = 50;
const MIN_SPLIT_POSITION = 25;
const MAX_SPLIT_POSITION = 75;
const FALLBACK_MIN_PANE_WIDTH = 288;
const SPLITTER_WIDTH = 12;
const KEYBOARD_RESIZE_STEP = 5;
const INLINE_CANVAS_QUERY = "(min-width: 640px)";

type SplitBounds = {
  left: number;
  width: number;
  min: number;
  max: number;
};

function roundSplitPosition(position: number): number {
  return Math.round(position * 100) / 100;
}

function answerPaneBasis(splitPosition: number): string {
  return `calc(${roundSplitPosition(100 - splitPosition)}% - 0.375rem)`;
}

function readSplitBounds(sheet: HTMLElement): SplitBounds {
  const rect = sheet.parentElement?.getBoundingClientRect();
  if (!rect || rect.width <= 0) {
    return { left: rect?.left ?? 0, width: 0, min: MIN_SPLIT_POSITION, max: MAX_SPLIT_POSITION };
  }

  const computedMinWidth = Number.parseFloat(window.getComputedStyle(sheet).minWidth);
  const minPaneWidth = computedMinWidth > 0 ? computedMinWidth : FALLBACK_MIN_PANE_WIDTH;
  const responsiveMin = ((minPaneWidth + SPLITTER_WIDTH / 2) / rect.width) * 100;
  const min = roundSplitPosition(Math.min(50, Math.max(MIN_SPLIT_POSITION, responsiveMin)));
  const max = roundSplitPosition(Math.max(50, Math.min(MAX_SPLIT_POSITION, 100 - responsiveMin)));
  return { left: rect.left, width: rect.width, min, max };
}

function applySplitPosition(sheet: HTMLElement, splitter: HTMLElement, requestedPosition: number): number {
  const { min, max } = readSplitBounds(sheet);
  const position = roundSplitPosition(Math.min(max, Math.max(min, requestedPosition)));
  const roundedChat = Math.round(position);
  sheet.style.flexBasis = answerPaneBasis(position);
  splitter.setAttribute("aria-valuemin", String(min));
  splitter.setAttribute("aria-valuemax", String(max));
  splitter.setAttribute("aria-valuenow", String(position));
  splitter.setAttribute("aria-valuetext", `Chat ${roundedChat}%, answer canvas ${100 - roundedChat}%`);
  return position;
}

function releaseResizePointer(splitter: HTMLHRElement, pointerId: number) {
  if (splitter.hasPointerCapture?.(pointerId)) splitter.releasePointerCapture(pointerId);
}

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
  const splitterRef = useRef<HTMLHRElement>(null);
  const splitPosition = useRef(DEFAULT_SPLIT_POSITION);
  const resizeStart = useRef<{ pointerId: number; position: number } | null>(null);
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

  const hasView = view !== null;
  const splitVisible = hasView && !collapsed;

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const splitter = splitterRef.current;
    if (!splitVisible || !sheet || !splitter) return;

    const inline = window.matchMedia(INLINE_CANVAS_QUERY);
    const keepPositionInBounds = () => {
      if (inline.matches) splitPosition.current = applySplitPosition(sheet, splitter, splitPosition.current);
    };
    keepPositionInBounds();

    const parent = sheet.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(keepPositionInBounds);
    observer.observe(parent);
    inline.addEventListener("change", keepPositionInBounds);
    return () => {
      observer.disconnect();
      inline.removeEventListener("change", keepPositionInBounds);
    };
  }, [splitVisible]);

  function resizeFromClientX(clientX: number) {
    const sheet = sheetRef.current;
    const splitter = splitterRef.current;
    if (!sheet || !splitter) return;
    const bounds = readSplitBounds(sheet);
    if (bounds.width <= 0) return;
    const requestedPosition = ((clientX - bounds.left) / bounds.width) * 100;
    splitPosition.current = applySplitPosition(sheet, splitter, requestedPosition);
  }

  function beginResize(event: PointerEvent<HTMLHRElement>) {
    if (event.button !== 0) return;
    resizeStart.current = { pointerId: event.pointerId, position: splitPosition.current };
    event.preventDefault();
    event.currentTarget.dataset.resizing = "true";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeFromClientX(event.clientX);
  }

  function moveResize(event: PointerEvent<HTMLHRElement>) {
    if (resizeStart.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    resizeFromClientX(event.clientX);
  }

  function finishResize(event: PointerEvent<HTMLHRElement>) {
    if (resizeStart.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    resizeFromClientX(event.clientX);
    resizeStart.current = null;
    delete event.currentTarget.dataset.resizing;
    releaseResizePointer(event.currentTarget, event.pointerId);
  }

  function cancelResize(event: PointerEvent<HTMLHRElement>) {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const sheet = sheetRef.current;
    const splitter = splitterRef.current;
    if (sheet && splitter) splitPosition.current = applySplitPosition(sheet, splitter, start.position);
    resizeStart.current = null;
    delete event.currentTarget.dataset.resizing;
    releaseResizePointer(event.currentTarget, event.pointerId);
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLHRElement>) {
    const sheet = sheetRef.current;
    const splitter = splitterRef.current;
    if (!sheet || !splitter) return;
    const bounds = readSplitBounds(sheet);
    let requestedPosition: number;
    switch (event.key) {
      case "ArrowLeft":
        requestedPosition = splitPosition.current - KEYBOARD_RESIZE_STEP;
        break;
      case "ArrowRight":
        requestedPosition = splitPosition.current + KEYBOARD_RESIZE_STEP;
        break;
      case "Home":
        requestedPosition = bounds.min;
        break;
      case "End":
        requestedPosition = bounds.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    splitPosition.current = applySplitPosition(sheet, splitter, requestedPosition);
  }

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

  const slotClass = `flex min-h-0 flex-col max-sm:transition-[transform,opacity,visibility] max-sm:duration-300 max-sm:[transition-timing-function:var(--neu-ease)] sm:h-full ${
    splitVisible
      ? "sm:grow-0 sm:shrink-0 sm:overflow-hidden sm:visible sm:min-w-72 sm:max-w-[calc(100%-18.75rem)] sm:opacity-100 lg:min-w-88 lg:max-w-[calc(100%-22.75rem)]"
      : "sm:basis-0 sm:grow-0 sm:overflow-hidden sm:invisible sm:min-w-0 sm:pointer-events-none sm:opacity-0"
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
      {splitVisible ? (
        <div
          data-answer-splitter-slot
          className="relative z-20 -mx-1.5 hidden h-full w-6 shrink-0 items-center justify-center sm:flex"
        >
          <hr
            ref={splitterRef}
            aria-label="Resize chat and answer canvas"
            aria-orientation="vertical"
            aria-valuemin={MIN_SPLIT_POSITION}
            aria-valuemax={MAX_SPLIT_POSITION}
            aria-valuenow={DEFAULT_SPLIT_POSITION}
            aria-valuetext="Chat 50%, answer canvas 50%"
            data-answer-splitter
            tabIndex={0}
            title="Drag or use the arrow keys to resize"
            onKeyDown={resizeWithKeyboard}
            onPointerDown={beginResize}
            onPointerMove={moveResize}
            onPointerUp={finishResize}
            onPointerCancel={cancelResize}
            onLostPointerCapture={cancelResize}
            className="peer absolute inset-0 m-0 h-full w-full cursor-ew-resize touch-none border-0 bg-transparent select-none"
          />
          <span
            aria-hidden="true"
            className="bg-outline/40 peer-hover:bg-primary peer-focus-visible:bg-primary peer-data-[resizing=true]:bg-primary pointer-events-none h-12 w-1 rounded-full transition-colors duration-150"
          />
        </div>
      ) : null}
      <div
        ref={sheetRef}
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Answer canvas", tabIndex: -1 } : {})}
        data-answer-sheet={open ? "open" : "closed"}
        className={slotClass}
        style={splitVisible ? { flexBasis: answerPaneBasis(splitPosition.current) } : undefined}
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
