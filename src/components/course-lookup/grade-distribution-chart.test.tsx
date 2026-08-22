// @vitest-environment happy-dom
import { GradeDistributionChart } from "@/src/components/course-lookup/grade-distribution-chart";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const BUCKETS = {
  "<50": 12,
  "50-54": 30,
  "55-59": 44,
  "60-63": 51,
  "64-67": 48,
  "68-71": 40,
  "72-75": 33,
  "76-79": 21,
  "80-84": 25,
  "85-89": 14,
  "90-100": 6,
};

describe("GradeDistributionChart — gridlines render beneath the bars", () => {
  it("places the grid layer before the bar layer in DOM order and stacks bars above", () => {
    const { container } = render(<GradeDistributionChart buckets={BUCKETS} />);
    const grid = container.querySelector("[data-chart-grid]");
    const bars = container.querySelector("[data-chart-bars]");
    expect(grid).not.toBeNull();
    expect(bars).not.toBeNull();
    // PRECEDING = grid comes before bars in document order, so painted first.
    expect(bars!.compareDocumentPosition(grid!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(bars!.className).toContain("z-10");
  });

  it("renders one gridline per y tick excluding the baseline and labels every tick", () => {
    const { container } = render(<GradeDistributionChart buckets={BUCKETS} highlightBucket="85-89" />);
    const gridLines = container.querySelectorAll("[data-chart-grid] > div");
    expect(gridLines.length).toBe(5);
    const yLabels = [...container.querySelectorAll("span")].filter((s) => s.className.includes("-translate-y-1/2"));
    expect(yLabels.length).toBe(6);
    const highlighted = container.querySelector('[aria-label="85-89: 14 students"]');
    expect(highlighted?.className).toContain("bg-primary");
  });

  it("shows the empty state when no buckets have students", () => {
    const { container } = render(<GradeDistributionChart buckets={{}} />);
    expect(container.textContent).toContain("No distribution data available.");
  });
});
