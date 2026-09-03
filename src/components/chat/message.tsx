"use client";

// Tactile message surfaces: user messages stay literal, while assistant
// responses render safe GitHub-flavored Markdown without allowing raw HTML.
// Interstitial blocks (thinking + tool calls) render inline before the final text.
import { injectChips } from "@/src/components/chat/citations/chip-injector";
import { SourcesPanel } from "@/src/components/chat/citations/sources-panel";
import { ResponseWidget } from "@/src/components/chat/tool-renderers";
import { Icon } from "@/src/components/icons";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import type { Citation } from "@/src/lib/api-types";
import type { ActivityBlock } from "@/src/shared/types";
import { motion, useReducedMotion } from "motion/react";
import { createElement, lazy, memo, Suspense, useMemo, useState } from "react";

export type { ActivityBlock };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  warning?: string;
  /** True when generation was stopped or errored with partial content. */
  stopped?: boolean;
  /** Ordered thinking + tool-call blocks for this assistant turn. */
  activity?: ActivityBlock[];
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
  // Renders the real tag with citation chips injected into its string leaves.
  // Returning bare `inject(children)` would drop the wrapping element — for
  // table cells that yields a text node directly under <tr>, an invalid-HTML
  // hydration error. `style` carries GFM column alignment on th/td.
  const leaf =
    (tag: string) =>
    ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
      createElement(tag, style ? { style } : {}, inject(children));
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
    p: leaf("p"),
    li: leaf("li"),
    strong: leaf("strong"),
    em: leaf("em"),
    th: leaf("th"),
    td: leaf("td"),
    h1: leaf("h1"),
    h2: leaf("h2"),
    h3: leaf("h3"),
    h4: leaf("h4"),
    h5: leaf("h5"),
    h6: leaf("h6"),
    blockquote: leaf("blockquote"),
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

// ---- Ask-AI attachments ----
//
// A pane's Ask AI action can attach data (the degree plan, a prereq tree, the
// calendar). The agent just sees appended text, so the attachment lives INSIDE
// the message content wrapped in an <attachment> tag — one string end to end,
// no schema or server changes, and history reloads reproduce the same bubbles.
// The UI splits the content back apart: prompt as the speech bubble, the
// attachment as a file chip below it.

const ATTACHMENT_RE = /\n*<attachment title="([^"\n]*)">\n([\s\S]*)\n<\/attachment>\s*$/;

/** Prompt + wrapped attachment → the single content string sent to the agent. */
export function buildUserContent(text: string, attachment?: { title: string; content: string }): string {
  if (!attachment) return text;
  const title = attachment.title.replace(/["\n]/g, "'");
  return `${text}\n\n<attachment title="${title}">\n${attachment.content}\n</attachment>`;
}

/** Inverse of {@link buildUserContent} for display: the spoken prompt and the
 *  attachment's title (null when the message has no attachment). */
export function splitUserContent(content: string): { text: string; attachmentTitle: string | null } {
  const m = content.match(ATTACHMENT_RE);
  if (!m || m.index === undefined) return { text: content, attachmentTitle: null };
  return { text: content.slice(0, m.index).trimEnd(), attachmentTitle: m[1] };
}

export const UserMessage = memo(function UserMessage({ message }: { message: DisplayMessage }) {
  const reduce = useReducedMotion();
  const { text, attachmentTitle } = splitUserContent(message.content);
  return (
    <motion.div
      className="flex flex-col items-end gap-1.5"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : messageSpring}
    >
      <div className="bg-accent-subtle text-on-surface max-w-[85%] min-w-0 rounded-[16px_16px_5px_16px] px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </div>
      {attachmentTitle && (
        <div className="border-border bg-surface flex max-w-[85%] items-center gap-2.5 rounded-[16px_5px_16px_16px] border px-3 py-2">
          <span className="bg-accent-subtle text-primary grid size-8 shrink-0 place-items-center rounded-lg">
            <Icon name="file" size={16} />
          </span>
          <span className="text-on-surface min-w-0 truncate text-sm font-medium">{attachmentTitle}</span>
        </div>
      )}
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
      <summary className="focus-visible:ring-primary/40 text-muted flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium select-none focus-visible:ring-2 focus-visible:ring-offset-1">
        <Icon name="bling" size={14} className="text-muted shrink-0" />
        <span className="truncate">Thinking…</span>
        <Icon name="down" size={12} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {open && content && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="border-border-subtle overflow-hidden border-t"
        >
          <p className="text-muted max-h-40 overflow-auto px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </motion.div>
      )}
    </details>
  );
}

/** Consecutive thinking blocks merge into one; tool calls interleave in order.
 *  Shared with chat-panel.tsx, which needs the same block indexing to key tool
 *  call chips (`${message.id}:tc-${condensedIdx}`) for highlight identity. */
export function condenseActivity(activity: ActivityBlock[]): ActivityBlock[] {
  const out: ActivityBlock[] = [];
  for (const block of activity) {
    const last = out[out.length - 1];
    if (block.type === "thinking" && last?.type === "thinking") {
      last.content = `${last.content}\n\n${block.content}`;
    } else {
      out.push({ ...block });
    }
  }
  return out;
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  showAvatar = true,
}: {
  message: DisplayMessage;
  showAvatar?: boolean;
}) {
  const reduce = useReducedMotion();
  const activity = message.activity ?? [];
  const condensed = useMemo(() => condenseActivity(activity), [activity]);
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
        {condensed.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {condensed.map((block, idx) => {
              if (block.type === "thinking") {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                  <ThinkingBlock key={`t-${idx}`} content={block.content} compact />
                );
              }
              const call = { name: block.content, input: block.input ?? {}, result: block.result };
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                <ResponseWidget key={`tc-${idx}`} call={call} callKey={`${message.id}:tc-${idx}`} />
              );
            })}
          </div>
        )}
        {message.content && <AssistantMarkdown content={message.content} citations={message.citations} />}
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
