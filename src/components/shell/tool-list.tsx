"use client";

import { PANE_REGISTRY } from "@/src/components/shell/pane-registry";
import { SidebarListItem, SidebarListNav } from "@/src/components/shell/sidebar-list";
import { paneIdToSlug, parseToolPath } from "@/src/lib/pane-route";
import { usePathname, useRouter } from "next/navigation";

export function ToolList({ collapsed = false, onSelect }: { collapsed?: boolean; onSelect?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const activePane = parseToolPath(pathname ?? "")?.paneId;
  return (
    <SidebarListNav label="Tools" collapsed={collapsed} toolList>
      {PANE_REGISTRY.map((entry, i) => {
        const active = activePane === entry.id;
        const slug = paneIdToSlug(entry.id);
        return (
          <SidebarListItem key={entry.id} index={i}>
            <button
              type="button"
              data-tool-id={entry.id}
              aria-pressed={active}
              aria-current={active ? "page" : undefined}
              disabled={!slug}
              onClick={() => {
                if (!slug) return;
                router.push(`/tools/${slug}`);
                onSelect?.();
              }}
              className={`focus-visible:ring-primary/40 flex h-11 items-center rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 ${
                collapsed ? "w-11 justify-center sm:w-9" : "w-full gap-2.5 px-3"
              } ${
                active
                  ? "neu-inset bg-surface-container text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <entry.icon className="size-4 shrink-0" />
              <span
                className={`text-sm font-medium whitespace-nowrap transition-opacity duration-300 ${
                  collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                }`}
              >
                {entry.label}
              </span>
            </button>
          </SidebarListItem>
        );
      })}
    </SidebarListNav>
  );
}
