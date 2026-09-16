"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { BrandHeader, SessionSidebar } from "@/src/components/shell/session-sidebar";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { SidebarItemButton, SidebarListItem, SidebarListNav } from "@/src/components/shell/sidebar-list";
import { ToolList } from "@/src/components/shell/tool-list";
import { UserMenu } from "@/src/components/shell/user-menu";
import { Button } from "@/src/components/ui/button";

const UNITY_ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: "/pulse", label: "Pulse", icon: "group" },
  { path: "/pulse/schedule", label: "Schedule", icon: "calendar" },
  { path: "/pulse/creators", label: "Creators", icon: "teacup" },
];

function UnitySidebar({ collapsed = false, onSelect }: { collapsed?: boolean; onSelect?: () => void }) {
  const navigation = useShellNavigation();
  const pathname = navigation.displayPathname;

  return (
    <SidebarListNav label="Community" collapsed={collapsed}>
      {UNITY_ITEMS.map((item) => {
        const active = pathname === item.path || (item.path !== "/pulse" && pathname.startsWith(`${item.path}/`));
        return (
          <SidebarListItem key={item.path}>
            <SidebarItemButton
              label={item.label}
              icon={<Icon name={item.icon} size={16} className="shrink-0" />}
              active={active}
              collapsed={collapsed}
              onClick={() => {
                navigation.push(item.path);
                onSelect?.();
              }}
            />
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
    <div className={`flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>
      <ModeToggle collapsed={collapsed} onNavigate={onClose} />
      <UserMenu collapsed={collapsed} onNavigate={onClose} />
    </div>
  );

  if (mode === "ai") {
    if (collapsed) {
      return (
        <div
          data-sidebar-frame
          className="neu-panel flex h-full w-full flex-col items-center overflow-hidden rounded-2xl pt-0 pb-2"
        >
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
      data-sidebar-frame
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
      {mode === "tools" ? (
        <ToolList collapsed={collapsed} onSelect={onClose} />
      ) : (
        <UnitySidebar collapsed={collapsed} onSelect={onClose} />
      )}
      {footer}
    </div>
  );
}
