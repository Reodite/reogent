"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { SidebarListItem, SidebarStaggerContext } from "@/src/components/shell/sidebar-list";
import type { SessionSummary } from "@/src/lib/api-types";
import { SESSION_GROUP_ORDER, sessionGroup, type SessionGroup } from "@/src/lib/format";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const SIDEBAR_KEY = "reogent.sidebar.collapsed";
const EXPANDED = "0";
const COLLAPSED = "1";

const sidebarListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SIDEBAR_KEY) {
      sidebarListeners.forEach((fn) => {
        fn();
      });
    }
  });
}

function subscribeSidebar(listener: () => void): () => void {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}

function getSidebarSnapshot(): string {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) ?? EXPANDED;
  } catch {
    return EXPANDED;
  }
}

function getSidebarServerSnapshot(): string {
  return EXPANDED;
}

function setSidebarCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, next ? COLLAPSED : EXPANDED);
  } catch {
    /* localStorage unavailable or over quota */
  }
  sidebarListeners.forEach((fn) => {
    fn();
  });
}

/**
 * Persists the desktop sidebar's collapsed state in
 * `localStorage["reogent.sidebar.collapsed"]` ("0" | "1"). SSR returns the
 * expanded default so server HTML is stable; React's `useSyncExternalStore`
 * re-renders with the stored value after hydration so the rail paints in its
 * prior state on first paint.
 */
export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  return [value === COLLAPSED, setSidebarCollapsed];
}

export function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_REOGENT_VERSION;
  if (!version) return <span className="text-muted text-xs">-</span>;
  return (
    <span className="text-on-surface-variant font-mono text-xs">
      <span className="sr-only">Reogent version </span>v{version}
    </span>
  );
}

function groupSessions(sessions: SessionSummary[]): Array<[SessionGroup, SessionSummary[]]> {
  const buckets = new Map<SessionGroup, SessionSummary[]>();
  for (const session of sessions) {
    const group = sessionGroup(session.updatedAt);
    const list = buckets.get(group);
    if (list) list.push(session);
    else buckets.set(group, [session]);
  }
  return SESSION_GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => [g, buckets.get(g) ?? []]);
}

function SessionItem({
  session,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const api = useApi();
  const router = useRouter();
  type Mode = "idle" | "editing" | "confirming-delete";
  const [mode, setMode] = useState<Mode>("idle");
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setEditValue(session.title?.trim() || "");
    setMode("editing");
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function cancelAction() {
    setMode("idle");
  }

  async function commitRename() {
    const trimmed = editValue.trim();
    setMode("idle");
    if (!trimmed || trimmed === session.title) return;
    onRename(trimmed);
    try {
      await api.renameSession(session.session_id, trimmed);
    } catch {
      /* best effort */
    }
  }

  async function confirmDelete() {
    onDelete();
    setMode("idle");
    try {
      await api.deleteSession(session.session_id);
    } catch {
      /* best effort */
    }
    if (active) router.push("/chat");
  }

  // Editing: inline text input with checkmark/x
  if (mode === "editing") {
    return (
      <div className="flex h-9 items-center gap-1 px-1">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelAction();
          }}
          maxLength={80}
          className="bg-surface-container-low text-on-surface h-7 min-w-0 flex-1 rounded-md px-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={commitRename}
          aria-label="Confirm rename"
          className="focus-visible:ring-primary/40 text-secondary hover:text-on-surface flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          onClick={cancelAction}
          aria-label="Cancel"
          className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-on-surface flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    );
  }

  // Confirming delete: shows "Confirm deletion" with checkmark/x
  if (mode === "confirming-delete") {
    return (
      <div className="flex h-9 items-center gap-1 px-1">
        <span className="text-error min-w-0 flex-1 truncate px-2 text-sm">Confirm deletion</span>
        <button
          type="button"
          onClick={confirmDelete}
          aria-label="Confirm delete"
          className="focus-visible:ring-primary/40 text-error hover:text-on-surface flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          onClick={cancelAction}
          aria-label="Cancel"
          className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-on-surface flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        title={session.title}
        className={`focus-visible:ring-primary/40 flex h-9 w-full items-center gap-2 overflow-hidden rounded-lg border-l-2 px-3 py-2 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
          active
            ? "neu-inset bg-surface-container text-on-surface border-transparent"
            : "text-on-surface-variant group-hover:bg-surface-container-high group-hover:text-on-surface border-transparent"
        }`}
      >
        <Icon name="chat1" size={16} className="shrink-0" />
        <span className="truncate text-sm">{session.title?.trim() || "Untitled"}</span>
      </button>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 rounded-r-lg opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        style={{
          background: active
            ? "linear-gradient(to right, transparent, var(--surface-container) 40%)"
            : "linear-gradient(to right, transparent, var(--surface-container-high) 40%)",
        }}
        aria-hidden="true"
      />
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={startRename}
          aria-label="Rename"
          className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-primary flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="pencil" size={12} />
        </button>
        <button
          type="button"
          onClick={() => setMode("confirming-delete")}
          aria-label="Delete"
          className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-error hover:bg-error-container/40 flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    </div>
  );
}

interface SessionSidebarProps {
  onCollapse?: () => void;
  onClose?: () => void;
  /** Optional footer pinned under the session list (e.g. the ModeToggle). */
  footer?: ReactNode;
}

/** Reodite brand header: the sidebar's 60px top row, aligned with the chat and
 *  data-panel header band. Collapsed rail shows only the logo tile. `trailing`
 *  carries row actions (collapse chevron on desktop, close in the mobile drawer). */
export function BrandHeader({ collapsed = false, trailing }: { collapsed?: boolean; trailing?: ReactNode }) {
  return (
    <div className={`flex h-15 items-center gap-2 ${collapsed ? "justify-center" : "justify-between px-2"}`}>
      <Link
        href="/"
        aria-label="Go to Reodite homepage"
        className="group focus-visible:ring-primary/40 flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        <span className="bg-surface-container-low text-primary group-hover:text-on-surface flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150">
          <Icon name="school" size={18} />
        </span>
        <span
          className={`text-primary group-hover:text-on-surface text-base font-medium tracking-[-0.025em] whitespace-nowrap transition-opacity duration-300 ${
            collapsed ? "hidden" : ""
          }`}
        >
          Reodite
        </span>
      </Link>
      {trailing && <div className="flex items-center gap-1">{trailing}</div>}
    </div>
  );
}

export function SessionSidebar({ onCollapse, onClose, footer }: SessionSidebarProps = {}) {
  const router = useRouter();
  const params = useParams<{ session_id?: string }>();
  const pathname = usePathname();
  const {
    sessions,
    sessionsLoading,
    sessionsError,
    refreshSessions,
    setSidebarOpen,
    renameSessionLocally,
    removeSessionLocally,
    startNewChat,
  } = useChatShell();
  // Pathname, not params: a locally-minted session exists only in the URL
  // (the router stays on /chat), so params would miss the highlight.
  const activeId = /^\/chat\/([^/]+)/.exec(pathname)?.[1];
  const reduce = useReducedMotion();
  const hasAnimated = useRef(false);
  const [renderLimit, setRenderLimit] = useState(100);
  const grouped = useMemo(() => groupSessions(sessions.slice(0, renderLimit)), [sessions, renderLimit]);

  // Mark animated after first render with sessions (avoids render-time side effect)
  useEffect(() => {
    if (!sessionsLoading && !sessionsError && sessions.length > 0) {
      hasAnimated.current = true;
    }
  }, [sessionsLoading, sessionsError, sessions]);

  function openSession(id: string) {
    setSidebarOpen(false);
    router.push(`/chat/${id}`);
  }

  function newConversation() {
    setSidebarOpen(false);
    // On a real session URL the router navigates (fresh mounted panel). On a
    // locally-minted URL the router still thinks it's on /chat, so push is a
    // no-op — reset the panel via context instead.
    if (params.session_id) {
      router.push("/chat");
    } else {
      window.history.replaceState(null, "", "/chat");
      startNewChat();
    }
  }

  return (
    <div className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl p-2 pt-0">
      <BrandHeader
        trailing={
          <>
            {onCollapse && (
              <button
                id="desktop-session-collapse"
                type="button"
                onClick={onCollapse}
                aria-label="Collapse session history"
                title="Collapse sessions"
                className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-primary hover:bg-surface-container-high flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                <Icon name="left" size={18} />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sessions"
                className="focus-visible:ring-primary/40 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </>
        }
      />

      <div className="pb-3">
        <button
          type="button"
          onClick={newConversation}
          className="neu-primary-button bg-primary text-on-primary flex h-9 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium"
        >
          <Icon name="add" size={18} />
          New conversation
        </button>
      </div>

      <nav
        aria-label="Chat sessions"
        aria-busy={sessionsLoading}
        className="bg-surface-container-low/60 min-h-0 flex-1 overflow-y-auto [overscroll-behavior-y:contain] rounded-xl p-2"
      >
        <SidebarStaggerContext.Provider value={!hasAnimated.current && !reduce}>
          {sessionsLoading && (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading sessions">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-surface-container h-10 animate-pulse rounded-lg" />
              ))}
            </div>
          )}

          {!sessionsLoading && sessionsError && (
            <div role="alert" className="text-body-sm text-on-surface-variant px-1 py-2">
              <p>Couldn&apos;t load your conversations. Check your connection and try again.</p>
              <button
                type="button"
                onClick={refreshSessions}
                className="neu-button bg-surface text-on-surface mt-3 flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
              >
                <Icon name="refresh2" size={14} />
                Try again
              </button>
            </div>
          )}

          {!sessionsLoading && !sessionsError && sessions.length === 0 && (
            <p className="text-body-sm text-muted px-2 py-3">Your conversations will appear here.</p>
          )}

          {!sessionsLoading &&
            !sessionsError &&
            grouped.map(([group, items]) => {
              const groupId = `session-group-${group.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <div key={group} className="pt-2 first:pt-0">
                  <h3 id={groupId} className="text-muted px-2 pb-1.5 text-xs font-medium tracking-[0.05em] uppercase">
                    {group}
                  </h3>
                  <ul aria-labelledby={groupId} className="flex flex-col gap-1">
                    {items.map((session, i) => {
                      const active = session.session_id === activeId;
                      return (
                        <SidebarListItem key={session.session_id} index={i}>
                          <SessionItem
                            session={session}
                            active={active}
                            onOpen={() => openSession(session.session_id)}
                            onRename={(title) => renameSessionLocally(session.session_id, title)}
                            onDelete={() => removeSessionLocally(session.session_id)}
                          />
                        </SidebarListItem>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          {!sessionsLoading && !sessionsError && sessions.length > renderLimit && (
            <button
              type="button"
              onClick={() => setRenderLimit((n) => n + 100)}
              className="text-primary hover:bg-surface-container-high hover:text-on-surface mt-2 w-full rounded-lg px-2 py-2 text-center text-xs font-medium"
            >
              Show more ({sessions.length - renderLimit} remaining)
            </button>
          )}
        </SidebarStaggerContext.Provider>
      </nav>
      <output className="sr-only" aria-live="polite">
        {!sessionsLoading && sessions.length > 0 ? `${sessions.length} conversations` : ""}
      </output>
      {footer}
    </div>
  );
}
