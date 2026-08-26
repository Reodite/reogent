"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";

export function ToolList({ collapsed = false }: { collapsed?: boolean }) {
  const { workspaceView, setActiveChannel } = useChatShell();
  const router = useRouter();
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Tools" data-tool-list className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "px-0 py-2" : "p-2"}`}>
      <ul className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
        {PANE_REGISTRY.map((entry, i) => {
          const active = workspaceView?.paneId === entry.id;
          const slug = paneIdToSlug(entry.id);
          return (
            <motion.li
              key={entry.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30, delay: i * 0.05 }}
            >
              <button
                type="button"
                data-tool-id={entry.id}
                aria-pressed={active}
                aria-current={active ? "true" : undefined}
                disabled={!slug}
                onClick={() => {
                  if (!slug) return;
                  setActiveChannel(entry.id, entry.defaultState);
                  router.push(`/tools/${slug}`);
                }}
                className={`focus-visible:ring-primary/40 flex h-9 items-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  collapsed ? "w-9 justify-center" : "w-full gap-2.5 px-3"
                } ${
                  active
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <entry.icon className="size-4 shrink-0" />
                <span
                  className={`whitespace-nowrap text-sm font-medium transition-opacity duration-300 ${
                    collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                  }`}
                >
                  {entry.label}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
