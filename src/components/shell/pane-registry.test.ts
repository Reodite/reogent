import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({
  PrereqTreePane: function MockPrereqTreePane() {
    return null;
  },
}));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: function MockMapArea() {
    return null;
  },
}));

const { PANE_REGISTRY, PANE_BY_ID } = await import("./pane-registry");

describe("PANE_REGISTRY — composition (REQ-19.5, design.md §G)", () => {
  it("registers the four panes in canonical order: map, course-lookup, prereq-tree, calendar", () => {
    expect(PANE_REGISTRY.map((e) => e.id)).toEqual(["map", "course-lookup", "prereq-tree", "calendar"]);
  });

  it("every entry carries an id, label, icon, Component, and defaultState", () => {
    for (const entry of PANE_REGISTRY) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.icon).toBe("function");
      expect(typeof entry.Component).toBe("function");
      expect(entry.defaultState).toBeTypeOf("object");
    }
  });

  it("prereq-tree default state starts with an empty root and empty selections", () => {
    expect(PANE_BY_ID["prereq-tree"].defaultState).toEqual({ root: "", selections: {} });
  });

  it("calendar default state carries academic + holiday kinds and a current-month cursor", () => {
    const { cursor, kinds } = PANE_BY_ID.calendar.defaultState as { cursor: string; kinds: string[] };
    expect(kinds).toEqual(["academic", "holiday"]);
    expect(cursor).toMatch(/^\d{4}-\d{2}$/);
  });

  it("course-lookup default state starts with an empty code", () => {
    expect(PANE_BY_ID["course-lookup"].defaultState).toEqual({ code: "" });
  });

  it("PANE_BY_ID maps every registry id back to its entry", () => {
    for (const entry of PANE_REGISTRY) {
      expect(PANE_BY_ID[entry.id]).toBe(entry);
    }
  });
});
