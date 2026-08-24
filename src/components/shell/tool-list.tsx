"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";

/**
 * The Tools Mode Left Sidebar body: one row per `PANE_REGISTRY` entry. Selecting
 * a row both sets the workspace view immediately (so the canvas updates without
 * waiting for the URL change to round-trip) and pushes `/tools/<slug>` (so the
 * URL reflects the active tool and survives deep-links and history). The Map
 * row is an ordinary tool here (Req 6.4).
 */
export function ToolList() {
  const { workspaceView, setActiveChannel } = useChatShell();
  const router = useRouter();
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Tools" data-tool-list className="min-h-0 flex-1 overflow-y-auto p-2">
      <span className="text-on-surface block px-2 pt-1 pb-2 text-base leading-tight font-medium tracking-[-0.02em]">
        Tools
      </span>
      <ul className="flex flex-col gap-1">
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
                className={`focus-visible:ring-primary/40 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  active
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <entry.icon className="size-4 shrink-0" />
                <span className="truncate text-sm font-medium">{entry.label}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
