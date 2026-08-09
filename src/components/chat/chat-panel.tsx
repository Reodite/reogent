"use client";

// Chat panel (task 3.1): history load, optimistic send with in-flight lock,
// error banner with retry resending the same message, inline iteration warning,
// and highlight publication for the map via the walking_distance renderer.
import { ChatInput, type ChatInputHandle } from "@/src/components/chat/chat-input";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import {
  AssistantMessage,
  TypingIndicator,
  UserMessage,
  type DisplayMessage,
  type InterstitialBlock,
} from "@/src/components/chat/message";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { ApiError, type ChatMessage } from "@/src/lib/api-types";
import { uuid } from "@/src/lib/uuid";
import { mergeMapHighlights } from "@/src/lib/walking";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type HistoryState = "loading" | "ready" | "failed";

// Suggestions grouped by category. The picker selects one from each bucket,
// guaranteeing the first impression covers routes (map aha), courses, money, and other.
const SUGGESTION_BUCKETS = {
  routes: [
    "How long is the walk from IKB to ICCS?",
    "How do I get from the Nest to Buchanan?",
    "How far is the bus loop from the engineering buildings?",
    "Walk from the Student Union Building to Koerner Library",
    "How do I get from Totem Park to the chemistry building?",
    "Walk time from Allard Hall to the Law building?",
    "Distance from Place Vanier to the bookstore?",
  ],
  courses: [
    "Find 3-credit CPSC courses with no prerequisites",
    "What are the prereqs for CPSC 310?",
    "Show me MATH courses available in Term 1",
    "Find BIOL courses that count toward a Science breadth requirement",
    "What are the easiest 3-credit electives?",
    "What COMM courses can I take without prerequisites?",
    "Find 200-level ENGL courses offered in Term 2",
    "What PSYC courses are offered in the summer?",
    "Show me HIST courses with no prereqs",
    "What 400-level CPSC courses are offered next term?",
  ],
  money: [
    "What's tuition per credit for international Science students?",
    "How much does a full-time Arts degree cost per year?",
    "What are the student fees for 2025W?",
    "Estimated living cost for a year at UBC?",
    "Domestic vs international tuition for Engineering?",
    "How much is a full course load in Science?",
  ],
  other: [
    "Where can I study right now?",
    "What's the grade distribution for CHEM 121?",
    "Any events on campus this week?",
    "Where can I park near the engineering buildings?",
    "What are the admission requirements for Computer Science?",
    "When is the last day to drop a course without a W?",
    "Find coffee shops near the Nest",
    "What's the average GPA for MATH 100?",
    "Are there any free rooms in Buchanan right now?",
    "When does registration open for 2026W Term 1?",
    "Find food options near the engineering buildings",
    "What study rooms are available in IKB?",
    "Where is the Aquatic Centre?",
    "What are the admission requirements for Sauder?",
  ],
};

const GREETINGS = [
  "What do you need to find?",
  "Go ahead, I'm listening.",
  "Your campus, decoded.",
  "Course planning? Wayfinding? Shoot.",
  "What are you trying to figure out?",
  "Pick a question or type your own.",
  "I've got the whole course catalog in here.",
  "Where on campus do you need to be?",
  "Tuition math, route math, or both?",
];

const TIPS = [
  "Walking route questions draw the path on the map.",
  "Grade distributions go back several years.",
  "Events, parking, study spaces — all searchable.",
  "Answers come from indexed UBC data, not guesses.",
  "Tuition estimates break down by program and residency.",
  "Building searches show the location on the map.",
  "Room schedules update with real availability.",
  "Admission requirements vary by program — ask about yours.",
  "Food and services near any building are one question away.",
  "Prerequisites chain together — I'll trace them.",
  "Key academic dates: add/drop deadlines, reading breaks, exams.",
  "Cost estimates cover tuition, fees, and living expenses.",
];

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}`;
}

// Minimal error boundary: if the composer crashes, show a recovery prompt
// instead of killing the entire chat panel.
class ComposerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="shrink-0 px-3 pt-2 pb-3 text-center sm:px-4">
          <p className="text-muted text-xs">
            Something went wrong.{" "}
            <button type="button" onClick={() => this.setState({ failed: false })} className="text-primary underline">
              Tap to restore
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Renders LLM-generated follow-up suggestions after a response.
function FollowUpChips({ onSend, followUps }: { onSend: (text: string) => void; followUps?: string[] }) {
  if (!followUps || followUps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {followUps.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSend(chip)}
          className="border-border text-on-surface-variant hover:bg-accent-subtle hover:text-primary min-h-[44px] max-w-full rounded-2xl border px-4 py-2.5 text-left text-xs font-medium break-words transition-colors duration-150"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function toConversation(messages: DisplayMessage[]): ChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

export function ChatPanel({ sessionId: initialSessionId }: { sessionId: string | null }) {
  const api = useApi();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>(() => initialSessionId ?? "");
  // Tracks whether the session ID was minted locally (skip history fetch)
  const mintedLocally = useRef(!initialSessionId);
  const prefersReducedMotion = useReducedMotion();
  const { setHighlight, sessions, refreshSessions, addOptimisticSession } = useChatShell();

  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [historyNonce, setHistoryNonce] = useState(0);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [slowResponse, setSlowResponse] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Announce then clear after 1s so repeated identical messages re-trigger
  const announce = useCallback((msg: string) => {
    if (announceTimer.current) clearTimeout(announceTimer.current);
    setAnnouncement(msg);
    announceTimer.current = setTimeout(() => setAnnouncement(""), 1000);
  }, []);

  // Stable greeting — pick once per mount, don't flicker on re-render.
  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], []);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  // Pick one suggestion per category, route first to guarantee map aha moment.
  // The "other" pick is time-aware: study spaces in evening, events on weekdays.
  const randomSuggestions = useMemo(() => {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const hour = new Date().getHours();
    const otherPool = SUGGESTION_BUCKETS.other;
    // Bias toward contextually relevant "other" suggestions
    let otherPick: string;
    if (hour >= 18 || hour < 6) {
      // Evening/night: study spaces and room availability
      const evening = otherPool.filter((s) => /study|room|free/i.test(s));
      otherPick = evening.length > 0 ? pick(evening) : pick(otherPool);
    } else if (hour >= 6 && hour < 12) {
      // Morning: events and calendar
      const morning = otherPool.filter((s) => /event|registration|drop|date/i.test(s));
      otherPick = morning.length > 0 ? pick(morning) : pick(otherPool);
    } else {
      otherPick = pick(otherPool);
    }
    return [
      pick(SUGGESTION_BUCKETS.routes),
      pick(SUGGESTION_BUCKETS.courses),
      pick(SUGGESTION_BUCKETS.money),
      otherPick,
    ];
  }, []);

  const inputRef = useRef<ChatInputHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingRetry = useRef<{ conversation: ChatMessage[] } | null>(null);

  // Cleanup: abort in-flight requests and cancel pending frames on unmount.
  const alive = useRef(true);
  const deltaFlushRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
      if (deltaFlushRef.current) cancelAnimationFrame(deltaFlushRef.current);
    };
  }, []);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sessionTitle = useMemo(() => {
    const summary = sessions.find((s) => s.session_id === sessionId);
    if (summary) return summary.title;
    const firstUser = messages.find((m) => m.role === "user");
    return firstUser ? firstUser.content : "New conversation";
  }, [sessions, sessionId, messages]);

  // Fresh session context: clear any route from a previous session, load history.
  // historyNonce re-runs the load for the failed-state "Try again" button.
  useEffect(() => {
    void historyNonce;
    setHighlight(null);
    pendingRetry.current = null;
    setSendError(null);
    // New chat (no session ID yet) — start empty, skip fetch
    if (!sessionId) {
      setMessages([]);
      setHistoryState("ready");
      return;
    }
    // Session was minted locally during send — messages are already in state
    if (mintedLocally.current) {
      setHistoryState("ready");
      return;
    }
    let cancelled = false;
    setHistoryState("loading");
    api
      .getSession(sessionId)
      .then((history) => {
        if (cancelled) return;
        setMessages(
          history.map((m) => ({
            id: nextId(),
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls,
            interstitial: m.interstitial,
          })),
        );
        // Put this conversation's last map state back on the map.
        const lastWithCalls = [...history].reverse().find((m) => m.toolCalls?.length);
        if (lastWithCalls?.toolCalls) setHighlight(mergeMapHighlights(lastWithCalls.toolCalls));
        setHistoryState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          // Not found = a brand-new session id; start empty.
          setMessages([]);
          setHistoryState("ready");
        } else {
          setHistoryState("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, sessionId, setHighlight, historyNonce]);

  // Stick-to-bottom: auto-scroll when new content arrives IF user is near the bottom.
  const isNearBottom = useRef(true);

  // Track scroll position to know if user scrolled away from bottom.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => {
      const threshold = 80; // px from bottom
      isNearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  // When user sends a message, pin to bottom for the duration of the response.
  const wasSendingRef = useRef(false);
  useEffect(() => {
    if (sending && !wasSendingRef.current) {
      isNearBottom.current = true;
    }
    wasSendingRef.current = sending;
  }, [sending]);

  // Scroll to bottom when messages change (new message, streaming content, interstitials, sending state).
  const messageCount = messages.length;
  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : "";
  const lastInterstitialCount = messages.length > 0 ? (messages[messages.length - 1].interstitial?.length ?? 0) : 0;
  useEffect(() => {
    void messageCount;
    void sending;
    void lastMessageContent;
    void lastInterstitialCount;
    const node = scrollRef.current;
    if (!node || !isNearBottom.current) return;
    const behavior = sending || prefersReducedMotion ? "instant" : "smooth";
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, [messageCount, sending, lastMessageContent, lastInterstitialCount, prefersReducedMotion]);

  // Focus the input when the conversation is ready and after each response.
  useEffect(() => {
    if (historyState === "ready" && !sending) inputRef.current?.focus();
  }, [historyState, sending]);

  // Honest expectations: flag responses that pass 5s.
  useEffect(() => {
    if (!sending) {
      setSlowResponse(false);
      return;
    }
    const timer = setTimeout(() => setSlowResponse(true), 5000);
    return () => clearTimeout(timer);
  }, [sending]);

  const runExchange = useCallback(
    (conversation: ChatMessage[], overrideSessionId?: string) => {
      const activeId = overrideSessionId || sessionId;
      setSending(true);
      setSendError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // Add a placeholder assistant message for streaming text
      const streamId = nextId();
      setMessages((current) => [...current, { id: streamId, role: "assistant", content: "", interstitial: [] }]);

      let streamedText = "";
      const interstitialBlocks: InterstitialBlock[] = [];

      const updateMessage = (updates: Partial<DisplayMessage>) => {
        setMessages((current) => current.map((m) => (m.id === streamId ? { ...m, ...updates } : m)));
      };

      api
        .chat(
          activeId,
          conversation,
          {
            onThinking(delta) {
              if (!alive.current) return;
              // Append to the last thinking block only if it's immediately preceding (no tool calls in between)
              const last = interstitialBlocks[interstitialBlocks.length - 1];
              if (last?.type === "thinking") {
                last.content += delta;
              } else {
                interstitialBlocks.push({ type: "thinking", content: delta });
              }
              updateMessage({ interstitial: [...interstitialBlocks] });
            },
            onToolStart(name, input) {
              if (!alive.current) return;
              interstitialBlocks.push({ type: "tool_call", content: name, input, result: undefined });
              updateMessage({ interstitial: [...interstitialBlocks] });
            },
            onToolEnd(name, result) {
              if (!alive.current) return;
              // Find the last tool_call block with this name that has no result
              for (let i = interstitialBlocks.length - 1; i >= 0; i--) {
                if (
                  interstitialBlocks[i].type === "tool_call" &&
                  interstitialBlocks[i].content === name &&
                  interstitialBlocks[i].result === undefined
                ) {
                  interstitialBlocks[i] = { ...interstitialBlocks[i], result };
                  break;
                }
              }
              updateMessage({ interstitial: [...interstitialBlocks] });
            },
            onTextClear() {
              if (!alive.current) return;
              streamedText = "";
              updateMessage({ content: "" });
            },
            onDelta(delta) {
              if (!alive.current) return;
              streamedText += delta;
              // Batch text deltas: flush to state once per animation frame
              if (!deltaFlushRef.current) {
                deltaFlushRef.current = requestAnimationFrame(() => {
                  deltaFlushRef.current = null;
                  if (alive.current) updateMessage({ content: streamedText });
                });
              }
            },
          },
          controller.signal,
        )
        .then((response) => {
          if (!alive.current) return;
          pendingRetry.current = null;
          // Replace placeholder with final message including tool calls and warning
          updateMessage({
            content: response.message,
            toolCalls: response.tool_calls,
            warning: response.warning,
            followUps: response.follow_ups,
            interstitial: interstitialBlocks.length > 0 ? [...interstitialBlocks] : undefined,
          });
          // One merged highlight per response (route > places > all buildings);
          // null clears a stale highlight when the answer has no map content.
          setHighlight(mergeMapHighlights(response.tool_calls));
          announce("New response from assistant");
          refreshSessions();
        })
        .catch((error: unknown) => {
          if (!alive.current) return;
          // Abort is not an error — mark the partial message as stopped so the user
          // knows the response was intentionally cut short.
          if (error instanceof DOMException && error.name === "AbortError") {
            if (streamedText) {
              updateMessage({ content: streamedText, stopped: true });
            } else {
              // No content streamed — remove the empty placeholder
              setMessages((current) => current.filter((m) => m.id !== streamId));
            }
            return;
          }
          pendingRetry.current = { conversation };
          // Remove the empty placeholder on error — the error banner communicates the failure
          if (!streamedText && !interstitialBlocks.length) {
            setMessages((current) => current.filter((m) => m.id !== streamId));
          } else {
            // Partial content exists — mark it as failed
            updateMessage({ content: streamedText, stopped: true });
          }
          const message =
            error instanceof ApiError && error.status !== 500
              ? error.message
              : "Couldn't get a response. Please try again.";
          setSendError(message);
          announce(`Error: ${message}`);
        })
        .finally(() => {
          if (alive.current) {
            setSending(false);
            abortRef.current = null;
          }
        });
    },
    [api, sessionId, setHighlight, refreshSessions, announce],
  );

  const send = useCallback(
    (text: string) => {
      if (sending) return;
      if (abortRef.current) return;
      // Mint session ID on first message if this is a new chat
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = uuid();
        setSessionId(activeSessionId);
        // Update URL without triggering a navigation/remount
        window.history.replaceState(null, "", `/chat/${activeSessionId}`);
      }
      const userMessage: DisplayMessage = { id: nextId(), role: "user", content: text };
      const conversation = toConversation([...messagesRef.current, userMessage]);
      setMessages((current) => [...current, userMessage]);
      if (messagesRef.current.length === 0) {
        addOptimisticSession(activeSessionId, text.slice(0, 80) || "New chat");
      }
      announce("Message sent");
      runExchange(conversation, activeSessionId);
    },
    [sending, runExchange, announce, addOptimisticSession, sessionId],
  );

  const retry = useCallback(() => {
    const pending = pendingRetry.current;
    if (!pending) return;
    // Remove any stopped/empty assistant message left from the failed attempt
    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role === "assistant" && last.stopped) return current.slice(0, -1);
      return current;
    });
    runExchange(pending.conversation);
  }, [runExchange]);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const latestAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  return (
    <section aria-label="Conversation" className="neu-panel flex min-h-0 w-full flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between bg-transparent px-4 py-3">
        <h1 className="text-on-surface min-w-0 truncate text-base font-medium tracking-[-0.01em]">{sessionTitle}</h1>
      </div>

      <div
        ref={scrollRef}
        aria-busy={historyState === "loading" || sending}
        className="chat-message-well min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6"
      >
        {historyState === "loading" && (
          <div
            role="status"
            aria-label="Loading conversation"
            className="flex h-full flex-col items-center justify-center gap-6"
          >
            <div className="neu-inset bg-surface-container h-12 w-3/5 animate-pulse self-end rounded-[16px_16px_5px_16px]" />
            <div className="neu-inset bg-surface-container h-20 w-4/5 animate-pulse rounded-[16px_16px_16px_5px]" />
          </div>
        )}

        {historyState === "failed" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
            <span className="bg-surface text-error flex size-16 items-center justify-center rounded-2xl">
              <Icon name="alert" size={30} />
            </span>
            <div>
              <p className="text-on-surface text-xl font-medium">Couldn&apos;t load this conversation</p>
              <p className="text-on-surface-variant mt-1 text-sm">Try again, or start with a fresh chat.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setHistoryNonce((n) => n + 1)}
                className="neu-button bg-surface text-on-surface flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium"
              >
                <Icon name="refresh2" size={16} />
                Try again
              </button>
              <button
                type="button"
                onClick={() => router.push("/chat")}
                className="neu-primary-button bg-primary text-on-primary flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium"
              >
                Start new chat
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {historyState === "ready" && messages.length === 0 && !sending && (
            <motion.div
              key="empty-state"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-full flex-col items-center justify-center px-3 text-center sm:px-6"
            >
              <span className="bg-surface text-primary flex size-16 items-center justify-center rounded-2xl">
                <Icon name="school" size={30} />
              </span>
              <h2 className="text-on-surface mt-6 text-xl font-medium tracking-[-0.025em]">{greeting}</h2>
              <p className="text-on-surface-variant mt-2 max-w-80 text-sm leading-relaxed">
                Courses, tuition, walking routes, study spaces, grades, events, parking — all from real UBC data.
              </p>
              <nav aria-label="Suggested questions" className="mt-6 flex max-w-xl flex-wrap justify-center gap-3">
                {randomSuggestions.map((suggestion, i) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    disabled={sending}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className="animate-message-in border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[44px] rounded-2xl border px-4 py-3 text-center text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {historyState === "ready" && messages.length > 0 && (
          <div role="log" aria-label="Conversation" className="flex min-w-0 flex-col gap-6">
            {messages.map((message, idx) =>
              message.role === "user" ? (
                <UserMessage key={message.id} message={message} />
              ) : message.content || message.toolCalls || (message.interstitial && message.interstitial.length > 0) ? (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  isLatest={message.id === latestAssistantId}
                  showAvatar={idx === 0 || messages[idx - 1].role !== "assistant"}
                />
              ) : null,
            )}
            <AnimatePresence>
              {sending &&
                (!messages.length ||
                  messages[messages.length - 1]?.role !== "assistant" ||
                  (!messages[messages.length - 1]?.content &&
                    !messages[messages.length - 1]?.interstitial?.length)) && (
                  <motion.div
                    key="typing-indicator"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  >
                    <TypingIndicator slow={slowResponse} isFirstMessage={messages.length <= 1} />
                  </motion.div>
                )}
            </AnimatePresence>
            {!sending && !sendError && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
              <FollowUpChips onSend={send} followUps={messages[messages.length - 1].followUps} />
            )}
            {sendError && (
              <div
                role="alert"
                className="animate-message-in border-error/30 bg-error-container/40 flex flex-col items-start justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center"
              >
                <p id="send-error-msg" className="text-on-surface flex min-w-0 items-center gap-2 text-sm break-words">
                  <Icon name="alert" size={16} className="text-error shrink-0" />
                  {sendError}
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    disabled={sending}
                    aria-describedby="send-error-msg"
                    className="neu-button bg-surface text-on-surface flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium disabled:pointer-events-none disabled:opacity-60"
                  >
                    <Icon name="refresh2" size={14} />
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendError(null)}
                    aria-label="Dismiss error"
                    className="text-on-surface-variant hover:text-on-surface flex size-9 items-center justify-center rounded-xl transition-colors"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>

      <ComposerBoundary key={sessionId}>
        <ChatInput
          ref={inputRef}
          disabled={sending || historyState !== "ready"}
          thinking={sending}
          showDisclaimer={messages.length > 0}
          tip={tip}
          onSend={send}
          onStop={sending ? stopGenerating : undefined}
        />
      </ComposerBoundary>
    </section>
  );
}
