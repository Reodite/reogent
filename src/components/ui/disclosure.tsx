"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";

type DisclosureProps = {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
};

function DisclosureBody({
  children,
  id,
  className,
  initiallyOpen,
}: Omit<DisclosureProps, "open"> & { initiallyOpen: boolean }) {
  const present = useIsPresent();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const complete = useRef<(definition: unknown) => void>(() => {});
  const animation = useMemo(() => ({ gridTemplateRows: present ? "1fr" : "0fr", opacity: present ? 1 : 0 }), [present]);
  const entry = useRef({ animation, reduce, consumed: false });

  useLayoutEffect(() => {
    if (entry.current.animation !== animation) entry.current = { animation, reduce, consumed: false };
    const opening = entry.current;
    if (opening.reduce !== reduce) opening.consumed = true;
    const body = ref.current;
    if (!present || !body || opening.consumed) return;
    const controller = new AbortController();
    let target: HTMLElement | null = null;
    let settled = false;
    let frame = 0;
    const cancel = () => {
      controller.abort();
      cancelAnimationFrame(frame);
    };
    const interrupt = () => {
      opening.consumed = true;
      cancel();
    };
    const settle = () => {
      if (settled || controller.signal.aborted) return;
      settled = true;
      frame = requestAnimationFrame(() => {
        if (controller.signal.aborted) return;
        opening.consumed = true;
        cancel();
        if (
          target?.isConnected &&
          target === document.activeElement &&
          body.contains(target) &&
          !target.closest("[inert], [hidden], [aria-hidden='true']") &&
          target.getClientRects().length
        ) {
          target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        }
      });
    };
    complete.current = (definition) => {
      // Motion reports the original target to the current event handler after an interruption.
      if (definition === animation) settle();
    };
    const rememberFocus = (element: EventTarget | null) => {
      if (settled || controller.signal.aborted || !(element instanceof HTMLElement)) return;
      if (target && target !== element) {
        interrupt();
        return;
      }
      if (target) return;
      target = element;
      for (const type of ["keydown", "pointerdown", "wheel", "touchmove"] as const) {
        document.addEventListener(type, interrupt, { capture: true, passive: true, signal: controller.signal });
      }
    };
    body.addEventListener("focusin", (event) => rememberFocus(event.target), { signal: controller.signal });
    body.addEventListener("focusout", interrupt, { signal: controller.signal });
    if (body.contains(document.activeElement)) rememberFocus(document.activeElement);
    if (reduce || initiallyOpen) settle();
    return cancel;
  }, [animation, present, reduce, initiallyOpen]);

  return (
    <motion.div
      ref={ref}
      id={id}
      data-disclosure
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      className={`grid shrink-0 ${className ?? ""}`}
      initial={reduce ? false : { gridTemplateRows: "0fr", opacity: 0 }}
      animate={animation}
      onAnimationComplete={(definition) => complete.current(definition)}
      exit={{ gridTemplateRows: "0fr", opacity: 0 }}
      transition={{ duration: reduce ? 0 : present ? 0.24 : 0.16, ease: [0.16, 1, 0.3, 1] }}
    >
      <div data-disclosure-content className="min-h-0 overflow-hidden">
        {children}
      </div>
    </motion.div>
  );
}

/** Expands conditional content, reveals focused controls after layout, and deactivates closing controls. */
export function Disclosure({ open, ...props }: DisclosureProps) {
  // AnimatePresence skips entry only for its initially visible child.
  const initiallyOpen = useRef(open);
  useLayoutEffect(() => {
    if (!open) initiallyOpen.current = false;
  }, [open]);
  return (
    <AnimatePresence initial={false}>
      {open ? <DisclosureBody {...props} initiallyOpen={initiallyOpen.current} /> : null}
    </AnimatePresence>
  );
}
