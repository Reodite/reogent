"use client";

// The recessed chat composer. Enter sends; Shift+Enter adds a line;
// Cmd/Ctrl+Enter always sends. Submit locks while a request is in flight.
import { ChatComposerFrame } from "@/src/components/chat/chat-frame";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";

const PLACEHOLDER = "Ask about courses, routes, tuition...";
// Unsent composer text survives tab swaps and reloads; cleared on send.
// one global draft, not per-conversation — split the key by session
// id if per-chat drafts ever matter.
const DRAFT_KEY = "reodite.chat-draft";

export interface ChatInputHandle {
  focus: () => void;
}

interface ChatInputProps {
  disabled: boolean;
  thinking: boolean;
  showDisclaimer: boolean;
  tip?: string;
  onSend: (text: string) => void;
  onStop?: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { disabled, thinking, showDisclaimer, tip, onSend, onStop },
  ref,
) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  const autosize = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 96)}px`;
  }, []);

  // Restore the draft after mount (effect, not initializer, so SSR markup
  // matches); saves skip the mount commit so the pre-restore "" doesn't wipe it.
  useEffect(() => {
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY);
      if (draft) {
        setValue(draft);
        requestAnimationFrame(autosize);
      }
    } catch {
      // Storage unavailable — start empty.
    }
  }, [autosize]);
  const skipDraftSave = useRef(true);
  useEffect(() => {
    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }
    try {
      if (value) window.localStorage.setItem(DRAFT_KEY, value);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Storage unavailable — draft just won't persist.
    }
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    textareaRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(autosize);
    onSend(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (event.metaKey || event.ctrlKey || !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <ChatComposerFrame
      caption={showDisclaimer ? "AI can make mistakes. Verify important information." : tip ? `Tip: ${tip}` : null}
      trailing={
        value.length > 9000 ? (
          <span className="text-muted ml-auto text-xs tabular-nums">{value.length.toLocaleString()} / 10,000</span>
        ) : null
      }
    >
      <form
        data-thinking={thinking}
        aria-busy={thinking}
        className="chat-composer neu-inset bg-surface-container-low relative flex items-center rounded-2xl p-1.5 transition-[box-shadow] duration-150 sm:pr-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={10000}
          onChange={(event) => {
            setValue(event.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER}
          aria-label="Message the assistant"
          className="text-on-surface placeholder:text-muted relative z-10 block max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none disabled:opacity-60 sm:py-3 sm:leading-5"
        />
        {onStop ? (
          <Button
            onClick={onStop}
            aria-label="Stop generating"
            size="icon"
            shadowOn="surface-container-low"
            className="relative z-10 max-sm:rounded-[0.625rem] sm:rounded-md"
          >
            <span key="stop" aria-hidden="true" className="ui-content-enter inline-flex">
              <Icon name="stop" size={16} />
            </span>
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="icon"
            shadowOn="surface-container-low"
            disabled={!canSend}
            aria-label="Send message"
            className="relative z-10 max-sm:rounded-[0.625rem] sm:rounded-md"
          >
            <span key="send" aria-hidden="true" className="ui-content-enter inline-flex">
              <Icon name="arrowUp" size={18} />
            </span>
          </Button>
        )}
      </form>
    </ChatComposerFrame>
  );
});
