"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { LAST_CHAT_PATH_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TABS: { mode: ShellMode; label: string; icon: IconName; guestLocked?: boolean }[] = [
  { mode: "ai", label: "AI", icon: "bling", guestLocked: true },
  { mode: "tools", label: "Tools", icon: "layer" },
  { mode: "unity", label: "Unity", icon: "group", guestLocked: true },
];

export function ModeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { mode, setMode, workspaceView } = useChatShell();
  const { isGuest } = useAppAuth();
  const router = useRouter();
  const [tooltip, setTooltip] = useState<string | null>(null);

  function navigate(next: ShellMode) {
    if (next === mode) return;
    if (isGuest && TABS.find((t) => t.mode === next)?.guestLocked) return;

    if (mode === "ai") {
      try {
        const p = window.location.pathname;
        if (p.startsWith("/chat")) sessionStorage.setItem(LAST_CHAT_PATH_KEY, p);
      } catch {}
    }

    setMode(next);

    if (next === "ai") {
      let target = "/chat";
      try {
        const last = sessionStorage.getItem(LAST_CHAT_PATH_KEY);
        if (last?.startsWith("/chat")) target = last;
      } catch {}
      router.push(target);
    } else if (next === "tools") {
      const slug = (workspaceView && paneIdToSlug(workspaceView.paneId)) ?? "map";
      router.push(`/tools/${slug}`);
    } else {
      router.push("/pulse");
    }
  }

  return (
    <div
      className={`flex gap-1 rounded-xl p-1 ${collapsed ? "flex-col items-center" : ""}`}
      role="tablist"
      aria-label="Mode"
    >
      {TABS.map((tab) => {
        const locked = isGuest && tab.guestLocked;
        const active = mode === tab.mode;
        return (
          <div key={tab.mode} className={`relative ${collapsed ? "" : "flex-1"}`}>
            <button
              type="button"
              role="tab"
              data-mode-toggle
              aria-selected={active}
              aria-disabled={locked || undefined}
              onClick={() => navigate(tab.mode)}
              onMouseEnter={() => locked && setTooltip(tab.mode)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => locked && setTooltip(tab.mode)}
              onBlur={() => setTooltip(null)}
              className={`focus-visible:ring-primary/40 flex h-9 items-center rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                collapsed ? "w-9 justify-center" : "w-full justify-center gap-1.5"
              } ${
                locked
                  ? "cursor-not-allowed opacity-40"
                  : active
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <Icon name={tab.icon} size={16} className="shrink-0" />
              {!collapsed && tab.label}
            </button>
            {tooltip === tab.mode && (
              <div className="bg-surface-container-high text-on-surface absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg">
                Sign in to unlock this feature!
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
