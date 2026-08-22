"use client";

import { Icon } from "@/src/components/icons";
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
  children,
}: {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const showDialog = open;

  // Escape closes the sheet; focus moves to the close control on open. Focus
  // return to the opening control is handled by the shell (Task 13).
  useEffect(() => {
    if (!showDialog) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDialog, onClose]);

  const slotClass = `flex min-h-0 flex-col lg:h-full lg:flex-1 lg:min-w-88 ${collapsed ? "lg:hidden" : ""} ${
    open
      ? "max-lg:neu-panel max-lg:bg-surface max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:h-[80dvh] max-lg:flex-col max-lg:overflow-hidden max-lg:rounded-t-2xl max-lg:pb-[env(safe-area-inset-bottom)]"
      : "max-lg:hidden"
  }`;

  return (
    <>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close answer canvas"
          data-answer-scrim
          onClick={onClose}
          className="bg-scrim fixed inset-0 z-40 lg:hidden"
        />
      )}
      <div data-answer-sheet={open ? "open" : "closed"} className={slotClass}>
        {open && (
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-3 lg:hidden">
            <span aria-hidden="true" className="bg-outline/40 mx-auto h-1.5 w-10 rounded-full" />
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close answer canvas"
              className="focus-visible:ring-primary/40 text-on-surface-variant hover:bg-surface-container-high flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
