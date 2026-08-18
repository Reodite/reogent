"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { SessionSidebar, VersionBadge } from "@/src/components/shell/session-sidebar";
import { ToolList } from "@/src/components/shell/tool-list";

/**
 * The persistent Left Sidebar. Contents swap by mode (Requirement 1.4): AI Mode
 * shows the SessionList (reusing `SessionSidebar`'s body); Tools Mode shows the
 * ToolList. The ModeToggle pins to the footer in both modes (Requirement 1.7).
 * `onCollapse` (desktop rail) and `onClose` (below-wide drawer) thread through to
 * whichever panel is active.
 */
export function LeftSidebar({ onCollapse, onClose }: { onCollapse?: () => void; onClose?: () => void }) {
  const { mode } = useChatShell();
  const footer = <ModeToggle />;
  if (mode === "ai") {
    return <SessionSidebar onCollapse={onCollapse} onClose={onClose} footer={footer} />;
  }
  return (
    <div className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl p-2">
      <div className="flex items-center gap-3 px-2 pt-1 pb-2">
        {onCollapse && (
          <button
            id="desktop-session-collapse"
            type="button"
            onClick={onCollapse}
            aria-label="Collapse tool list"
            title="Collapse tools"
            className="neu-panel text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150"
          >
            <Icon name="left" size={18} />
          </button>
        )}
        <span className="text-on-surface min-w-0 flex-1 text-base leading-tight font-medium tracking-[-0.02em]">
          Tools
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tools"
            className="text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <ToolList />
      <VersionBadge />
      {footer}
    </div>
  );
}
