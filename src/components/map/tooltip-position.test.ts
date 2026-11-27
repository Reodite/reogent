import { describe, expect, it } from "vitest";
import { tooltipPosition } from "./tooltip-position";

describe("tooltipPosition", () => {
  it.each([200, 264, 320, 800])("keeps tooltip bounds inside a %ipx map", (width) => {
    for (const x of [0, 20, width / 2, width - 1]) {
      const style = tooltipPosition({ x, y: 100 }, { clientWidth: width, clientHeight: 600 });
      const left = Number(style.left);
      const tooltipWidth = Number(style.maxWidth);

      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + tooltipWidth).toBeLessThanOrEqual(width - 8);
    }
  });

  it("flips above a point near the bottom-right corner", () => {
    const point = { x: 790, y: 590 };
    const container = { clientWidth: 800, clientHeight: 600 };
    const style = tooltipPosition(point, container);
    const left = Number(style.left);
    const bottom = Number(style.bottom);

    expect(left).toBeLessThan(point.x);
    expect(style.top).toBeUndefined();
    expect(Number.isFinite(bottom)).toBe(true);
    expect(bottom).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeGreaterThan(container.clientHeight - bottom);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + Number(style.maxWidth)).toBeLessThanOrEqual(container.clientWidth);
  });
});
