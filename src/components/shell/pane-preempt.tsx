"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { PANE_BY_ID } from "@/src/components/shell/pane-registry";

/** "Back to <tool>" pill. Rendered inside the map pane header after the agent preempts a user tool. Reads the captured {@link PreviousUserChannel} from the shell context; one click restores it and clears the capture. */
export function PanePreempt() {
  const { previousUserChannel, setActiveChannel, setPreviousUserChannel } = useChatShell();
  if (!previousUserChannel) return null;
  const label = PANE_BY_ID[previousUserChannel.id]?.label ?? previousUserChannel.id;
  return (
    <button
      data-preempt-restore
      type="button"
      aria-label={`Back to ${label}`}
      title={`Back to ${label}`}
      onClick={() => {
        setActiveChannel(previousUserChannel.id, previousUserChannel.state);
        setPreviousUserChannel(null);
      }}
      className="border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 inline-flex min-h-[36px] min-w-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-95"
    >
      <Icon name="left" size={14} />
      Back to {label}
    </button>
  );
}
