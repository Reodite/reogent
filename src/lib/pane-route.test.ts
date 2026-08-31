import { describe, expect, it } from "vitest";
import { paneIdToSlug, parseToolSlug } from "./pane-route";

describe("schedule tool route", () => {
  it("round-trips the public schedule slug", () => {
    expect(parseToolSlug("schedule")).toBe("schedule");
    expect(paneIdToSlug("schedule")).toBe("schedule");
  });
});
