// @vitest-environment happy-dom
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { requirementKey, type ParsedProgramYears, type YearRequirement } from "@/src/lib/program-years";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Year } from "./planner-store";
import { YearRequirements } from "./year-requirements";

const state = vi.hoisted(() => ({
  checkedRequirements: [] as string[],
  years: [] as Year[],
  toggleRequirement: vi.fn(),
  addBlock: vi.fn(),
}));

vi.mock("./planner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./planner-store")>()),
  usePlanner: (selector: (value: typeof state) => unknown) => selector(state),
}));

const course: YearRequirement = {
  label: "MATH_V 100 or MATH_V 180",
  kind: "course",
  mode: "oneof",
  codes: ["MATH 100", "MATH 180"],
  groups: [],
  credits: 3,
};
const manual: YearRequirement = {
  label: "Electives",
  kind: "text",
  mode: "all",
  codes: [],
  groups: [],
  credits: 6,
};
const parsed: ParsedProgramYears = {
  years: [{ label: "First Year", items: [course, manual], totalCredits: 9 }],
  degreeTotalCredits: 9,
};
const courseIndex = new Map<string, CourseIndexEntry>(
  course.codes.map((code) => [code, { code, title: code, credits: 3, prerequisite: null, corequisite: null }]),
);
const props = { programUrl: "program", parsed, courseIndex, plannedCodes: new Set<string>() };

beforeEach(() => {
  state.checkedRequirements = [];
  state.years = [{ id: "first", label: "First Year", terms: [{ season: "w1", kind: "study", blocks: [] }] }];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("requirement row compositions", () => {
  it("keeps native manual buttons, a separate course checkbox, and keyboard Add alternatives", () => {
    render(<YearRequirements {...props} />);
    expect(screen.getByRole("heading", { level: 4, name: "First Year" }).className).toContain("text-muted");
    const courseLabel = screen.getByText("MATH 100 or MATH 180");
    const courseRow = courseLabel.closest("li")!;
    expect(courseRow.hasAttribute("data-requirement-key")).toBe(true);
    expect(courseLabel.closest("button")).toBeNull();
    const alternative = within(courseRow).getByRole("combobox", { name: "Course alternative" });
    fireEvent.change(alternative, { target: { value: "MATH 180" } });
    const add = within(courseRow).getByRole("button", { name: "Add MATH 180 to the plan" });
    expect(add.className).toContain("size-11");
    expect(add.className).toContain("sm:size-9");
    expect(add.className).toContain("enabled:hover:bg-surface-container-high");
    fireEvent.click(add);
    expect(state.addBlock).toHaveBeenCalledWith("first", 0, "MATH 180");
    fireEvent.click(within(courseRow).getByRole("button", { name: "Mark requirement complete manually" }));
    expect(state.toggleRequirement).toHaveBeenLastCalledWith(requirementKey("program", "First Year", course));

    const manualButton = screen.getByRole("button", { name: "Mark requirement complete" });
    expect(manualButton.querySelector("div, p, button, select")).toBeNull();
    expect(within(manualButton).getByText("Electives")).toBeTruthy();
    fireEvent.click(manualButton);
    expect(state.toggleRequirement).toHaveBeenLastCalledWith(requirementKey("program", "First Year", manual));
    for (const [row, credit] of [
      [courseRow, "3 cr"],
      [manualButton, "6 cr"],
    ] as const) {
      const credits = within(row).getByText(credit);
      expect(credits.className).toContain("w-9");
      expect(credits.className).toContain("pt-2");
      expect(credits.className).toContain("text-right");
    }
  });

  it("keeps planned completion inert and manual completion reversible with phrasing-only text", () => {
    state.checkedRequirements = [requirementKey("program", "First Year", manual)];
    const { container } = render(<YearRequirements {...props} plannedCodes={new Set(["MATH 100"])} />);
    container.querySelector("details")?.setAttribute("open", "");
    const planned = screen.getByText("Planned").closest("li")!;
    expect(planned.querySelector("button")).toBeNull();
    expect(within(planned).getByText("MATH 100 or MATH 180").className).toContain("line-through");
    const marked = screen.getByRole("button", { name: "Mark requirement incomplete" });
    expect(within(marked).getByText("Marked done")).toBeTruthy();
    expect(marked.querySelector("div, p, button, select")).toBeNull();
    expect(within(marked).getByText("6 cr").className).toContain("w-9");
    fireEvent.click(marked);
    expect(state.toggleRequirement).toHaveBeenCalledWith(requirementKey("program", "First Year", manual));
  });

  it("disables Add without a study term and omits absent credit values", () => {
    state.years = [];
    render(
      <YearRequirements
        {...props}
        parsed={{ ...parsed, years: [{ ...parsed.years[0], items: [{ ...course, credits: null }] }] }}
      />,
    );
    const add = screen.getByRole("button", { name: "No available study term" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.className).toContain("disabled:opacity-45");
    expect(add.closest("li")?.querySelector(".w-9")).toBeNull();
    fireEvent.click(add);
    expect(state.addBlock).not.toHaveBeenCalled();
  });
});
