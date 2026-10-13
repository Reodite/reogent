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

describe("GradeDistributionChart", () => {
  it("exposes a named keyboard-focusable chart region", () => {
    const { getByRole } = render(<GradeDistributionChart buckets={BUCKETS} />);
    const chart = getByRole("region", { name: "Grade distribution chart" });
    expect(chart.tabIndex).toBe(0);
    chart.focus();
    expect(document.activeElement).toBe(chart);
  });

  it("reports bucket counts and totals when the data changes", () => {
    const { getAllByRole, getByText, rerender } = render(<GradeDistributionChart buckets={BUCKETS} />);
    const bars = getAllByRole("img");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(
      Object.entries(BUCKETS).map(([key, count]) => `${key}: ${count} students`),
    );
    expect(getByText("Grade distribution — 324 students")).toBeTruthy();

    rerender(<GradeDistributionChart buckets={{ "<50": 4, "90-100": 8 }} />);
    expect(getAllByRole("img").map((bar) => bar.getAttribute("aria-label"))).toEqual(
      Object.keys(BUCKETS).map((key) => `${key}: ${key === "<50" ? 4 : key === "90-100" ? 8 : 0} students`),
    );
    expect(getByText("Grade distribution — 12 students")).toBeTruthy();
  });

  it("shows the empty state when no buckets have students", () => {
    const { getByText, queryByRole } = render(<GradeDistributionChart buckets={{}} />);
    expect(getByText("No distribution data available.")).toBeTruthy();
    expect(queryByRole("region", { name: "Grade distribution chart" })).toBeNull();
    expect(queryByRole("img")).toBeNull();
  });
});
