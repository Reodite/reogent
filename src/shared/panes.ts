/** Identifies a registered pane surface. The `(string & {})` tail permits custom pane IDs. */
export type PaneId =
  "map" | "course-lookup" | "prereq-tree" | "degree-planner" | "schedule" | "calendar" | (string & {});

/** Per-pane runtime state carried in `activeChannel.state`. Values are whatever the pane needs. */
export type PaneState = Record<string, unknown>;

/** A pane selection bound to runtime state: the single source of truth for what
 *  the Answer Canvas (AI Mode) or Full-Bleed Tool (Tools Mode) renders. */
export type CanvasView = { paneId: PaneId; state: PaneState };
