"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { BrandHeader, SessionSidebar } from "@/src/components/shell/session-sidebar";
import { SidebarListItem, SidebarListNav } from "@/src/components/shell/sidebar-list";
import { ToolList } from "@/src/components/shell/tool-list";
import { UserMenu } from "@/src/components/shell/user-menu";
import { Button } from "@/src/components/ui/button";
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
    <SidebarListNav label="Community" collapsed={collapsed}>
      {UNITY_ITEMS.map((item, i) => {
        const active = pathname === item.path || (item.path !== "/pulse" && pathname.startsWith(`${item.path}/`));
        return (
          <SidebarListItem key={item.path} index={i}>
            <button
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => router.push(item.path)}
              className={`focus-visible:ring-primary/40 flex h-11 items-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 ${
                collapsed ? "w-11 justify-center sm:w-9" : "w-full gap-2.5 px-3"
              } ${
                active
                  ? "neu-inset bg-surface-container text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <Icon name={item.icon} size={16} className="shrink-0" />
              <span
                className={`text-sm font-medium whitespace-nowrap transition-opacity duration-300 ${
                  collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                }`}
              >
                {item.label}
              </span>
            </button>
          </SidebarListItem>
        );
      })}
    </SidebarListNav>
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
    <Button
      id="desktop-session-collapse"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : `Collapse ${label.toLowerCase()}`}
      title={collapsed ? "Expand sidebar" : `Collapse ${label.toLowerCase()}`}
      variant="ghost"
      size="icon"
    >
      <span
        className="inline-flex transition-transform duration-300 ease-[var(--neu-ease)]"
        style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        <Icon name="left" size={18} />
      </span>
    </Button>
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
  const footer = (
    <div className="flex flex-col gap-2">
      <ModeToggle collapsed={collapsed} />
      <UserMenu collapsed={collapsed} />
    </div>
  );

  if (mode === "ai") {
    if (collapsed) {
      return (
        <div className="neu-panel flex h-full w-full flex-col items-center overflow-hidden rounded-2xl pt-0 pb-2">
          <BrandHeader collapsed />
          <div className="flex min-h-0 flex-1 flex-col items-center justify-between">
            <CollapseExpandButton collapsed onExpand={onExpand} label="Sessions" />
            {footer}
          </div>
        </div>
      );
    }
    return <SessionSidebar onCollapse={onCollapse} onClose={onClose} footer={footer} />;
  }

  const label = mode === "tools" ? "Tools" : "Unity";

  return (
    <div
      className={`neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl pt-0 pb-2 ${collapsed ? "items-center px-0" : "px-2"}`}
    >
      <BrandHeader
        collapsed={collapsed}
        trailing={
          !collapsed ? (
            <>
              <CollapseExpandButton collapsed={false} onCollapse={onCollapse} label={label} />
              {onClose && (
                <Button onClick={onClose} aria-label={`Close ${label.toLowerCase()}`} variant="ghost" size="icon">
                  <Icon name="close" size={18} />
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {collapsed && <CollapseExpandButton collapsed onExpand={onExpand} label="Sidebar" />}
      {mode === "tools" ? <ToolList collapsed={collapsed} /> : <UnitySidebar collapsed={collapsed} />}
      {footer}
    </div>
  );
}
