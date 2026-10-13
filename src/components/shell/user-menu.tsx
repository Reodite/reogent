"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { VersionBadge } from "@/src/components/shell/session-sidebar";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { FloatingPanel } from "@/src/components/ui/floating-panel";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

/** Opens viewport-bounded account actions and appearance controls from the sidebar. */
export function UserMenu({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const auth = useAppAuth();
  const navigation = useShellNavigation();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const username = auth.user?.username || "User";
  const initial = username.trim().charAt(0).toUpperCase() || "U";

  async function handleSignOut() {
    try {
      setSignOutError(false);
      auth.signOut();
      setOpen(false);
    } catch {
      setSignOutError(true);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-label="Account menu"
        className={`focus-visible:ring-primary/40 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex h-11 items-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 ${
          collapsed ? "w-11 justify-center sm:w-9" : "w-full gap-2.5 px-3"
        }`}
      >
        <span className="bg-primary-container text-on-primary-container flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{username}</span>
            <span className={`inline-flex shrink-0 transition-transform duration-150 ${open ? "" : "rotate-180"}`}>
              <Icon name="down" size={14} />
            </span>
          </>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <FloatingPanel
            id={menuId}
            anchorRef={triggerRef}
            onDismiss={() => setOpen(false)}
            matchAnchorWidth={!collapsed}
            role="dialog"
            aria-label="Account"
            className="glass-neu w-64 rounded-2xl p-2"
          >
            <div className="px-3 py-2">
              <p className="text-muted text-xs font-medium">Signed in as</p>
              <p className="text-body-sm text-on-surface mt-1 truncate" title={auth.user?.username ?? undefined}>
                {username}
              </p>
            </div>

            <div className="bg-border-subtle my-1 h-px" />

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
              <span className="text-on-surface-variant text-xs font-medium">Appearance</span>
              <ThemeToggle />
            </div>

            <div className="bg-border-subtle my-1 h-px" />

            <Link
              href="/settings"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              onNavigate={(event) => {
                event.preventDefault();
                navigation.push("/settings");
              }}
              className="text-on-surface hover:bg-surface-container-high hover:text-primary flex h-11 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150 sm:h-9"
            >
              <Icon name="settings" size={16} className="text-on-surface-variant" />
              Settings
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              className="text-on-surface hover:bg-error/10 hover:text-error flex h-11 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150 sm:h-9"
            >
              <Icon name="exit" size={16} className="text-on-surface-variant" />
              Sign out
            </button>
            {signOutError && <p className="text-error mt-1 px-3 text-xs">Sign out failed. Try again.</p>}

            <div className="bg-border-subtle my-1 h-px" />

            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted text-xs font-medium">Version</span>
              <VersionBadge />
            </div>
          </FloatingPanel>
        )}
      </AnimatePresence>
    </>
  );
}
