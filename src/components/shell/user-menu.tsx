"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { VersionBadge } from "@/src/components/shell/session-sidebar";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { useEffect, useRef, useState } from "react";

export function UserMenu() {
  const auth = useAppAuth();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      // Arrow key navigation within the menu
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        signOutRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="neu-button bg-surface text-primary flex size-11 items-center justify-center rounded-xl text-sm font-medium sm:size-9"
      >
        <span className="bg-primary-container text-on-primary-container flex size-6 items-center justify-center rounded-lg">
          {initial}
        </span>
      </button>

      {/* Scrim overlay */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <div
        inert={!open}
        aria-hidden={!open}
        role="menu"
        aria-label="Account"
        className={`profile-menu-surface glass-neu absolute top-12 right-0 z-50 w-64 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl p-3 ${
          open
            ? "blur-0 visible translate-y-0 scale-100 opacity-100"
            : "pointer-events-none invisible -translate-y-1.5 scale-[0.97] opacity-0 blur-[2px]"
        }`}
      >
        <div className="px-3 py-2">
          <p className="text-muted text-xs font-medium">Signed in as</p>
          <p className="text-body-sm text-on-surface mt-0.5 truncate" title={auth.user?.username ?? undefined}>
            {username}
          </p>
        </div>

        <div className="bg-border-subtle my-1 h-px" />

        <div className="flex items-center justify-between px-3 py-2 sm:hidden">
          <span className="text-on-surface-variant text-xs font-medium">Theme</span>
          <ThemeToggle />
        </div>

        <div className="bg-border-subtle my-1 h-px sm:hidden" />

        <button
          ref={signOutRef}
          type="button"
          role="menuitem"
          onClick={handleSignOut}
          className="text-on-surface hover:bg-error/10 hover:text-error flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-150"
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
      </div>
    </div>
  );
}
