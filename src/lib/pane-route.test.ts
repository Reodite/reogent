import { describe, expect, it } from "vitest";
import { courseCodeToSlug, courseSlugToCode, paneIdToSlug, parseToolPath, parseToolSlug } from "./pane-route";

describe("tool routes", () => {
  it("round-trips the public schedule slug", () => {
    expect(parseToolSlug("schedule")).toBe("schedule");
    expect(paneIdToSlug("schedule")).toBe("schedule");
  });

  it("parses browse, detail, empty-tree, and rooted-tree paths", () => {
    expect(parseToolPath("/app/tools/courses")).toEqual({ paneId: "course-lookup", state: { code: "" } });
    expect(parseToolPath("/app/tools/courses/CPSC320")).toEqual({
      paneId: "course-lookup",
      state: { code: "CPSC 320" },
    });
    expect(parseToolPath("/app/tools/prereq")).toEqual({ paneId: "prereq-tree", state: { root: "", query: "" } });
    expect(parseToolPath("/app/tools/prereq/CPSC320")).toEqual({
      paneId: "prereq-tree",
      state: { root: "CPSC 320", query: "CPSC 320" },
    });
  });

  it("rejects malformed detail paths and preserves ordinary tool state", () => {
    expect(parseToolPath("/app/tools/courses/not-a-course")).toBeNull();
    expect(parseToolPath("/app/tools/prereq/CPSC320/extra")).toBeNull();
    expect(parseToolPath("/app/tools/calendar")).toEqual({ paneId: "calendar", state: {} });
    expect(parseToolPath("/app/settings")).toBeNull();
  });

  it("round-trips course path segments", () => {
    expect(courseCodeToSlug("CPSC 320")).toBe("CPSC320");
    expect(courseSlugToCode("cpsc-v320")).toBeNull();
    expect(courseSlugToCode("CPSC_V320")).toBe("CPSC 320");
  });
});
