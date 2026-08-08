"use client";

// Session sidebar: list from GET /api/sessions grouped by recency,
// "New Conversation" mints a client-side UUID, selecting a session loads it.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import type { SessionSummary } from "@/src/lib/api-types";
import { SESSION_GROUP_ORDER, sessionGroup, type SessionGroup } from "@/src/lib/format";
import { motion, useReducedMotion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

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

interface SessionSidebarProps {
  onCollapse?: () => void;
}

export function SessionSidebar({ onCollapse }: SessionSidebarProps = {}) {
  const router = useRouter();
  const params = useParams<{ session_id?: string }>();
  const { sessions, sessionsLoading, sessionsError, refreshSessions, setSidebarOpen } = useChatShell();
  const activeId = params.session_id;
  const reduce = useReducedMotion();
  const hasAnimated = useRef(false);
  const grouped = useMemo(() => groupSessions(sessions), [sessions]);

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
    router.push(`/chat/${crypto.randomUUID()}`);
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
        aria-live="polite"
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
            No conversations yet. Start one and it will be saved here.
          </p>
        )}

        {!sessionsLoading &&
          !sessionsError &&
          grouped.map(([group, items]) => {
            const shouldStagger = !hasAnimated.current && !reduce;
            return (
              <div key={group} className="pt-2 first:pt-0">
                <h3 className="text-muted px-2 pb-1.5 text-xs font-medium tracking-[0.05em] uppercase">{group}</h3>
                <ul className="flex flex-col gap-1">
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
                        <button
                          type="button"
                          onClick={() => openSession(session.session_id)}
                          aria-current={active ? "page" : undefined}
                          title={session.title}
                          className={`focus-visible:ring-primary/40 flex h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                            active
                              ? "bg-accent-subtle text-primary border-primary border-l-2"
                              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                          }`}
                        >
                          <Icon name="chat1" size={16} className="shrink-0" />
                          <span className="truncate text-sm">{session.title?.trim() || "Untitled"}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </nav>
    </div>
  );
}
