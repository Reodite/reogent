"use client";

import { createContext, useContext, useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const DialogPanelContext = createContext<React.MutableRefObject<HTMLElement | null> | null>(null);

interface DialogRootProps {
  children: ReactNode;
  onDismiss: () => void;
  backdropLabel: string;
  dismissDisabled?: boolean;
  placement?: "center" | "mobile-sheet";
}

/** Portals a modal, traps focus, inerts the page, and restores the exact trigger. */
export function DialogRoot({
  children,
  onDismiss,
  backdropLabel,
  dismissDisabled = false,
  placement = "center",
}: DialogRootProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  const disabledRef = useRef(dismissDisabled);
  dismissRef.current = onDismiss;
  disabledRef.current = dismissDisabled;

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const activePanel: HTMLElement = panel;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblingStates = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({ element, inert: element.inert }));

    document.body.style.overflow = "hidden";
    for (const { element } of siblingStates) element.inert = true;
    (activePanel.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? activePanel).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (disabledRef.current) return;
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...activePanel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        activePanel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activePanel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activePanel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert } of siblingStates) element.inert = inert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      data-dialog-root
      className={`fixed inset-0 z-50 flex justify-center ${
        placement === "mobile-sheet"
          ? "items-end px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          : "items-center p-4"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={backdropLabel}
        disabled={dismissDisabled}
        onClick={() => dismissRef.current()}
        className="bg-scrim absolute inset-0"
      />
      <DialogPanelContext.Provider value={panelRef}>{children}</DialogPanelContext.Provider>
    </div>,
    document.body,
  );
}

const PANEL_SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
} as const;

type SharedPanelProps = {
  size?: keyof typeof PANEL_SIZE_CLASSES;
};

type DivPanelProps = ComponentPropsWithoutRef<"div"> & SharedPanelProps & { as?: "div" };
type FormPanelProps = ComponentPropsWithoutRef<"form"> & SharedPanelProps & { as: "form" };

/** Renders the modal panel as a div or form with shared material and width. */
export function DialogPanel(props: DivPanelProps | FormPanelProps) {
  const panelRef = useContext(DialogPanelContext);
  if (!panelRef) throw new Error("DialogPanel must be rendered inside DialogRoot");

  const { as = "div", size = "md", className, ...panelProps } = props;
  const classes = `neu-panel bg-surface relative w-full rounded-2xl ${PANEL_SIZE_CLASSES[size]} ${className ?? ""}`;

  if (as === "form") {
    return (
      <form
        ref={panelRef as React.MutableRefObject<HTMLFormElement | null>}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={classes}
        {...(panelProps as ComponentPropsWithoutRef<"form">)}
      />
    );
  }

  return (
    <div
      ref={panelRef as React.MutableRefObject<HTMLDivElement | null>}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={classes}
      {...(panelProps as ComponentPropsWithoutRef<"div">)}
    />
  );
}
