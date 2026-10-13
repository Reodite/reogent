"use client";

import { useOverlayPresence } from "@/src/components/ui/use-overlay-presence";
import { useCallback, useLayoutEffect, useRef, useState, type ComponentPropsWithRef, type RefObject } from "react";
import { createPortal } from "react-dom";

const EDGE = 8;
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

export type FloatingPanelProps = ComponentPropsWithRef<"div"> & {
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  align?: "start" | "end";
  matchAnchorWidth?: boolean;
  focusOnOpen?: boolean;
};

/** Returns visible, enabled tab stops in keyboard order. */
export function tabStops(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => {
      const style = getComputedStyle(element);
      return (
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
        element.getClientRects().length > 0 &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse"
      );
    })
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}

function boundedSize(cap: string | number | undefined, variable: string): string {
  const available = `var(${variable})`;
  return cap == null || cap === "none" ? available : `min(${typeof cap === "number" ? `${cap}px` : cap}, ${available})`;
}

/** Mount only while open. Portals an anchored, non-modal panel outside clipping ancestors. */
export function FloatingPanel({
  anchorRef,
  onDismiss,
  align = "start",
  matchAnchorWidth = false,
  focusOnOpen = true,
  children,
  ref,
  className,
  style,
  onKeyDown,
  tabIndex = -1,
  ...props
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useRef(onDismiss);
  const dismissedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    dismissRef.current = onDismiss;
  });

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      const cleanup = typeof ref === "function" ? ref(node) : undefined;
      if (ref && typeof ref !== "function") ref.current = node;
      return () => {
        panelRef.current = null;
        if (typeof cleanup === "function") cleanup();
        else if (typeof ref === "function") ref(null);
        else if (ref) ref.current = null;
      };
    },
    [ref],
  );

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    dismissRef.current();
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) {
      dismiss();
      return;
    }
    const viewport = window.visualViewport;

    function measure() {
      if (!panel || !anchor) return;
      if (!anchor.isConnected) {
        dismiss();
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      let visibleLeft = Math.max(rect.left, viewportLeft);
      let visibleRight = Math.min(rect.right, viewportRight);
      let visibleTop = Math.max(rect.top, viewportTop);
      let visibleBottom = Math.min(rect.bottom, viewportBottom);
      for (let element: HTMLElement | null = anchor; element; element = element.parentElement) {
        const computed = getComputedStyle(element);
        if (computed.display === "none" || computed.visibility === "hidden" || element.hidden || element.inert) {
          dismiss();
          return;
        }
        if (element === anchor) continue;
        const bounds = element.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(computed.overflowX || computed.overflow)) {
          visibleLeft = Math.max(visibleLeft, bounds.left + element.clientLeft);
          visibleRight = Math.min(visibleRight, bounds.left + element.clientLeft + element.clientWidth);
        }
        if (/auto|scroll|hidden|clip/.test(computed.overflowY || computed.overflow)) {
          visibleTop = Math.max(visibleTop, bounds.top + element.clientTop);
          visibleBottom = Math.min(visibleBottom, bounds.top + element.clientTop + element.clientHeight);
        }
      }
      if (rect.width > 0 && rect.height > 0 && (visibleRight <= visibleLeft || visibleBottom <= visibleTop)) {
        dismiss();
        return;
      }

      const scrollTop = panel.scrollTop;
      const scrollLeft = panel.scrollLeft;
      const width = Math.max(0, viewportRight - viewportLeft - EDGE * 2);
      const height = Math.max(0, viewportBottom - viewportTop - EDGE * 2);
      panel.style.setProperty("--floating-available-width", `${width}px`);
      panel.style.setProperty("--floating-available-height", `${height}px`);
      if (matchAnchorWidth) panel.style.width = `${Math.min(rect.width, width)}px`;
      const bounds = panel.getBoundingClientRect();
      const size = { width: panel.offsetWidth || bounds.width, height: panel.offsetHeight || bounds.height };
      const below = Math.max(0, viewportBottom - EDGE - rect.bottom - EDGE);
      const above = Math.max(0, rect.top - EDGE - viewportTop - EDGE);
      const flip = size.height > below && above > below;
      panel.dataset.overlaySide = flip ? "top" : "bottom";
      panel.style.transformOrigin = `${align === "end" ? "right" : "left"} ${flip ? "bottom" : "top"}`;
      const available = Math.min(height, flip ? above : below);
      panel.style.setProperty("--floating-available-height", `${available}px`);
      const panelHeight = Math.min(size.height, available);
      const panelWidth = Math.min(size.width, width);
      const left = align === "end" ? rect.right - panelWidth : rect.left;
      const top = flip ? rect.top - EDGE - panelHeight : rect.bottom + EDGE;
      panel.style.left = `${Math.max(viewportLeft + EDGE, Math.min(left, viewportRight - EDGE - panelWidth))}px`;
      panel.style.top = `${Math.max(viewportTop + EDGE, Math.min(top, viewportBottom - EDGE - panelHeight))}px`;
      panel.style.visibility = "visible";
      // Measuring the unconstrained height can clamp an existing scroll position.
      panel.scrollTop = scrollTop;
      panel.scrollLeft = scrollLeft;
    }

    function onScroll(event: Event) {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      measure();
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(anchor);
    resizeObserver.observe(panel);
    const removalObserver = new MutationObserver(() => {
      if (!anchor.isConnected) dismiss();
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });
    const visibilityObserver = new MutationObserver(measure);
    for (let element: HTMLElement | null = anchor; element; element = element.parentElement) {
      visibilityObserver.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden", "inert"] });
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      resizeObserver.disconnect();
      removalObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [mounted, anchorRef, align, matchAnchorWidth, dismiss]);

  const present = useOverlayPresence(panelRef, "popover", mounted);

  useLayoutEffect(() => {
    if (present) dismissedRef.current = false;
  }, [present]);

  useLayoutEffect(() => {
    if (!mounted || !present) return;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor || dismissedRef.current) return;
    let restoreFocus = true;
    if (focusOnOpen) panel.focus({ preventScroll: true });

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || panel?.contains(event.target) || anchor?.contains(event.target)) return;
      restoreFocus = false;
      dismiss();
    }

    function onFocusIn(event: FocusEvent) {
      if (!(event.target instanceof Node) || panel?.contains(event.target) || anchor?.contains(event.target)) return;
      restoreFocus = false;
      dismiss();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!panel || !anchor || event.defaultPrevented) return;
      const active = document.activeElement;
      const focusDropped = focusOnOpen && (active === document.body || active === document.documentElement);
      if (!panel.contains(active) && !anchor.contains(active) && !focusDropped) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        anchor.focus({ preventScroll: true });
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !panel.contains(active)) return;
      const stops = tabStops(panel);
      const atStart = active === panel || active === stops[0];
      const atEnd = stops.length === 0 || active === stops[stops.length - 1];
      if (!(event.shiftKey ? atStart : atEnd)) return;
      restoreFocus = false;
      const modal = anchor.closest<HTMLElement>('[aria-modal="true"]');
      const documentStops = tabStops(modal ?? document).filter((element) => !panel.contains(element));
      const anchorIndex = documentStops.indexOf(anchor);
      const next = event.shiftKey ? anchor : (documentStops[anchorIndex + 1] ?? (modal ? documentStops[0] : undefined));
      if (next) {
        event.preventDefault();
        next.focus();
      } else {
        // Let native Tab continue to browser chrome from the trigger at the document boundary.
        anchor.focus({ preventScroll: true });
      }
      dismiss();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocus && panel.contains(document.activeElement) && anchor.isConnected) {
        anchor.focus({ preventScroll: true });
      }
    };
  }, [mounted, present, anchorRef, focusOnOpen, dismiss]);

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      {...props}
      data-floating-panel=""
      data-exiting={!present || undefined}
      inert={!present || props.inert || undefined}
      aria-hidden={!present || props["aria-hidden"] || undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        anchorRef.current?.focus({ preventScroll: true });
        dismiss();
      }}
      ref={setPanelRef}
      tabIndex={tabIndex}
      className={className}
      style={{
        ...style,
        position: "fixed",
        pointerEvents: present ? style?.pointerEvents : "none",
        top: 0,
        left: 0,
        right: "auto",
        bottom: "auto",
        margin: 0,
        boxSizing: "border-box",
        minWidth: 0,
        minHeight: 0,
        maxWidth: boundedSize(style?.maxWidth, "--floating-available-width"),
        maxHeight: boundedSize(style?.maxHeight, "--floating-available-height"),
        overflow: "auto",
        visibility: "hidden",
        zIndex: style?.zIndex ?? 50,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
