"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { LAST_CHAT_PATH_KEY, type ShellMode } from "@/src/lib/shell-mode";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

const DESTINATIONS: { mode: ShellMode; label: string; icon: IconName; guestLocked?: boolean }[] = [
  { mode: "ai", label: "AI", icon: "bling", guestLocked: true },
  { mode: "tools", label: "Tools", icon: "layer" },
  { mode: "unity", label: "Unity", icon: "group", guestLocked: true },
];

function pathnameMatchesMode(pathname: string, mode: ShellMode): boolean {
  const base = mode === "tools" ? "/tools" : mode === "unity" ? "/pulse" : "/chat";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function ModeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { mode, setMode, workspaceView } = useChatShell();
  const { isGuest } = useAppAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tooltip, setTooltip] = useState<string | null>(null);

  function hrefFor(next: ShellMode): string {
    if (next === "ai") return "/chat";
    if (next === "unity") return "/pulse";
    const slug = (workspaceView && paneIdToSlug(workspaceView.paneId)) ?? "map";
    return `/tools/${slug}`;
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>, next: ShellMode) {
    const locked = isGuest && DESTINATIONS.find((destination) => destination.mode === next)?.guestLocked;
    if (locked || (next === mode && pathnameMatchesMode(pathname, next))) {
      event.preventDefault();
      return;
    }

    if (mode === "ai") {
      try {
        const path = window.location.pathname;
        if (path.startsWith("/chat")) sessionStorage.setItem(LAST_CHAT_PATH_KEY, path);
      } catch {}
    }

    setMode(next);
    if (next !== "ai") return;

    try {
      const last = sessionStorage.getItem(LAST_CHAT_PATH_KEY);
      if (last?.startsWith("/chat")) {
        event.preventDefault();
        router.push(last);
      }
    } catch {}
  }

  return (
    <nav aria-label="Reodite areas">
      <ul className={`flex gap-1 rounded-xl p-1 ${collapsed ? "flex-col items-center" : ""}`}>
        {DESTINATIONS.map((destination) => {
          const locked = isGuest && destination.guestLocked;
          const active = mode === destination.mode;
          return (
            <li key={destination.mode} className={`relative ${collapsed ? "" : "flex-1"}`}>
              <Link
                href={hrefFor(destination.mode)}
                data-mode-toggle
                aria-current={active ? "page" : undefined}
                aria-disabled={locked || undefined}
                onClick={(event) => navigate(event, destination.mode)}
                onMouseEnter={() => locked && setTooltip(destination.mode)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={() => locked && setTooltip(destination.mode)}
                onBlur={() => setTooltip(null)}
                className={`focus-visible:ring-primary/40 flex h-11 items-center rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 ${
                  collapsed ? "w-11 justify-center sm:w-9" : "w-full justify-center gap-1.5"
                } ${
                  locked
                    ? "cursor-not-allowed opacity-40"
                    : active
                      ? "neu-inset bg-surface-container text-on-surface"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <Icon name={destination.icon} size={16} className="shrink-0" />
                {!collapsed && destination.label}
              </Link>
              {tooltip === destination.mode && (
                <div className="bg-surface-container-high text-on-surface absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg">
                  Sign in to unlock this feature!
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
