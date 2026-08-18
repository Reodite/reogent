"use client";

import { Icon, type IconName } from "@/src/components/icons";
import { MapArea } from "@/src/components/map/map-panel";
import { PrereqTreePane } from "@/src/components/prereq-tree/prereq-tree-pane";
import type { ComponentType } from "react";

/** Identifies a pane surface registered in {@link PANE_REGISTRY}. The `(string & {})` tail permits entries defined outside this module. */
export type PaneId = "map" | "course-lookup" | "prereq-tree" | "calendar" | (string & {});

/** Per-pane runtime state carried in `activeChannel.state`. Values are whatever the pane needs. */
export type PaneState = Record<string, unknown>;

export type PaneEntry<S extends PaneState = PaneState> = {
  id: PaneId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType<{ state: S; setState: (s: Partial<S>) => void }>;
  defaultState: S;
  /** false for map — the agent's map data owns the pane and never yields to a user tool. */
  preemptableByAgentMap: boolean;
};

function iconGlyph(name: IconName) {
  return function PaneIcon({ className }: { className?: string }) {
    return <Icon name={name} className={className} />;
  };
}

function ComingSoonPane() {
  return null;
}

function PrereqTreeRegistryPane({ state }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const root = (state.root as string | undefined) ?? "";
  return <PrereqTreePane initialRoot={root} />;
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export const PANE_REGISTRY: PaneEntry[] = [
  {
    id: "map",
    label: "Campus map",
    icon: iconGlyph("map"),
    Component: MapArea as PaneEntry["Component"],
    defaultState: {},
    preemptableByAgentMap: false,
  },
  {
    id: "course-lookup",
    label: "Course lookup",
    icon: iconGlyph("search"),
    Component: ComingSoonPane,
    defaultState: { code: "" },
    preemptableByAgentMap: true,
  },
  {
    id: "prereq-tree",
    label: "Prereq tree",
    icon: iconGlyph("tree"),
    Component: PrereqTreeRegistryPane,
    defaultState: { root: "", selections: {} },
    preemptableByAgentMap: true,
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: iconGlyph("calendar"),
    Component: ComingSoonPane,
    defaultState: { cursor: thisMonth(), kinds: ["academic", "holiday"] },
    preemptableByAgentMap: true,
  },
];

export const PANE_BY_ID: Record<PaneId, PaneEntry> = Object.fromEntries(
  PANE_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<PaneId, PaneEntry>;
