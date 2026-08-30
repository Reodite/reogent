"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { SessionSidebar } from "@/src/components/shell/session-sidebar";
import { ToolList } from "@/src/components/shell/tool-list";
import { usePathname, useRouter } from "next/navigation";

const UNITY_ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: "/pulse", label: "Pulse", icon: "group" },
  { path: "/pulse/schedule", label: "Schedule", icon: "calendar" },
  { path: "/pulse/creators", label: "Creators", icon: "teacup" },
];

function UnitySidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav aria-label="Community" className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "px-0 py-2" : "p-2"}`}>
      <ul className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
        {UNITY_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <li key={item.path}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => router.push(item.path)}
                className={`focus-visible:ring-primary/40 flex h-9 items-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  collapsed ? "w-9 justify-center" : "w-full gap-2.5 px-3"
                } ${
                  active
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <Icon name={item.icon} size={16} className="shrink-0" />
                <span
                  className={`whitespace-nowrap text-sm font-medium transition-opacity duration-300 ${
                    collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CollapseExpandButton({
  collapsed,
  onCollapse,
  onExpand,
  label,
}: {
  collapsed: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  label: string;
}) {
  const toggle = collapsed ? onExpand : onCollapse;
  if (!toggle) return null;
  return (
    <button
      id="desktop-session-collapse"
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : `Collapse ${label.toLowerCase()}`}
      title={collapsed ? "Expand sidebar" : `Collapse ${label.toLowerCase()}`}
      className="focus-visible:ring-primary/40 neu-panel text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
    >
      <span
        className="inline-flex transition-transform duration-300 ease-[var(--neu-ease)]"
        style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        <Icon name="left" size={18} />
      </span>
    </button>
  );
}

export function LeftSidebar({
  collapsed = false,
  onCollapse,
  onExpand,
  onClose,
}: {
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const { mode } = useChatShell();
  const footer = <ModeToggle collapsed={collapsed} />;

  if (mode === "ai") {
    if (collapsed) {
      return (
        <div className="neu-panel flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-2xl pt-3 pb-2">
          <CollapseExpandButton collapsed onExpand={onExpand} label="Sessions" />
          {footer}
        </div>
      );
    }
    return <SessionSidebar onCollapse={onCollapse} onClose={onClose} footer={footer} />;
  }

  const label = mode === "tools" ? "Tools" : "Unity";

  return (
    <div className={`neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl pt-3 pb-2 ${collapsed ? "items-center px-0" : "px-2"}`}>
      <div className={`flex h-9 items-center pb-2 ${collapsed ? "justify-center px-0" : "gap-3 px-2"}`}>
        <CollapseExpandButton
          collapsed={collapsed}
          onCollapse={onCollapse}
          onExpand={onExpand}
          label={label}
        />
        <span
          className={`text-on-surface whitespace-nowrap text-base leading-tight font-medium tracking-[-0.02em] transition-opacity duration-300 ${
            collapsed ? "w-0 overflow-hidden opacity-0" : "flex-1 opacity-100"
          }`}
        >
          {label}
        </span>
        {!collapsed && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()}`}
            className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {mode === "tools" ? <ToolList collapsed={collapsed} /> : <UnitySidebar collapsed={collapsed} />}
      {footer}
    </div>
  );
}
