// @vitest-environment happy-dom
import { CourseSearchField, useCourseAutocomplete, type Candidate } from "@/src/components/course-search/course-search";
import { ApiError, type CourseDoc } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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
    const { container } = render(
      <div style={{ overflow: "hidden", height: 50 }}>
        <CourseSearchField {...baseProps} presentation="overlay" />
      </div>,
    );

    const input = screen.getByRole("combobox");
    const listbox = await screen.findByRole("listbox");
    expect(container.contains(listbox)).toBe(false);
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
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("keeps a settled initial value closed until the user focuses it", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" openOnInitialValue={false} />);

    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(screen.getByRole("combobox"));
    expect(await screen.findByRole("listbox")).not.toBeNull();
  });

  it("allows schedule surfaces to use sans-serif course codes", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" monospaceCodes={false} />);

    await screen.findByRole("listbox");
    expect(screen.getByText("CPSC 110").className).not.toContain("font-mono");
  });

  it("retains the query on Escape and dismisses on an outside pointer", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await screen.findByRole("listbox");

    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(input.value).toBe("CPSC");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input);
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);

    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(baseProps.onSelect).not.toHaveBeenCalled();
  });

  it("leaves Escape unconsumed when an empty query has no visible overlay", () => {
    render(<CourseSearchField {...baseProps} value="" list={null} presentation="overlay" />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
  });

  it("dismisses suggestions when Tab moves to the next field", async () => {
    render(<CourseSearchField {...baseProps} presentation="overlay" />);
    const input = screen.getByRole("combobox");
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Tab" });
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

  it("caps broad overlays, narrows the query, and scrolls keyboard selection into view", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      code: `CPSC ${100 + index}`,
      subject: "CPSC",
      number: String(100 + index),
      title: `Course ${index + 1}`,
    }));
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });

    try {
      render(
        <CourseSearchField {...baseProps} presentation="overlay" list={{ candidates: many, total: many.length }} />,
      );

      expect(await screen.findAllByRole("option")).toHaveLength(20);
      expect(screen.getByText("Keep typing to narrow 25 results.")).toBeTruthy();
      const input = screen.getByRole("combobox");
      fireEvent.keyDown(input, { key: "End" });
      expect(input.getAttribute("aria-activedescendant")).toMatch(/option-19$/);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));

      fireEvent.keyDown(input, { key: "Escape" });
      scrollIntoView.mockClear();
      fireEvent.focus(input);
      await screen.findByRole("listbox");
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("keeps the default Course Lookup presentation inline", () => {
    const { container } = render(<CourseSearchField {...baseProps} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(container.querySelector("[data-course-list]")?.className).not.toContain("absolute");
    expect(screen.getByRole("button", { name: /CPSC 110/ })).not.toBeNull();
  });

  it("exposes named rail density and clearability without changing search behavior", () => {
    const { rerender } = render(<CourseSearchField {...baseProps} presentation="overlay" density="rail" />);
    const input = screen.getByRole("combobox");
    expect(input.className).toContain("sm:h-9");
    expect(screen.getByRole("button", { name: "Clear search" }).className).toContain("sm:size-8");

    rerender(<CourseSearchField {...baseProps} presentation="overlay" clearable={false} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
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

describe("CourseSearchField loading compositions", () => {
  it.each(["inline", "overlay"] as const)("uses padded shared suggestions in %s presentation", (presentation) => {
    const { container } = render(
      <CourseSearchField {...baseProps} list={null} status="loading" presentation={presentation} />,
    );
    const skeleton = screen.getByRole("status", { name: "Loading course suggestions" });
    expect(skeleton.className).toContain("p-3");
    expect(skeleton.querySelectorAll("[data-skeleton]")).toHaveLength(6);
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByText(/No courses matching/)).toBeNull();
    expect(screen.getByLabelText("Course code").getAttribute("aria-busy")).toBe("true");
    if (presentation === "overlay") {
      const listbox = screen.getByRole("listbox");
      expect(listbox.getAttribute("aria-busy")).toBe("true");
      expect(listbox.contains(skeleton)).toBe(false);
      expect(screen.queryByRole("option")).toBeNull();
      expect(screen.getByRole("combobox").getAttribute("aria-controls")).toBe(listbox.id);
    }
  });

  it("keeps refresh progress and retry controls outside the listbox while retaining options", () => {
    const onRetry = vi.fn();
    const view = render(<CourseSearchField {...baseProps} presentation="overlay" />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    view.rerender(<CourseSearchField {...baseProps} presentation="overlay" status="loading" />);
    const listbox = screen.getByRole("listbox");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(listbox.getAttribute("aria-busy")).toBe("true");
    expect(listbox.contains(screen.getByRole("status"))).toBe(false);
    expect(view.container.querySelector("[data-skeleton]")).toBeNull();
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.getAttribute("role")).toBe(
      "option",
    );

    view.rerender(<CourseSearchField {...baseProps} presentation="overlay" error="offline" onRetry={onRetry} />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(listbox.contains(screen.getByRole("alert"))).toBe(false);
    expect(listbox.contains(screen.getByRole("button", { name: "Retry" }))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps inline results visible during refresh", () => {
    const { container } = render(<CourseSearchField {...baseProps} status="loading" />);
    expect(screen.getByText("Updating courses…")).not.toBeNull();
    expect(screen.getByRole("button", { name: /CPSC 110/ })).not.toBeNull();
    expect(container.querySelector("[data-course-list]")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });

  it("removes the active descendant while new suggestions have not loaded", () => {
    const view = render(<CourseSearchField {...baseProps} presentation="overlay" />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    view.rerender(<CourseSearchField {...baseProps} presentation="overlay" list={null} status="loading" />);
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("retains caller-owned pending candidate progress instead of replacing it with skeletons", () => {
    const { container } = render(
      <CourseSearchField
        {...baseProps}
        presentation="overlay"
        getCandidatePresentation={() => ({ pending: true, annotation: "Adding course…" })}
      />,
    );
    const options = screen.getAllByRole("option") as HTMLButtonElement[];
    expect(options.every((option) => option.disabled && option.getAttribute("aria-busy") === "true")).toBe(true);
    expect(screen.getAllByText("Adding course…")).toHaveLength(2);
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });
});

describe("useCourseAutocomplete refresh retention", () => {
  it("keeps loaded suggestions through a refresh failure and clears them for a different query", async () => {
    vi.useFakeTimers();
    apiState.searchCourses.mockResolvedValueOnce({ courses: candidates });
    const { result, rerender } = renderHook(({ value }) => useCourseAutocomplete(value), {
      initialProps: { value: "CPSC" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.list?.candidates).toEqual(candidates);
    let fail!: (error: Error) => void;
    apiState.searchCourses.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.lookup("CPSC");
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.list?.candidates).toEqual(candidates);
    await act(async () => {
      fail(new Error("offline"));
      await refresh;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("offline");
    expect(result.current.list?.candidates).toEqual(candidates);
    rerender({ value: "MATH" });
    expect(result.current.list).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps a loaded detail record through a same-course refresh failure", async () => {
    vi.useFakeTimers();
    const resolveSingle = vi.fn().mockResolvedValueOnce(fullRecord);
    const { result } = renderHook(() => useCourseAutocomplete("CPSC 210", { resolveSingle }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.record).toEqual(fullRecord);
    let fail!: (error: Error) => void;
    resolveSingle.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.lookup("CPSC 210");
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.record).toEqual(fullRecord);
    await act(async () => {
      fail(new Error("offline"));
      await refresh;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("offline");
    expect(result.current.record).toEqual(fullRecord);
  });
});

describe("useCourseAutocomplete exact-course fallback failures", () => {
  it("settles a rejected fallback to error/idle and lets retry load the record", async () => {
    vi.useFakeTimers();
    const resolveSingle = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(404, "Missing course"))
      .mockResolvedValueOnce(fullRecord);
    apiState.searchCourses.mockRejectedValueOnce(new Error("Catalog unavailable"));
    const { result } = renderHook(() => useCourseAutocomplete("CPSC 210", { resolveSingle }));

    await act(async () => {
      await expect(result.current.lookup("CPSC 210")).resolves.toBeUndefined();
    });
    expect(apiState.searchCourses).toHaveBeenCalledWith({ subject: "CPSC" });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Catalog unavailable");
    expect(result.current.record).toBeNull();
    expect(result.current.list).toBeNull();

    const { rerender } = render(
      <CourseSearchField
        {...baseProps}
        value="CPSC 210"
        {...result.current}
        onRetry={() => void result.current.lookup("CPSC 210")}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    rerender(<CourseSearchField {...baseProps} value="CPSC 210" {...result.current} />);
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.record).toEqual(fullRecord);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["resolve", "reject"] as const)(
    "ignores an older fallback %s after the next query settles",
    async (outcome) => {
      vi.useFakeTimers();
      let resolveFallback!: (value: { courses: CourseDoc[] }) => void;
      let rejectFallback!: (error: Error) => void;
      apiState.searchCourses.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          resolveFallback = resolve;
          rejectFallback = reject;
        }),
      );
      const resolveSingle = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(404, "Missing course"))
        .mockResolvedValueOnce(fullRecord);
      const { result, rerender } = renderHook(({ value }) => useCourseAutocomplete(value, { resolveSingle }), {
        initialProps: { value: "CPSC 999" },
      });
      let olderLookup!: Promise<void>;
      await act(async () => {
        olderLookup = result.current.lookup("CPSC 999");
      });
      expect(apiState.searchCourses).toHaveBeenCalledOnce();

      rerender({ value: "CPSC 210" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(result.current.record).toEqual(fullRecord);
      await act(async () => {
        if (outcome === "resolve") resolveFallback({ courses: [] });
        else rejectFallback(new Error("Old fallback failed"));
        await expect(olderLookup).resolves.toBeUndefined();
      });
      expect(result.current.record).toEqual(fullRecord);
      expect(result.current.list).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe("idle");
    },
  );

  it("does not settle the next query when an older fallback rejects during loading", async () => {
    vi.useFakeTimers();
    let rejectFallback!: (error: Error) => void;
    apiState.searchCourses.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFallback = reject;
      }),
    );
    let resolveNext!: (record: CourseDoc) => void;
    const resolveSingle = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(404, "Missing course"))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
      );
    const { result, rerender } = renderHook(({ value }) => useCourseAutocomplete(value, { resolveSingle }), {
      initialProps: { value: "CPSC 999" },
    });
    let olderLookup!: Promise<void>;
    await act(async () => {
      olderLookup = result.current.lookup("CPSC 999");
    });
    rerender({ value: "CPSC 210" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      rejectFallback(new Error("Old fallback failed"));
      await expect(olderLookup).resolves.toBeUndefined();
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();
    expect(result.current.record).toBeNull();
    await act(async () => {
      resolveNext(fullRecord);
    });
    expect(result.current.record).toEqual(fullRecord);
    expect(result.current.status).toBe("idle");
  });

  it("does not start fallback work for an exact lookup from an older generation", async () => {
    vi.useFakeTimers();
    let rejectExact!: (error: ApiError) => void;
    const resolveSingle = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectExact = reject;
        }),
      )
      .mockResolvedValueOnce(fullRecord);
    const { result, rerender } = renderHook(({ value }) => useCourseAutocomplete(value, { resolveSingle }), {
      initialProps: { value: "CPSC 999" },
    });
    let olderLookup!: Promise<void>;
    act(() => {
      olderLookup = result.current.lookup("CPSC 999");
    });
    rerender({ value: "CPSC 210" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      rejectExact(new ApiError(404, "Missing course"));
      await expect(olderLookup).resolves.toBeUndefined();
    });
    expect(apiState.searchCourses).not.toHaveBeenCalled();
    expect(result.current.record).toEqual(fullRecord);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("idle");
  });
});
