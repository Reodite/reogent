"use client";

// Tactile message surfaces: user messages stay literal, while assistant
// responses render safe GitHub-flavored Markdown without allowing raw HTML.
// Interstitial blocks (thinking + tool calls) render inline before the final text.
import { ToolCallsView } from "@/src/components/chat/tool-renderers";
import { Icon } from "@/src/components/icons";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import type { ToolCall } from "@/src/lib/api-types";
import type { InterstitialBlock } from "@/src/shared/types";
import { motion, useReducedMotion } from "motion/react";
import { lazy, memo, Suspense, useState } from "react";

export type { InterstitialBlock };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  warning?: string;
  /** True when generation was stopped or errored with partial content. */
  stopped?: boolean;
  /** Interstitial blocks shown before the final answer (thinking + tool calls). */
  interstitial?: InterstitialBlock[];
  /** LLM-generated follow-up question suggestions. */
  followUps?: string[];
}

// Lazy-load the markdown pipeline (~80-120 KB) — only fetched once the first
// assistant message renders, not on initial page load.
const LazyMarkdown = lazy(() =>
  import("react-markdown").then((mod) => {
    // Co-import remark-gfm so both land in the same async chunk.
    return import("remark-gfm").then((gfm) => ({
      default: function MarkdownWithGfm({ content }: { content: string }) {
        const Markdown = mod.default;
        return (
          <Markdown remarkPlugins={[gfm.default]} components={markdownComponents} skipHtml>
            {content}
          </Markdown>
        );
      },
    }));
  }),
);

const markdownComponents = {
  a: ({ href, title, children }: { href?: string; title?: string; children?: React.ReactNode }) => {
    const opensNewTab = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        title={title}
        target={opensNewTab ? "_blank" : undefined}
        rel={opensNewTab ? "noreferrer" : undefined}
      >
        {children}
        {opensNewTab && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  },
  img: ({ alt }: { alt?: string }) => (
    <span className="markdown-image-alt">{alt ? `[Image: ${alt}]` : "[Image omitted]"}</span>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="markdown-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

function AssistantMarkdown({ content }: { content: string }) {
  const raw = <p className="break-words whitespace-pre-wrap">{content}</p>;
  return (
    <div className="assistant-markdown">
      <ErrorBoundary fallback={raw}>
        <Suspense fallback={raw}>
          <LazyMarkdown content={content} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

const messageSpring = { type: "spring" as const, stiffness: 400, damping: 25 };

export const UserMessage = memo(function UserMessage({ message }: { message: DisplayMessage }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="flex justify-end"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : messageSpring}
    >
      <div className="bg-accent-subtle text-on-surface max-w-[85%] min-w-0 rounded-[16px_16px_5px_16px] px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {message.content}
      </div>
    </motion.div>
  );
});

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group bg-surface-container-low mb-2 rounded-lg"
    >
      <summary className="text-muted flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium select-none">
        <Icon name="bling" size={14} className="text-muted shrink-0" />
        <span className="truncate">Thinking…</span>
        <Icon name="down" size={12} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {open && content && (
        <div className="border-border-subtle border-t px-3 py-2">
          <p className="text-muted max-h-40 overflow-auto text-xs leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      )}
    </details>
  );
}

/** Humanize a tool call into a short readable label. */
function humanizeToolCall(name: string, input?: Record<string, unknown>): string {
  const q = input?.query as string | undefined;
  const slug = (key: string) => (input?.[key] as string | undefined) ?? "";
  switch (name) {
    case "search_courses":
      return q ? `Searched courses for "${q}"` : "Searched courses";
    case "get_course":
      return `Looking up ${slug("course_code") || "course"}`;
    case "get_tuition":
      return `Checking tuition for ${slug("program_slug") || "program"}`;
    case "walking_distance":
      return `Calculating walk from ${slug("from_building")} to ${slug("to_building")}`;
    case "find_building":
      return `Finding building ${slug("query") || slug("code") || ""}`.trim();
    case "search_programs":
      return q ? `Searched programs for "${q}"` : "Searched programs";
    case "get_admission_requirements":
      return `Checking admission requirements`;
    case "get_key_dates":
      return "Looking up key dates";
    case "get_cost_estimate":
      return `Estimating costs for ${slug("program_slug") || "program"}`;
    case "get_living_costs":
      return "Looking up living costs";
    case "search_student_fees":
      return q ? `Searched fees for "${q}"` : "Searched student fees";
    case "search_events":
      return q ? `Searched events for "${q}"` : "Searched events";
    case "search_ubc_pages":
      return q ? `Searched UBC pages for "${q}"` : "Searched UBC pages";
    case "find_parking":
      return "Finding parking";
    case "find_places":
      return q ? `Searched places for "${q}"` : "Searched places";
    case "search_study_spaces":
      return "Searching study spaces";
    case "find_free_rooms":
      return "Finding free rooms";
    case "get_room_schedule":
      return `Checking room schedule`;
    case "get_grades":
      return `Looking up grades for ${slug("course_code") || "course"}`;
    case "search_grades":
      return q ? `Searched grade data for "${q}"` : "Searched grade data";
    default:
      return name.replace(/_/g, " ");
  }
}

function ToolCallBlock({ name, input, result }: { name: string; input?: Record<string, unknown>; result?: unknown }) {
  const [open, setOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const isLoading = result === undefined;
  const label = humanizeToolCall(name, input);

  const MAX_JSON_DISPLAY = 10_000;
  let jsonStr = "";
  let truncated = false;
  if (open && result !== undefined) {
    jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > MAX_JSON_DISPLAY && !showFull) {
      truncated = true;
      jsonStr = jsonStr.slice(0, MAX_JSON_DISPLAY);
    }
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group bg-surface-container-low mb-2 rounded-lg"
    >
      <summary className="text-on-surface-variant flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium select-none">
        <Icon name="search" size={14} className="text-primary shrink-0" />
        <span className="truncate">{label}</span>
        {isLoading && (
          <span
            role="status"
            aria-label="Loading"
            className="border-primary ml-auto size-3 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
          />
        )}
        {!isLoading && (
          <Icon name="down" size={12} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
        )}
      </summary>
      {open && result !== undefined && (
        <div className="border-border-subtle border-t px-3 py-2">
          <pre className="text-muted max-h-40 overflow-auto text-xs">{jsonStr}</pre>
          {truncated && (
            <button type="button" onClick={() => setShowFull(true)} className="text-primary mt-1 text-xs font-medium">
              Show full result
            </button>
          )}
        </div>
      )}
    </details>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  showAvatar = true,
}: {
  message: DisplayMessage;
  showAvatar?: boolean;
}) {
  const reduce = useReducedMotion();
  const tools = message.toolCalls ?? [];
  const interstitial = message.interstitial ?? [];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : messageSpring}
    >
      {showAvatar && (
        <div className="mb-2 flex items-center gap-2">
          <span className="bg-primary-container text-on-primary-container flex size-7 items-center justify-center rounded-lg text-[0.6875rem] font-medium">
            R
          </span>
          <span className="text-muted text-xs font-medium">Reodite</span>
        </div>
      )}
      <div className="bg-surface max-w-[88%] min-w-0 rounded-[16px_16px_16px_5px] px-4 py-3">
        {message.warning && (
          <div className="bg-tertiary-container text-body-sm text-on-tertiary-container mb-3 flex items-start gap-2 rounded-xl px-3 py-2">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>{message.warning}</span>
          </div>
        )}
        {interstitial.length > 0 && (
          <div className="mb-3">
            {interstitial.map((block, idx) =>
              block.type === "thinking" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                <ThinkingBlock key={`t-${idx}`} content={block.content} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                <ToolCallBlock key={`tc-${idx}`} name={block.content} input={block.input} result={block.result} />
              ),
            )}
          </div>
        )}
        {message.content && <AssistantMarkdown content={message.content} />}
        {message.stopped && (
          <p className="text-muted mt-2 flex items-center gap-1.5 text-xs">
            <Icon name="stop" size={12} className="shrink-0" />
            Response stopped
          </p>
        )}
        {!interstitial.length && <ToolCallsView calls={tools} />}
      </div>
    </motion.div>
  );
});

const THINKING_LABELS = ["Thinking", "Looking that up", "Searching", "On it", "Checking"];
const FIRST_MESSAGE_LABELS = ["Planning my approach", "Figuring out what to look up", "Getting started"];
const SLOW_LABELS = [
  "Still digging — almost there",
  "Cross-referencing sources",
  "Pulling data together",
  "Hang tight, this one takes a moment",
];

export function TypingIndicator({ slow, isFirstMessage }: { slow: boolean; isFirstMessage?: boolean }) {
  const pool = slow ? SLOW_LABELS : isFirstMessage ? FIRST_MESSAGE_LABELS : THINKING_LABELS;
  const interval = slow ? 4000 : 3000;
  const label = pool[Math.floor(Date.now() / interval) % pool.length];
  return (
    <div role="status" aria-label="The assistant is thinking">
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-primary-container text-on-primary-container flex size-7 items-center justify-center rounded-lg text-[0.6875rem] font-medium">
          R
        </span>
        <span className="text-muted text-xs font-medium">Reodite</span>
      </div>
      <div className="bg-surface inline-flex items-center gap-3 rounded-[16px_16px_16px_5px] px-4 py-3">
        <span className="thinking-orb" aria-hidden="true" />
        <span className="text-on-surface text-sm font-medium">{label}</span>
      </div>
      {slow && <p className="text-muted mt-2 text-xs">Working across data sources — this can take up to 30 seconds.</p>}
    </div>
  );
}
