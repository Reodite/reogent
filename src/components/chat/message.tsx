"use client";

// Tactile message surfaces: user messages stay literal, while assistant
// responses render safe GitHub-flavored Markdown without allowing raw HTML.
// Interstitial blocks (thinking + tool calls) render inline before the final text.
import { injectChips } from "@/src/components/chat/citations/chip-injector";
import { SourcesPanel } from "@/src/components/chat/citations/sources-panel";
import { ResponseWidget } from "@/src/components/chat/tool-renderers";
import { Icon } from "@/src/components/icons";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import type { Citation, ToolCall } from "@/src/lib/api-types";
import type { InterstitialBlock } from "@/src/shared/types";
import { motion, useReducedMotion } from "motion/react";
import { lazy, memo, Suspense, useMemo, useState } from "react";

export type { InterstitialBlock };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  warning?: string;
  /** True when generation was stopped or errored with partial content. */
  stopped?: boolean;
  /** Interstitial blocks shown before the answer (thinking blocks only). */
  interstitial?: InterstitialBlock[];
  /** Widget tool calls whose renderers are the answer. */
  widgets?: ToolCall[];
  /** LLM-generated follow-up question suggestions. */
  followUps?: string[];
  /** Citations attributed to this assistant turn (used by CitationChip chips + SourcesPanel). */
  citations?: Citation[];
}

// Lazy-load the markdown pipeline (~80-120 KB) — only fetched once the first
// assistant message renders, not on initial page load.
const LazyMarkdown = lazy(() =>
  import("react-markdown").then((mod) => {
    // Co-import remark-gfm so both land in the same async chunk.
    return import("remark-gfm").then((gfm) => ({
      default: function MarkdownWithGfm({ content, citations }: { content: string; citations?: Citation[] }) {
        const Markdown = mod.default;
        const components = useMemo(() => markdownComponents(citations), [citations]);
        return (
          <Markdown remarkPlugins={[gfm.default]} components={components} skipHtml>
            {content}
          </Markdown>
        );
      },
    }));
  }),
);

const markdownComponents = (citations: Citation[] | null | undefined) => {
  const inject = (children: React.ReactNode) => injectChips(children, citations);
  const leafOverride = ({ children }: { children?: React.ReactNode }) => inject(children);
  return {
    a: ({ href, title, children }: { href?: string; title?: string; children?: React.ReactNode }) => {
      const opensNewTab = typeof href === "string" && /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          title={title}
          target={opensNewTab ? "_blank" : undefined}
          rel={opensNewTab ? "noreferrer" : undefined}
        >
          {inject(children)}
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
    p: leafOverride,
    li: leafOverride,
    strong: leafOverride,
    em: leafOverride,
    th: leafOverride,
    td: leafOverride,
    h1: leafOverride,
    h2: leafOverride,
    h3: leafOverride,
    h4: leafOverride,
    h5: leafOverride,
    h6: leafOverride,
    blockquote: leafOverride,
  };
};

function AssistantMarkdown({ content, citations }: { content: string; citations?: Citation[] }) {
  const raw = <p className="break-words whitespace-pre-wrap">{content}</p>;
  return (
    <div className="assistant-markdown">
      <ErrorBoundary fallback={raw}>
        <Suspense fallback={raw}>
          <LazyMarkdown content={content} citations={citations} />
        </Suspense>
      </ErrorBoundary>
      <SourcesPanel citations={citations} />
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

function ThinkingBlock({ content, compact = false }: { content: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={`group bg-surface-container-low rounded-lg ${compact ? "" : "mb-2"}`}
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

export const AssistantMessage = memo(function AssistantMessage({
  message,
  showAvatar = true,
}: {
  message: DisplayMessage;
  showAvatar?: boolean;
}) {
  const reduce = useReducedMotion();
  const interstitial = message.interstitial ?? [];
  // Widgets: new format uses `widgets`; legacy messages use `toolCalls` (all were shown).
  const widgets = message.widgets ?? message.toolCalls ?? [];
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
        {(interstitial.length > 0 || widgets.length > 0) && (
          <div className="mb-3 flex flex-col gap-2">
            {interstitial.map((block, idx) => {
              if (block.type === "thinking") {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                  <ThinkingBlock key={`t-${idx}`} content={block.content} compact />
                );
              }
              const call = { name: block.content, input: block.input ?? {}, result: block.result };
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                <ResponseWidget key={`tc-${idx}`} call={call} />
              );
            })}
            {widgets.map((call, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              <ResponseWidget key={`w-${idx}`} call={call} />
            ))}
          </div>
        )}
        {!widgets.length && message.content && (
          <AssistantMarkdown content={message.content} citations={message.citations} />
        )}
        {message.stopped && (
          <p className="text-muted mt-2 flex items-center gap-1.5 text-xs">
            <Icon name="stop" size={12} className="shrink-0" />
            Response stopped
          </p>
        )}
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
