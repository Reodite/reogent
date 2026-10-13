import { describe, expect, it } from "vitest";
import { tooltipPosition } from "./tooltip-position";

describe("map tooltip bounds", () => {
  it.each([200, 264, 320, 800])("keeps both edges inside a %ipx map", (width) => {
    for (const x of [0, 20, width / 2, width - 1]) {
      const style = tooltipPosition({ x, y: 100 }, { clientWidth: width, clientHeight: 600 });
      expect(style.left).toBeGreaterThanOrEqual(8);
      expect(Number(style.left) + Number(style.maxWidth)).toBeLessThanOrEqual(width - 8);
    }
  });

  it("flips away from the bottom right corner", () => {
    const style = tooltipPosition({ x: 790, y: 590 }, { clientWidth: 800, clientHeight: 600 });
    expect(style.left).toBe(538);
    expect(style.top).toBeUndefined();
    expect(style.bottom).toBe(22);
  });
});
