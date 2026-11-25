import { describe, expect, it } from "vitest";
import { rovingIndex } from "./roving-index";

describe("rovingIndex", () => {
  it("wraps along the list axis and jumps to either end", () => {
    expect(rovingIndex("ArrowRight", 2, 3, "horizontal")).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 3, "horizontal")).toBe(2);
    expect(rovingIndex("ArrowDown", 1, 3, "vertical")).toBe(2);
    expect(rovingIndex("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(rovingIndex("Home", 2, 3, "vertical")).toBe(0);
    expect(rovingIndex("End", 0, 3, "horizontal")).toBe(2);
  });

  it("ignores cross-axis arrows and other keys", () => {
    expect(rovingIndex("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(rovingIndex("ArrowRight", 0, 3, "vertical")).toBeNull();
    expect(rovingIndex("Enter", 0, 3, "vertical")).toBeNull();
  });
});
