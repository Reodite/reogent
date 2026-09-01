"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { VersionBadge } from "@/src/components/shell/session-sidebar";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { ThemeToggle } from "@/src/components/theme-toggle";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Account trigger at the bottom of the sidebar (below the mode toggle). The
 * menu portals to `document.body` and anchors to the trigger's rect so it
 * escapes the sidebar card's `overflow-hidden`: expanded sidebar opens it
 * upward with the trigger's full width; the collapsed rail opens it as a
 * flyout to the right.
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const auth = useAppAuth();
  const navigation = useShellNavigation();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      // Arrow keys cycle through menu items.
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length].focus();
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

  function toggleOpen() {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuStyle(
          collapsed
            ? { left: rect.right + 8, bottom: window.innerHeight - rect.bottom, width: 224 }
            : { left: rect.left, bottom: window.innerHeight - rect.top + 8, width: rect.width },
        );
      }
    }
    setOpen((value) => !value);
  }

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
        onClick={toggleOpen}
        aria-haspopup="menu"
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

      {open &&
        menuStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            style={menuStyle}
            className="profile-menu-surface glass-neu fixed z-50 max-w-[calc(100vw-2rem)] origin-bottom [animation:menu-in_180ms_ease-out] rounded-2xl p-2 motion-reduce:[animation:none]"
          >
            <div className="px-3 py-2">
              <p className="text-muted text-xs font-medium">Signed in as</p>
              <p className="text-body-sm text-on-surface mt-0.5 truncate" title={auth.user?.username ?? undefined}>
                {username}
              </p>
            </div>

            <div className="bg-border-subtle my-1 h-px" />

            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-on-surface-variant text-xs font-medium">Appearance</span>
              <ThemeToggle />
            </div>

            <div className="bg-border-subtle my-1 h-px" />

            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
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
              role="menuitem"
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
          </div>,
          document.body,
        )}
    </>
  );
}
