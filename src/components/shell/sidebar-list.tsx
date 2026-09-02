"use client";

import type { ReactNode } from "react";

/** Shared recessed navigation frame for sessions, Tools, and Unity. */
export function SidebarListNav({
  label,
  collapsed = false,
  toolList = false,
  children,
}: {
  label: string;
  collapsed?: boolean;
  toolList?: boolean;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      data-tool-list={toolList || undefined}
      className={`bg-surface-container-low/60 min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overscroll-behavior-y:contain] rounded-xl ${
        collapsed ? "p-1" : "p-2"
      }`}
    >
      <ul className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>{children}</ul>
    </nav>
  );
}

/** Keeps routine navigation rows stable while their destination content transitions. */
export function SidebarListItem({ children }: { index?: number; children: ReactNode }) {
  return <li>{children}</li>;
}
