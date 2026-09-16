"use client";

import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastKind = "info" | "error";

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** Shows a transient message above the schedule surface. */
export function useToast() {
  return useContext(ToastContext);
}

function ToastMessage({ message, kind }: { message: string; kind: ToastKind }) {
  const present = useIsPresent();
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden={!present || undefined}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : 4, transition: { duration: reduce ? 0 : 0.14 } }}
      transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`neu-panel max-w-sm shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium ${
        kind === "error" ? "text-error" : "text-on-surface"
      }`}
    >
      {message}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { host } = useWorkspaceHost();
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const nextId = useRef(0);
  const deadlines = useRef(new Map<number, { at: number; timer: ReturnType<typeof setTimeout> }>());
  const pointerInside = useRef(false);
  const focusWithin = useRef(false);

  const removeOverdue = useCallback(() => {
    if (pointerInside.current || focusWithin.current) return;
    const now = performance.now();
    const expired = new Set<number>();
    for (const [id, deadline] of deadlines.current) {
      if (deadline.at > now) continue;
      clearTimeout(deadline.timer);
      deadlines.current.delete(id);
      expired.add(id);
    }
    if (expired.size) setItems((prev) => prev.filter((item) => !expired.has(item.id)));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++nextId.current;
      if (deadlines.current.size === 3) {
        const oldest = deadlines.current.entries().next().value;
        if (oldest) {
          clearTimeout(oldest[1].timer);
          deadlines.current.delete(oldest[0]);
        }
      }
      deadlines.current.set(id, { at: performance.now() + 4200, timer: setTimeout(removeOverdue, 4200) });
      setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
    },
    [removeOverdue],
  );

  useEffect(() => {
    const pending = deadlines.current;
    return () => {
      for (const deadline of pending.values()) clearTimeout(deadline.timer);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-label="Notifications"
        tabIndex={items.length ? 0 : undefined}
        data-toast-host={host}
        onPointerEnter={() => {
          pointerInside.current = true;
        }}
        onPointerLeave={() => {
          pointerInside.current = false;
          removeOverdue();
        }}
        onFocus={() => {
          focusWithin.current = true;
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          focusWithin.current = false;
          removeOverdue();
        }}
        className={`app-notification-stack schedule-toast-stack fixed left-1/2 z-50 flex w-max -translate-x-1/2 flex-col items-center gap-2 overflow-y-auto overscroll-y-contain p-2 ${items.length ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <ToastMessage key={t.id} message={t.message} kind={t.kind} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
