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

describe("GradeDistributionChart behavior", () => {
  it("exposes every bucket count in the named keyboard-focusable chart", () => {
    const { getAllByRole, getByRole, getByText } = render(<GradeDistributionChart buckets={BUCKETS} />);
    const chart = getByRole("region", { name: "Grade distribution chart" });

    expect(chart.tabIndex).toBe(0);
    expect(getAllByRole("img")).toHaveLength(11);
    for (const [bucket, count] of Object.entries(BUCKETS)) {
      expect(getByRole("img", { name: `${bucket}: ${count} students` })).toBeTruthy();
    }
    expect(getByText("Grade distribution — 324 students")).toBeTruthy();
  });

  it("updates accessible counts and total without replacing the chart or bucket items", () => {
    const { getByRole, getByText, rerender } = render(<GradeDistributionChart buckets={{ "<50": 2 }} />);
    const chart = getByRole("region", { name: "Grade distribution chart" });
    const topBucket = getByRole("img", { name: "90-100: 0 students" });

    rerender(<GradeDistributionChart buckets={{ "<50": 4, "90-100": 8 }} />);

    expect(getByRole("region", { name: "Grade distribution chart" })).toBe(chart);
    expect(getByRole("img", { name: "<50: 4 students" })).not.toBeNull();
    expect(getByRole("img", { name: "90-100: 8 students" })).toBe(topBucket);
    expect(getByText("Grade distribution — 12 students")).toBeTruthy();
  });

  it("explains when there are no distribution values", () => {
    const { getByText, queryByRole } = render(<GradeDistributionChart buckets={{}} />);

    expect(getByText("No distribution data available.")).toBeTruthy();
    expect(queryByRole("region", { name: "Grade distribution chart" })).toBeNull();
  });
});
