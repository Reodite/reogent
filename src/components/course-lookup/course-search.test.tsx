// @vitest-environment happy-dom
import { CourseSearchField, useCourseAutocomplete, type Candidate } from "@/src/components/course-lookup/course-search";
import type { CourseDoc } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({
  searchCourses: vi.fn(),
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => apiState,
}));

const candidates: Candidate[] = [
  { code: "CPSC 110", subject: "CPSC", number: "110", title: "Computation, Programs, and Programming" },
  { code: "CPSC 121", subject: "CPSC", number: "121", title: "Models of Computation" },
];

const baseProps = {
  value: "CPSC",
  onChange: vi.fn(),
  onSelect: vi.fn(),
  status: "idle" as const,
  list: { candidates, total: candidates.length },
  error: null,
  rejected: false,
};

const fullRecord: CourseDoc = {
  code: "CPSC 210",
  subject: "CPSC",
  number: "210",
  title: "Software Construction",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  sections: [],
  terms: ["2026-27 Winter Term 1"],
};

beforeEach(() => {
  apiState.searchCourses.mockReset();
  baseProps.onChange.mockReset();
  baseProps.onSelect.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CourseSearchField overlay", () => {
  it("owns combobox semantics and selects the active option with the keyboard", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" />);

    const input = screen.getByRole("combobox");
    const listbox = await screen.findByRole("listbox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option").every((option) => option.getAttribute("tabindex") === "-1")).toBe(true);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    fireEvent.keyDown(input, { key: "End" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(baseProps.onSelect).toHaveBeenCalledWith("CPSC 121");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input);
  });

  it("retains the query on Escape and dismisses on an outside pointer", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("CPSC");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(baseProps.onSelect).not.toHaveBeenCalled();
  });

  it("renders a full-code record as one caller-owned candidate without committing it", async () => {
    render(
      <CourseSearchField
        {...baseProps}
        value="CPSC 210"
        list={null}
        record={fullRecord}
        presentation="overlay"
        getCandidatePresentation={(candidate) => ({
          annotation: candidate.terms?.[0],
          pending: false,
        })}
      />,
    );

    const option = await screen.findByRole("option", { name: /CPSC 210.*Winter Term 1/ });
    expect(baseProps.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(baseProps.onSelect).toHaveBeenCalledWith("CPSC 210");
  });

  it("caps broad overlays and asks the user to narrow the query", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      code: `CPSC ${100 + index}`,
      subject: "CPSC",
      number: String(100 + index),
      title: `Course ${index + 1}`,
    }));
    render(<CourseSearchField {...baseProps} presentation="overlay" list={{ candidates: many, total: many.length }} />);

    expect(await screen.findAllByRole("option")).toHaveLength(20);
    expect(screen.getByText("Keep typing to narrow 25 results.")).toBeTruthy();
  });

  it("keeps the default Course Lookup presentation inline", () => {
    const { container } = render(<CourseSearchField {...baseProps} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(container.querySelector("[data-course-list]")?.className).not.toContain("absolute");
    expect(screen.getByRole("button", { name: /CPSC 110/ })).not.toBeNull();
  });
});

describe("useCourseAutocomplete request state", () => {
  it("surfaces full-code resolver failures instead of rejecting the lookup", async () => {
    vi.useFakeTimers();
    const resolveSingle = vi.fn(() => Promise.reject(new Error("Catalog unavailable")));

    function Harness() {
      const autocomplete = useCourseAutocomplete("CPSC 210", { resolveSingle });
      return <div>{autocomplete.error ?? autocomplete.status}</div>;
    }

    render(<Harness />);
    expect(screen.getByText("loading")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
    });
    expect(screen.getByText("Catalog unavailable")).toBeTruthy();
  });

  it("drops an in-flight response as soon as the input changes", async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: { courses: Candidate[] }) => void) | undefined;
    apiState.searchCourses.mockImplementation(
      () =>
        new Promise<{ courses: Candidate[] }>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    function Harness({ value }: { value: string }) {
      const autocomplete = useCourseAutocomplete(value);
      return <div>{autocomplete.list?.candidates.map((candidate) => candidate.code).join(",")}</div>;
    }

    const view = render(<Harness value="CPSC" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(apiState.searchCourses).toHaveBeenCalledTimes(1);

    view.rerender(<Harness value="MATH" />);
    await act(async () => {
      resolveFirst?.({ courses: candidates });
      await Promise.resolve();
    });

    expect(screen.queryByText("CPSC 110,CPSC 121")).toBeNull();
  });
});
