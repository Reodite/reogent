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
    expect(highlighted?.className).toContain("group");
    expect(highlighted?.querySelector("div")?.className).toContain("bg-primary");
  });

  it("end-anchors every tick at its bar center with shared trailing clearance", () => {
    const { container, getByText } = render(<GradeDistributionChart buckets={BUCKETS} highlightBucket="90-100" />);
    const bars = container.querySelector("[data-chart-bars]")!;
    const plot = bars.parentElement!;
    const frame = plot.parentElement!;
    const ticks = plot.nextElementSibling!;
    expect(frame.classList.contains("pr-3")).toBe(true);
    expect(ticks.classList.contains("h-12")).toBe(true);
    expect(plot.style.height).toBe("112px");
    for (const key of Object.keys(BUCKETS)) {
      const tick = getByText(key);
      for (const token of ["right-1/2", "origin-top-right", "-rotate-45", "whitespace-nowrap"]) {
        expect(tick.classList.contains(token)).toBe(true);
      }
      expect(tick.classList.contains("left-1/2")).toBe(false);
      expect(tick.parentElement?.parentElement).toBe(ticks);
    }
    expect(getByText("90-100").classList.contains("text-primary")).toBe(true);
  });

  it("contains the axis, plot and ticks in a named keyboard scroller without widening the footer", () => {
    const { container, getByRole, getByText } = render(<GradeDistributionChart buckets={BUCKETS} />);
    const scroll = getByRole("region", { name: "Grade distribution chart" });
    expect(scroll.hasAttribute("data-grade-chart-scroll")).toBe(true);
    expect(scroll.tabIndex).toBe(0);
    expect(scroll.classList.contains("overflow-x-auto")).toBe(true);
    expect(scroll.classList.contains("min-w-0")).toBe(true);
    expect(scroll.firstElementChild?.classList.contains("min-w-64")).toBe(true);
    expect(scroll.firstElementChild?.classList.contains("pt-2")).toBe(true);
    expect(scroll.querySelector("[data-chart-bars]")).not.toBeNull();
    expect(scroll.contains(getByText("90-100"))).toBe(true);
    const yLabels = [...scroll.querySelectorAll("span")].filter((label) =>
      label.classList.contains("-translate-y-1/2"),
    );
    expect(yLabels).toHaveLength(6);
    const footer = getByText("Grade distribution — 324 students");
    expect(scroll.contains(footer)).toBe(false);
    expect(scroll.nextElementSibling).toBe(footer);
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    scroll.focus();
    expect(document.activeElement).toBe(scroll);
  });

  it("preserves all bucket counts, height ratios and highlights when updating mounted bars", () => {
    const { getAllByRole, getByText, rerender } = render(
      <GradeDistributionChart buckets={BUCKETS} highlightBucket="85-89" />,
    );
    const bars = getAllByRole("img");
    const fills = bars.map((bar) => bar.firstElementChild);
    expect(bars).toHaveLength(11);
    for (const [index, [key, count]] of Object.entries(BUCKETS).entries()) {
      expect(bars[index].getAttribute("aria-label")).toBe(`${key}: ${count} students`);
      expect((bars[index].firstElementChild as HTMLElement).style.height).toBe(`${(count / 51) * 100}%`);
      expect((bars[index].firstElementChild as HTMLElement).style.minHeight).toBe("4px");
      expect(bars[index].firstElementChild?.classList.contains("bg-primary")).toBe(key === "85-89");
    }
    rerender(<GradeDistributionChart buckets={{ "<50": 4, "90-100": 8 }} highlightBucket="90-100" />);
    for (const [index, bar] of getAllByRole("img").entries()) {
      expect(bar).toBe(bars[index]);
      expect(bar.firstElementChild).toBe(fills[index]);
    }
    expect((bars[0].firstElementChild as HTMLElement).style.height).toBe("50%");
    expect((bars[1].firstElementChild as HTMLElement).style.height).toBe("0%");
    expect((bars[1].firstElementChild as HTMLElement).style.minHeight).toBe("0");
    expect((bars[10].firstElementChild as HTMLElement).style.height).toBe("100%");
    expect(bars[9].firstElementChild?.classList.contains("bg-primary")).toBe(false);
    expect(bars[10].firstElementChild?.classList.contains("bg-primary")).toBe(true);
    expect(getByText("85-89").classList.contains("text-primary")).toBe(false);
    expect(getByText("90-100").classList.contains("text-primary")).toBe(true);
    expect(getByText("Grade distribution — 12 students")).toBeTruthy();
  });

  it("shows the empty state when no buckets have students", () => {
    const { container } = render(<GradeDistributionChart buckets={{}} />);
    expect(container.textContent).toContain("No distribution data available.");
    expect(container.querySelector("[data-grade-chart-scroll]")).toBeNull();
    expect(container.querySelector("[data-chart-bars]")).toBeNull();
  });
});

it("animates only bar presentation and updates counts without remounting bars", () => {
  const { container, rerender, getByRole, getByText } = render(<GradeDistributionChart buckets={{ "<50": 2 }} />);
  const bar = getByRole("img", { name: "<50: 2 students" }).firstElementChild;
  expect(bar?.className).toContain("ui-chart-enter");
  expect(container.querySelectorAll(".ui-chart-enter")).toHaveLength(11);
  rerender(<GradeDistributionChart buckets={{ "<50": 4 }} />);
  expect(getByRole("img", { name: "<50: 4 students" }).firstElementChild).toBe(bar);
  expect(getByText("Grade distribution — 4 students")).not.toBeNull();
});
