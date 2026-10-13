"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { SidebarItemButton, SidebarListItem } from "@/src/components/shell/sidebar-list";
import { Button } from "@/src/components/ui/button";
import { canRestoreFocus, DialogActions, DialogHeader, DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { RetryAlert, RetryState } from "@/src/components/ui/feedback";
import { FloatingPanel } from "@/src/components/ui/floating-panel";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import type { SessionSummary } from "@/src/lib/api-types";
import { SESSION_GROUP_ORDER, sessionGroup, type SessionGroup } from "@/src/lib/format";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "@/src/lib/sidebar";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const EXPANDED = "0";
const COLLAPSED = "1";

const sidebarListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
      document.documentElement.dataset.sidebarCollapsed = String(event.newValue === COLLAPSED);
      sidebarListeners.forEach((listener) => {
        listener();
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
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ?? EXPANDED;
  } catch {
    return EXPANDED;
  }
}

function getSidebarServerSnapshot(): string {
  return EXPANDED;
}

function setSidebarCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? COLLAPSED : EXPANDED);
    document.documentElement.dataset.sidebarCollapsed = String(next);
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
  const [mode, setMode] = useState<"idle" | "menu" | "editing">("idle");
  const [menuIndex, setMenuIndex] = useState(0);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const restoreEditorFocus = useRef(false);
  const menuId = useId();
  const errorId = useId();
  const title = session.title?.trim() || "Untitled";

  useLayoutEffect(() => {
    if (mode === "editing") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (mode === "idle" && restoreEditorFocus.current) {
      restoreEditorFocus.current = false;
      if (document.activeElement === document.body || rowRef.current?.contains(document.activeElement)) {
        moreRef.current?.focus({ preventScroll: true });
      }
    }
  }, [mode]);

  function openMenu(index = 0) {
    setMenuIndex(index);
    setMode("menu");
  }

  function startRename() {
    setEditValue(session.title?.trim() || "");
    setError(null);
    setMode("editing");
  }

  function cancelRename() {
    if (busyRef.current) return;
    restoreEditorFocus.current = true;
    setMode("idle");
    setError(null);
  }

  async function commitRename() {
    if (busyRef.current) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === session.title?.trim()) {
      cancelRename();
      return;
    }
    busyRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    setSaving(true);
    setError(null);
    try {
      await api.renameSession(session.session_id, trimmed);
      restoreEditorFocus.current = rowRef.current?.contains(document.activeElement) ?? false;
      onRename(trimmed);
      setMode("idle");
    } catch {
      setError("Couldn't rename this conversation. Try again.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function menuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    let next = menuIndex;
    if (event.key === "ArrowDown") next = (menuIndex + 1) % items.length;
    else if (event.key === "ArrowUp") next = (menuIndex + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    setMenuIndex(next);
    items[next]?.focus();
  }

  return (
    <div
      ref={rowRef}
      data-session-item
      data-session-idle={!active && mode === "idle" ? true : undefined}
      className="group relative"
    >
      {mode === "editing" ? (
        <div data-session-editing aria-busy={saving} className="ui-content-enter">
          <div data-session-editor-controls className="flex min-h-12 items-center gap-1 px-1 sm:min-h-9">
            <input
              ref={inputRef}
              aria-label="Conversation title"
              aria-describedby={error ? errorId : undefined}
              type="text"
              value={editValue}
              readOnly={saving}
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRename();
                }
              }}
              maxLength={80}
              className="bg-surface-container-low text-on-surface h-11 min-w-0 flex-1 rounded-md px-2 text-sm outline-none sm:h-8"
            />
            <Button
              variant="ghost"
              size="denseIcon"
              onClick={commitRename}
              disabled={saving}
              aria-label="Confirm rename"
              title={saving ? "Saving title…" : "Save title"}
            >
              <Icon name="check" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="denseIcon"
              onClick={cancelRename}
              disabled={saving}
              aria-label="Cancel rename"
            >
              <Icon name="close" size={16} />
            </Button>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-error px-2 pb-2 text-xs leading-5">
              {error}
            </p>
          ) : null}
          {saving ? (
            <span role="status" className="sr-only">
              Saving title…
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <SidebarItemButton
            label={title}
            icon={<Icon name="chat1" size={16} className="shrink-0" />}
            active={active}
            accessories
            onClick={onOpen}
            title={session.title}
          />
          <div data-session-actions className="absolute inset-y-0 right-0.5 flex items-center">
            <Button
              ref={moreRef}
              variant="ghost"
              size="denseIcon"
              aria-label={`Actions for ${title}`}
              aria-haspopup="menu"
              aria-expanded={mode === "menu"}
              aria-controls={mode === "menu" ? menuId : undefined}
              onClick={() => (mode === "menu" ? setMode("idle") : openMenu())}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                openMenu(event.key === "ArrowUp" ? 1 : 0);
              }}
            >
              <Icon name="more" size={18} />
            </Button>
          </div>
        </>
      )}
      <AnimatePresence initial={false}>
        {mode === "menu" ? (
          <FloatingPanel
            id={menuId}
            data-session-menu
            role="menu"
            aria-label={`Actions for ${title}`}
            anchorRef={moreRef}
            align="end"
            onDismiss={() => setMode((current) => (current === "menu" ? "idle" : current))}
            onFocus={(event) => {
              if (event.target !== event.currentTarget) return;
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[menuIndex]?.focus();
            }}
            onKeyDown={menuKeyDown}
            className="neu-panel bg-surface grid w-48 gap-1 rounded-xl p-1"
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={menuIndex === 0 ? 0 : -1}
              onFocus={() => setMenuIndex(0)}
              onClick={startRename}
              className="hover:bg-surface-container-high focus-visible:ring-primary/40 text-on-surface flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Icon name="pencil" size={16} />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={menuIndex === 1 ? 0 : -1}
              onFocus={() => setMenuIndex(1)}
              onClick={() => {
                moreRef.current?.focus({ preventScroll: true });
                setMode("idle");
                onDelete();
              }}
              className="hover:bg-error-container/40 focus-visible:ring-error/40 text-error flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Icon name="trash" size={16} />
              Delete
            </button>
          </FloatingPanel>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface SessionSidebarProps {
  onCollapse?: () => void;
  onClose?: () => void;
  /** Optional footer pinned under the session list (e.g. the ModeToggle). */
  footer?: ReactNode;
}

/** Renders a 60px brand header or a 48px collapsed logo row. `trailing` holds sidebar controls. */
export function BrandHeader({ collapsed = false, trailing }: { collapsed?: boolean; trailing?: ReactNode }) {
  return (
    <div
      data-sidebar-brand={collapsed ? "collapsed" : "expanded"}
      className={`flex shrink-0 items-center gap-2 ${collapsed ? "h-12 justify-center" : "h-15 justify-between px-2"}`}
    >
      <Link
        href="/"
        aria-label="Go to Reodite homepage"
        className={`group focus-visible:ring-primary/40 flex min-h-11 min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-offset-1 ${collapsed ? "w-11 justify-center rounded-xl" : "rounded-lg"}`}
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
  const api = useApi();
  const navigation = useShellNavigation();
  const pathname = navigation.displayPathname;
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
  const groupPrefix = useId();
  const deleteTitleId = useId();
  const deleteDescriptionId = useId();
  const [renderLimit, setRenderLimit] = useState(100);
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteBusyRef = useRef(false);
  const newConversationRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const grouped = useMemo(() => groupSessions(sessions.slice(0, renderLimit)), [sessions, renderLimit]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function confirmDelete() {
    if (!deleteTarget || deleteBusyRef.current) return;
    const id = deleteTarget.session_id;
    deleteBusyRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteSession(id);
      removeSessionLocally(id);
      if (mountedRef.current) {
        setDeleteTarget(null);
        if (activeIdRef.current === id) navigation.push("/chat");
      }
    } catch {
      if (mountedRef.current) setDeleteError("Couldn't delete this conversation. Try again.");
    } finally {
      deleteBusyRef.current = false;
      if (mountedRef.current) setDeleting(false);
    }
  }

  function openSession(id: string) {
    setSidebarOpen(false);
    navigation.push(`/chat/${id}`);
  }

  function newConversation() {
    // Let the new chat claim focus unless the user focuses another control while it loads.
    newConversationRef.current?.blur();
    setSidebarOpen(false);
    startNewChat();
    navigation.push("/chat");
  }

  return (
    <div data-sidebar-frame className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl p-2 pt-0">
      <BrandHeader
        trailing={
          <>
            {onCollapse && (
              <Button
                id="desktop-session-collapse"
                onClick={onCollapse}
                aria-label="Collapse session history"
                title="Collapse sessions"
                variant="ghost"
                size="icon"
              >
                <Icon name="left" size={18} />
              </Button>
            )}
            {onClose && (
              <Button onClick={onClose} aria-label="Close sessions" variant="ghost" size="icon">
                <Icon name="close" size={18} />
              </Button>
            )}
          </>
        }
      />

      <div className="pb-3">
        <Button ref={newConversationRef} variant="primary" onClick={newConversation} className="w-full">
          <Icon name="add" size={18} />
          New conversation
        </Button>
      </div>

      <nav
        aria-label="Chat sessions"
        data-sidebar-list
        aria-busy={sessionsLoading}
        className="bg-surface-container-low/60 min-h-0 flex-1 overflow-y-auto [overscroll-behavior-y:contain] rounded-2xl p-2"
      >
        {sessionsLoading && sessions.length === 0 && (
          <SkeletonGroup label="Loading sessions" className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg sm:h-9" />
            ))}
          </SkeletonGroup>
        )}

        {sessionsLoading && sessions.length > 0 ? (
          <span role="status" className="sr-only">
            Updating conversations…
          </span>
        ) : null}
        {!sessionsLoading && sessionsError && sessions.length > 0 ? (
          <RetryAlert onRetry={refreshSessions} variant="soft" className="mb-2">
            Couldn’t refresh conversations. Showing saved conversations.
          </RetryAlert>
        ) : null}

        {!sessionsLoading && sessionsError && sessions.length === 0 ? (
          <RetryState
            message="Couldn't load your conversations. Check your connection and try again."
            onRetry={refreshSessions}
            align="start"
            compact
            className="px-1 py-2"
          />
        ) : null}

        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
          <p className="text-body-sm text-muted px-2 py-3">Your conversations will appear here.</p>
        )}

        {grouped.map(([group, items]) => {
          const groupId = `${groupPrefix}-${group.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={group} className="pt-2 first:pt-0">
              <Heading
                as="h3"
                id={groupId}
                size="label"
                tone="muted"
                className="px-2 pb-1.5 tracking-[0.05em] uppercase"
              >
                {group}
              </Heading>
              <ul aria-labelledby={groupId} className="flex flex-col gap-1">
                {items.map((session) => {
                  const active = session.session_id === activeId;
                  return (
                    <SidebarListItem key={session.session_id}>
                      <SessionItem
                        session={session}
                        active={active}
                        onOpen={() => openSession(session.session_id)}
                        onRename={(title) => renameSessionLocally(session.session_id, title)}
                        onDelete={() => {
                          setDeleteError(null);
                          setDeleteTarget(session);
                        }}
                      />
                    </SidebarListItem>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!sessionsLoading && !sessionsError && sessions.length > renderLimit && (
          <Button variant="ghost" size="compact" onClick={() => setRenderLimit((n) => n + 100)} className="mt-2 w-full">
            Show more ({sessions.length - renderLimit} remaining)
          </Button>
        )}
      </nav>
      <output className="sr-only" aria-live="polite">
        {!sessionsLoading && sessions.length > 0 ? `${sessions.length} conversations` : ""}
      </output>
      {footer}
      <AnimatePresence initial={false}>
        {deleteTarget ? (
          <DialogRoot
            key={deleteTarget.session_id}
            onDismiss={() => setDeleteTarget(null)}
            dismissDisabled={deleting}
            backdropLabel="Cancel deleting conversation"
            returnFocusFallback={() => {
              const local = newConversationRef.current;
              return canRestoreFocus(local) ? local : document.getElementById("desktop-session-collapse");
            }}
          >
            <DialogPanel
              data-session-delete-dialog
              size="sm"
              aria-labelledby={deleteTitleId}
              aria-describedby={deleteDescriptionId}
              aria-busy={deleting}
            >
              <DialogHeader
                title="Delete conversation"
                titleId={deleteTitleId}
                description={
                  <span id={deleteDescriptionId}>
                    Delete “{deleteTarget.title?.trim() || "Untitled"}” and its messages?
                  </span>
                }
              />
              {deleteError ? (
                <p role="alert" className="text-error mt-4 text-sm">
                  {deleteError}
                </p>
              ) : null}
              <DialogActions>
                <Button data-dialog-initial-focus onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </DialogActions>
            </DialogPanel>
          </DialogRoot>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
