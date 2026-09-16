"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

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
      data-sidebar-list={collapsed ? "collapsed" : "expanded"}
      data-tool-list={toolList || undefined}
      className={`bg-surface-container-low/60 min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overscroll-behavior-y:contain] ${
        collapsed ? "rounded-xl p-1" : "rounded-2xl p-2"
      }`}
    >
      <ul className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>{children}</ul>
    </nav>
  );
}

/** Keeps routine navigation rows stable while their destination content transitions. */
export function SidebarListItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

type SidebarItemButtonProps = Omit<ComponentPropsWithRef<"button">, "children"> & {
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed?: boolean;
  accessories?: boolean;
};

/** Shares navigation row geometry while keeping routing and session actions with callers. */
export function SidebarItemButton({
  label,
  icon,
  active,
  collapsed = false,
  accessories = false,
  className,
  type = "button",
  ...props
}: SidebarItemButtonProps) {
  return (
    <button
      type={type}
      data-sidebar-item
      data-sidebar-accessories={accessories || undefined}
      aria-current={active ? "page" : undefined}
      className={`focus-visible:ring-primary/40 flex h-11 min-w-0 items-center overflow-hidden rounded-lg text-left transition-[color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-45 sm:h-9 ${
        collapsed ? "w-11 justify-center sm:w-9" : `w-full gap-2 py-2 pl-3 ${accessories ? "pr-13 sm:pr-10" : "pr-3"}`
      } ${active ? "neu-inset bg-surface-container text-on-surface" : "text-on-surface-variant enabled:hover:bg-surface-container-high enabled:hover:text-on-surface enabled:group-hover:bg-surface-container-high enabled:group-hover:text-on-surface"} ${className ?? ""}`}
      {...props}
    >
      {icon}
      <span className={`text-sm leading-5 font-medium ${collapsed ? "sr-only" : "min-w-0 truncate"}`}>{label}</span>
    </button>
  );
}
