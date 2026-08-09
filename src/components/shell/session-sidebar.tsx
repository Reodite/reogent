"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { SessionSummary } from "@/src/lib/api-types";
import { SESSION_GROUP_ORDER, sessionGroup, type SessionGroup } from "@/src/lib/format";
import { motion, useReducedMotion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
          className="text-secondary hover:text-on-surface flex size-6 items-center justify-center rounded-md"
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          onClick={cancelAction}
          aria-label="Cancel"
          className="text-on-surface-variant hover:text-on-surface flex size-6 items-center justify-center rounded-md"
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
          className="text-error hover:text-on-surface flex size-6 items-center justify-center rounded-md"
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          onClick={cancelAction}
          aria-label="Cancel"
          className="text-on-surface-variant hover:text-on-surface flex size-6 items-center justify-center rounded-md"
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
            ? "bg-accent-subtle text-primary border-primary"
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
            ? "linear-gradient(to right, transparent, var(--accent-subtle) 40%)"
            : "linear-gradient(to right, transparent, var(--surface-container-high) 40%)",
        }}
        aria-hidden="true"
      />
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={startRename}
          aria-label="Rename"
          className="text-on-surface-variant hover:text-primary flex size-6 items-center justify-center rounded-md"
        >
          <Icon name="pencil" size={12} />
        </button>
        <button
          type="button"
          onClick={() => setMode("confirming-delete")}
          aria-label="Delete"
          className="text-on-surface-variant hover:text-error hover:bg-error-container/40 flex size-6 items-center justify-center rounded-md"
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
}

export function SessionSidebar({ onCollapse, onClose }: SessionSidebarProps = {}) {
  const router = useRouter();
  const params = useParams<{ session_id?: string }>();
  const {
    sessions,
    sessionsLoading,
    sessionsError,
    refreshSessions,
    setSidebarOpen,
    renameSessionLocally,
    removeSessionLocally,
  } = useChatShell();
  const activeId = params.session_id;
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
    router.push("/chat");
  }

  return (
    <div className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl p-2">
      <div className="flex items-center gap-3 px-2 pt-1 pb-2">
        {onCollapse && (
          <button
            id="desktop-session-collapse"
            type="button"
            onClick={onCollapse}
            aria-label="Collapse session history"
            title="Collapse sessions"
            className="neu-panel text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150"
          >
            <Icon name="left" size={18} />
          </button>
        )}
        <span className="text-on-surface min-w-0 flex-1 text-base leading-tight font-medium tracking-[-0.02em]">
          Sessions
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sessions"
            className="text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

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
        className="bg-surface-container-low/60 min-h-0 flex-1 overflow-y-auto rounded-xl p-2"
      >
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
          <p className="text-body-sm text-muted px-2 py-3">
            Your conversations will appear here. Each one keeps its map state too.
          </p>
        )}

        {!sessionsLoading &&
          !sessionsError &&
          grouped.map(([group, items]) => {
            const shouldStagger = !hasAnimated.current && !reduce;
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
                      <motion.li
                        key={session.session_id}
                        initial={shouldStagger ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          shouldStagger
                            ? { duration: 0.2, delay: Math.min(i * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }
                            : { duration: 0 }
                        }
                      >
                        <SessionItem
                          session={session}
                          active={active}
                          onOpen={() => openSession(session.session_id)}
                          onRename={(title) => renameSessionLocally(session.session_id, title)}
                          onDelete={() => removeSessionLocally(session.session_id)}
                        />
                      </motion.li>
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
            className="text-primary hover:bg-accent-subtle mt-2 w-full rounded-lg px-2 py-2 text-center text-xs font-medium"
          >
            Show more ({sessions.length - renderLimit} remaining)
          </button>
        )}
      </nav>
      <output className="sr-only" aria-live="polite">
        {!sessionsLoading && sessions.length > 0 ? `${sessions.length} conversations` : ""}
      </output>
    </div>
  );
}
