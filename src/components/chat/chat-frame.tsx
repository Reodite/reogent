"use client";

import { useWorkspaceHost } from "@/src/components/shell/workspace-host";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

type ChatFrameProps = Omit<ComponentPropsWithoutRef<"section">, "className" | "style"> & {
  header: ReactNode;
  footer: ReactNode;
  scrollRef?: Ref<HTMLElement>;
  messagesBusy?: boolean;
};

/** Shares the conversation header, scroll well, and footer geometry across loaded and pending routes. */
export function ChatFrame({ header, footer, children, scrollRef, messagesBusy, ...props }: ChatFrameProps) {
  const { navigation } = useWorkspaceHost();
  return (
    <section
      data-chat-frame
      className="workspace-surface flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      {...props}
    >
      <header className="flex h-15 min-w-0 shrink-0 items-center gap-2 px-4">
        {navigation}
        <div className="flex min-w-0 flex-1 items-center justify-between">{header}</div>
      </header>
      <section
        ref={scrollRef}
        aria-label="Conversation messages"
        aria-busy={messagesBusy}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users scroll conversations without interactive messages.
        tabIndex={0}
        className="chat-message-well min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6"
      >
        {children}
      </section>
      {footer}
    </section>
  );
}

/** Keeps composer padding, safe-area space, and the caption row stable across input states. */
export function ChatComposerFrame({
  children,
  caption,
  trailing,
}: {
  children: ReactNode;
  caption?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      data-chat-composer-footer
      className="shrink-0 bg-transparent px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4"
    >
      {children}
      <div data-chat-composer-caption className="mt-2 flex min-h-4 items-center justify-between px-1">
        <p className="text-muted flex-1 text-center text-xs">{caption}</p>
        {trailing}
      </div>
    </div>
  );
}
