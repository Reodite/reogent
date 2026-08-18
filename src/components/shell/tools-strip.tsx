"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";

/** Icon-only neumorphic tool launcher derived from {@link PANE_REGISTRY}. `rail` renders the pane-host's 3.75rem vertical column; `drawer` renders the mobile sidebar footer grid. */
export function ToolsStrip({ orientation }: { orientation: "rail" | "drawer" }) {
  const { activeChannel, setActiveChannel } = useChatShell();
  return (
    <nav
      aria-label="Tools"
      data-tools-strip
      className={
        orientation === "rail"
          ? "flex w-[3.75rem] flex-col items-center gap-1.5 px-0.5 py-3"
          : "border-border-subtle/60 mt-2 grid grid-cols-3 gap-1.5 border-t px-2 pt-2 pb-2 lg:hidden"
      }
    >
      {PANE_REGISTRY.map((entry) => {
        const active = activeChannel?.id === entry.id;
        return (
          <button
            key={entry.id}
            data-tool-id={entry.id}
            type="button"
            aria-label={entry.label}
            aria-pressed={active}
            title={entry.label}
            onClick={() => setActiveChannel(entry.id, entry.defaultState)}
            className={`neu-raised bg-surface text-on-surface-variant hover:text-primary focus-visible:ring-primary/40 grid size-9 min-h-[44px] min-w-[44px] place-items-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 active:[box-shadow:var(--neu-inset-shadow)] ${
              active ? "bg-accent-subtle text-primary" : ""
            }`}
          >
            <entry.icon className="size-4" />
          </button>
        );
      })}
    </nav>
  );
}
