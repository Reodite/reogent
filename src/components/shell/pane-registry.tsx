"use client";

import { CalendarPane } from "@/src/components/calendar/calendar-pane";
import { CourseLookupPane } from "@/src/components/course-lookup/course-lookup-pane";
import { DegreePlannerPane } from "@/src/components/degree-planner/degree-planner-pane";
import { Icon, type IconName } from "@/src/components/icons";
import { MapArea } from "@/src/components/map/map-panel";
import { PrereqTreePane } from "@/src/components/prereq-tree/prereq-tree-pane";
import { SchedulePlannerPane } from "@/src/components/schedule-planner/schedule-planner-pane";
import { useCallback, type ComponentType } from "react";

/** Identifies a pane surface registered in {@link PANE_REGISTRY}. The `(string & {})` tail permits entries defined outside this module. */
export type PaneId =
  | "map"
  | "course-lookup"
  | "prereq-tree"
  | "degree-planner"
  | "schedule"
  | "calendar"
  | (string & {});

/** Per-pane runtime state carried in `activeChannel.state`. Values are whatever the pane needs. */
export type PaneState = Record<string, unknown>;

/** A pane selection bound to runtime state: the single source of truth for what
 *  the Answer Canvas (AI Mode) or Full-Bleed Tool (Tools Mode) renders. */
export type CanvasView = { paneId: PaneId; state: PaneState };

export type PaneEntry<S extends PaneState = PaneState> = {
  id: PaneId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType<{ state: S; setState: (s: Partial<S>) => void }>;
  defaultState: S;
};

function iconGlyph(name: IconName) {
  return function PaneIcon({ className }: { className?: string }) {
    return <Icon name={name} className={className} />;
  };
}

function PrereqTreeRegistryPane({ state, setState }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const root = (state.root as string | undefined) || "";
  const onChangeRoot = useCallback((next: string) => setState({ root: next }), [setState]);
  // UI state (typed query, disjunction selections, soft toggles) writes through
  // to the pane state so the tree the user built survives tab swaps + reloads.
  const onUiState = useCallback((patch: Partial<PaneState>) => setState(patch), [setState]);
  return (
    <PrereqTreePane
      initialRoot={root}
      initialQuery={state.query as string | undefined}
      initialSelections={state.selections as Record<string, number> | undefined}
      initialSoftDisabled={state.softDisabled as Record<string, boolean> | undefined}
      onChangeRoot={onChangeRoot}
      onUiState={onUiState}
    />
  );
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
  },
  {
    id: "course-lookup",
    label: "Course lookup",
    icon: iconGlyph("search"),
    Component: CourseLookupPane,
    defaultState: { code: "" },
  },
  {
    id: "prereq-tree",
    label: "Prereq tree",
    icon: iconGlyph("tree"),
    Component: PrereqTreeRegistryPane,
    defaultState: { root: "", query: "", selections: {}, softDisabled: {} },
  },
  {
    id: "degree-planner",
    label: "Degree planner",
    icon: iconGlyph("mortarboard"),
    Component: DegreePlannerPane as PaneEntry["Component"],
    defaultState: {},
  },
  {
    id: "schedule",
    label: "Course schedule",
    icon: iconGlyph("calendarWeek"),
    Component: SchedulePlannerPane as PaneEntry["Component"],
    defaultState: {},
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: iconGlyph("calendar"),
    Component: CalendarPane as PaneEntry["Component"],
    defaultState: { cursor: thisMonth() },
  },
];

export const PANE_BY_ID: Record<PaneId, PaneEntry> = Object.fromEntries(
  PANE_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<PaneId, PaneEntry>;
