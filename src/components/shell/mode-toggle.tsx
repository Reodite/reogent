"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { useRouter } from "next/navigation";

const LAST_CHAT_PATH_KEY = "reogent.lastChatPath";

/**
 * The AI/Tools mode switch pinned to the Left Sidebar footer. ON = AI Mode,
 * OFF = Tools Mode. The URL is the source of truth for the active mode
 * (`/chat/*` ↔ ai, `/tools/*` ↔ tools), so toggling pushes the corresponding
 * URL: AI→Tools navigates to `/tools/<slug>` (current pane, else `map`);
 * Tools→AI resumes the chat path saved on the previous AI→Tools toggle (or
 * `/chat` when no saved path exists).
 */
export function ModeToggle() {
  const { mode, setMode, workspaceView } = useChatShell();
  const router = useRouter();
  const on = mode === "ai";

  function handleClick() {
    if (on) {
      // AI → Tools: save current chat path, then jump to the tools URL for the
      // active pane (or `map` as the default landing tool).
      try {
        const p = window.location.pathname;
        if (p.startsWith("/chat")) sessionStorage.setItem(LAST_CHAT_PATH_KEY, p);
      } catch {
        /* sessionStorage unavailable */
      }
      const slug = (workspaceView && paneIdToSlug(workspaceView.paneId)) ?? "map";
      setMode("tools");
      router.push(`/tools/${slug}`);
    } else {
      // Tools → AI: resume the last chat path, else start a new chat.
      let target = "/chat";
      try {
        const last = sessionStorage.getItem(LAST_CHAT_PATH_KEY);
        if (last?.startsWith("/chat")) target = last;
      } catch {
        /* sessionStorage unavailable */
      }
      setMode("ai");
      router.push(target);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="AI mode"
      data-mode-toggle
      data-mode={mode}
      onClick={handleClick}
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
