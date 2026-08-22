"use client";

import { Icon } from "@/src/components/icons";
import { PANE_BY_ID, type CanvasView } from "@/src/components/shell/pane-registry";
import { useEffect, useRef, type ReactNode } from "react";

export function AnswerSheet({
  open,
  onClose,
  children,
  view,
  collapsed = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  view: CanvasView | null;
  collapsed?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const showDialog = open;

  useEffect(() => {
    if (!showDialog) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDialog, onClose]);

  const entry = view ? PANE_BY_ID[view.paneId] : null;
  const IconGlyph = entry?.icon;

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
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {IconGlyph && (
              <span className="bg-surface-container-low text-primary grid size-7 shrink-0 place-items-center rounded-lg">
                <IconGlyph className="size-4" />
              </span>
            )}
            <h2 className="truncate text-base font-medium tracking-[-0.01em]">{entry?.label ?? "Answer"}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close answer canvas"
            onClick={onClose}
            className="focus-visible:ring-primary/40 text-on-surface-variant hover:bg-surface-container-high flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        {children}
      </div>
    </>
  );
}
