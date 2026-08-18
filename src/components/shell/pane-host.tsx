"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { PANE_BY_ID, type PaneEntry, type PaneState } from "@/src/components/shell/pane-registry";
import { ToolsStrip } from "@/src/components/shell/tools-strip";
import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

// ponytail: panes own their UI state for now; round-tripping pane state into activeChannel.state lands with the panes that need it (course-lookup, prereq-tree).
const noopSetState = () => {};

function ActivePane({ entry, state }: { entry: PaneEntry; state: PaneState }) {
  if (entry.id === "map") {
    return (
      <section data-pane="map" className="h-full w-full">
        <entry.Component state={state} setState={noopSetState} />
      </section>
    );
  }
  return (
    <section data-pane={entry.id} className="neu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl">
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="bg-surface-container-low text-primary grid size-7 shrink-0 place-items-center rounded-lg">
          <entry.icon className="size-4" />
        </span>
        <h2 className="text-base font-medium tracking-[-0.01em]">{entry.label}</h2>
        <div className="ml-auto" />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <entry.Component state={state} setState={noopSetState} />
      </div>
    </section>
  );
}

function PaneBottomSheet({ entry, state }: { entry: PaneEntry; state: PaneState }) {
  const { setActiveChannel } = useChatShell();
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveChannel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setActiveChannel]);
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      data-pane={entry.id}
      className="neu-panel fixed inset-x-0 bottom-0 z-50 flex h-[80vh] flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="bg-outline/40 mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full" />
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="bg-surface-container-low text-primary grid size-7 place-items-center rounded-lg">
          <entry.icon className="size-4" />
        </span>
        <h2 className="text-base font-medium tracking-[-0.01em]">{entry.label}</h2>
        <button
          type="button"
          onClick={() => setActiveChannel(null)}
          aria-label={`Close ${entry.label}`}
          className="neu-button bg-surface ml-auto grid size-9 place-items-center rounded-xl"
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <entry.Component state={state} setState={noopSetState} />
      </div>
    </motion.div>
  );
}

/** Owns the visual pane slot: a 3.75rem rail of tool icons when no pane is active, or the active pane's component expanded to 50%. Mobile user-tools render as a bottom sheet. */
export function PaneHost() {
  const { activeChannel } = useChatShell();
  const reduce = useReducedMotion();
  const entry = activeChannel ? PANE_BY_ID[activeChannel.id] : undefined;
  const hasEntry = Boolean(entry);
  return (
    <>
      <motion.aside
        animate={{ width: hasEntry ? "50%" : "3.75rem" }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
        className="pane-host hidden min-h-0 min-w-0 overflow-hidden sm:flex"
        data-pane-host
      >
        {!hasEntry && <ToolsStrip orientation="rail" />}
        {hasEntry && entry && <ActivePane entry={entry} state={activeChannel?.state ?? {}} />}
      </motion.aside>
      {hasEntry && entry && entry.id !== "map" && <PaneBottomSheet entry={entry} state={activeChannel?.state ?? {}} />}
    </>
  );
}
