"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Moves focus into a dialog, traps Tab within it, then restores the trigger. */
export function useDialogFocus<T extends HTMLElement>(): RefObject<T | null> {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog = dialog as T;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = activeDialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? activeDialog;
    initial.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = [...activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activeDialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeDialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return dialogRef;
}
