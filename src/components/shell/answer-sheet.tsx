"use client";

import { Icon } from "@/src/components/icons";
import type { CanvasView } from "@/src/components/shell/pane-registry";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The AI-mode Answer Canvas host. Renders its `children` (an `AnswerCanvas`)
 * exactly once, never swapping the wrapper element. CSS `lg:`/`max-lg:` variants
 * make the slot inline on wide viewports and a Bottom Sheet below wide, so the
 * mounted `MapArea` survives wide ⇄ sheet ⇄ closed transitions (REQ-9.4: the
 * map stays mounted; only its presentation changes). No JS media query, so
 * server-rendered HTML matches first paint.
 *
 * `open` is only ever true below wide (the Top-Bar Map entry that sets it is
 * `lg:hidden`); leftover `open` at wide harmlessly shows the inline canvas.
 */
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
  const showDialog = open;

  // Escape closes the sheet; focus moves to the sheet's first control (the
  // canvas titlebar close) on open. Focus return to the opening control is
  // handled by the shell (Task 13).
  useEffect(() => {
    if (!showDialog) return;
    sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDialog, onClose]);

  const hasView = view !== null;
  const slotClass = `flex min-h-0 flex-col transition-[transform,opacity,visibility] duration-300 [transition-timing-function:var(--neu-ease)] lg:h-full will-change-transform ${
    collapsed || !hasView ? "lg:hidden" : "lg:flex-1 lg:min-w-88"
  } ${
    open
      ? "max-lg:neu-panel max-lg:bg-surface max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:h-[80dvh] max-lg:flex-col max-lg:overflow-hidden max-lg:rounded-t-2xl max-lg:pb-[env(safe-area-inset-bottom)] max-lg:translate-y-0 max-lg:opacity-100 max-lg:visible"
      : "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:translate-y-full max-lg:opacity-0 max-lg:invisible max-lg:pointer-events-none"
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
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div ref={sheetRef} data-answer-sheet={open ? "open" : "closed"} className={slotClass}>
        {open && (
          <div aria-hidden="true" className="flex shrink-0 items-center justify-center px-4 pt-3 pb-1 lg:hidden">
            <span className="bg-outline/40 h-1.5 w-10 rounded-full" />
          </div>
        )}
        {children}
      </div>
    </>
  );
}
