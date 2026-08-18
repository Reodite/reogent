"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";

/**
 * The Tools Mode Left Sidebar body: one row per `PANE_REGISTRY` entry. Selecting
 * a row loads that tool's default view into the canvas (Requirement 6.3). The Map
 * row is an ordinary tool here — no special competition with chat (Requirement 6.4).
 */
export function ToolList() {
  const { workspaceView, setWorkspaceView } = useChatShell();
  return (
    <nav aria-label="Tools" data-tool-list className="min-h-0 flex-1 overflow-y-auto p-2">
      <span className="text-on-surface block px-2 pt-1 pb-2 text-base leading-tight font-medium tracking-[-0.02em]">
        Tools
      </span>
      <ul className="flex flex-col gap-1">
        {PANE_REGISTRY.map((entry) => {
          const active = workspaceView?.paneId === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                data-tool-id={entry.id}
                aria-pressed={active}
                aria-current={active ? "true" : undefined}
                onClick={() => setWorkspaceView({ paneId: entry.id, state: entry.defaultState })}
                className={`focus-visible:ring-primary/40 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  active
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <entry.icon className="size-4 shrink-0" />
                <span className="truncate text-sm font-medium">{entry.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
