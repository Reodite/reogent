"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastKind = "info" | "error";

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** Shows a transient message above the schedule surface. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++nextId.current;
    setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`neu-panel max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium ${
              t.kind === "error" ? "text-error" : "text-on-surface"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
