// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => vi.fn());
vi.mock("@/src/components/map/map-panel", () => {
  loaded("map");
  return { MapArea: () => createElement("div", { "data-testid": "map" }) };
});
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => {
  loaded("course-lookup");
  return { CourseLookupPane: () => null };
});
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => {
  loaded("prereq-tree");
  return { PrereqTreePane: () => null };
});
vi.mock("@/src/components/degree-planner/degree-planner-pane", () => {
  loaded("degree-planner");
  return { DegreePlannerPane: () => null };
});
vi.mock("@/src/components/schedule-planner/schedule-planner-pane", () => {
  loaded("schedule");
  return { SchedulePlannerPane: () => null };
});
vi.mock("@/src/components/calendar/calendar-pane", () => {
  loaded("calendar");
  return { CalendarPane: () => null };
});

const { PANE_REGISTRY, PANE_BY_ID } = await import("./pane-registry");
afterEach(cleanup);

describe("pane registration", () => {
  it("keeps metadata lightweight and loads only the activated tool", async () => {
    expect(loaded).not.toHaveBeenCalled();
    const view = render(
      createElement(
        Suspense,
        { fallback: null },
        createElement(PANE_BY_ID.map.Component, { state: {}, setState: vi.fn() }),
      ),
    );
    await view.findByTestId("map");
    expect(loaded.mock.calls).toEqual([["map"]]);
  });

  it("lists the tools in navigation order", () => {
    expect(PANE_REGISTRY.map((entry) => entry.id)).toEqual([
      "map",
      "course-lookup",
      "prereq-tree",
      "degree-planner",
      "schedule",
      "calendar",
    ]);
  });

  it("starts prerequisite selection without a previous course or branch", () => {
    expect(PANE_BY_ID["prereq-tree"].defaultState).toEqual({ root: "", query: "", selections: {}, softDisabled: {} });
  });

  it("starts course lookup without a previous course", () => {
    expect(PANE_BY_ID["course-lookup"].defaultState).toEqual({ code: "" });
  });
});
