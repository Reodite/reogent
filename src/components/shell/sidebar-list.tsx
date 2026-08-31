"use client";

import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

const StaggerContext = createContext(false);
export { StaggerContext as SidebarStaggerContext };

/**
 * Sidebar mode list container: a recessed well holding the mode's nav items.
 * Shared by AI sessions (via groups), Tools panes, and Unity links so all three
 * modes render the same frame. Clips content so animating items can't bleed
 * into the header above.
 */
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
  const reduce = useReducedMotion();
  // Stagger plays only on the first render; later re-renders skip it.
  const hasAnimated = useRef(false);
  useEffect(() => {
    hasAnimated.current = true;
  }, []);
  const stagger = !hasAnimated.current && !reduce;
  return (
    <nav
      aria-label={label}
      data-tool-list={toolList || undefined}
      className={`bg-surface-container-low/60 min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overscroll-behavior-y:contain] rounded-xl ${
        collapsed ? "p-1" : "p-2"
      }`}
    >
      <ul className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
        <StaggerContext.Provider value={stagger}>{children}</StaggerContext.Provider>
      </ul>
    </nav>
  );
}

/** List item with the shared entrance stagger (spring rise, capped delay). */
export function SidebarListItem({ index = 0, children }: { index?: number; children: ReactNode }) {
  const stagger = useContext(StaggerContext);
  return (
    <motion.li
      initial={stagger ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        stagger ? { type: "spring", stiffness: 500, damping: 30, delay: Math.min(index * 0.03, 0.3) } : { duration: 0 }
      }
    >
      {children}
    </motion.li>
  );
}
