"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";

/**
 * The AI/Tools mode switch pinned to the Left Sidebar footer. ON = AI Mode,
 * OFF = Tools Mode (Requirement 1.1–1.3). Persists via `useShellMode` (wired
 * through the shell context) and stays visible in both modes on every viewport.
 */
export function ModeToggle() {
  const { mode, setMode } = useChatShell();
  const on = mode === "ai";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="AI mode"
      data-mode-toggle
      data-mode={mode}
      onClick={() => setMode(on ? "tools" : "ai")}
      className="border-border-subtle/60 focus-visible:ring-primary/40 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm focus-visible:ring-2"
    >
      <span className="text-on-surface-variant font-medium select-none">AI mode</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
          on ? "bg-primary" : "bg-surface-container-high"
        }`}
      >
        <span
          className={`bg-surface inline-block size-4 translate-y-px rounded-full transition-transform duration-150 ${
            on ? "translate-x-[1.125rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
