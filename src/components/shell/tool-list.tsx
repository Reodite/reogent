"use client";

import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { SidebarItemButton, SidebarListItem, SidebarListNav } from "@/src/components/shell/sidebar-list";
import { paneIdToSlug, parseToolPath } from "@/src/lib/pane-route";

export function ToolList({ collapsed = false, onSelect }: { collapsed?: boolean; onSelect?: () => void }) {
  const navigation = useShellNavigation();
  const activePane = parseToolPath(navigation.displayPathname)?.paneId;
  return (
    <SidebarListNav label="Tools" collapsed={collapsed} toolList>
      {PANE_REGISTRY.map((entry) => {
        const active = activePane === entry.id;
        const slug = paneIdToSlug(entry.id);
        return (
          <SidebarListItem key={entry.id}>
            <SidebarItemButton
              label={entry.label}
              icon={<entry.icon className="size-4 shrink-0" />}
              active={active}
              collapsed={collapsed}
              data-tool-id={entry.id}
              aria-pressed={active}
              disabled={!slug}
              onClick={() => {
                if (!slug) return;
                navigation.push(`/tools/${slug}`);
                onSelect?.();
              }}
            />
          </SidebarListItem>
        );
      })}
    </SidebarListNav>
  );
}
