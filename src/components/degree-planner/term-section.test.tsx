// @vitest-environment happy-dom
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { usePlanner } from "./planner-store";
import { TermSection } from "./term-section";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
const droppable = vi.hoisted(() => vi.fn());
vi.mock("@dnd-kit/core", () => ({
  useDroppable: (options: unknown) => {
    droppable(options);
    return { setNodeRef: vi.fn(), isOver: false };
  },
  useDndMonitor: () => {},
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));
vi.mock("./course-block", () => ({ CourseBlock: ({ code }: { code: string }) => <div>{code}</div> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

describe("TermSection height contract", () => {
  it.each(["study", "coop"] as const)("gives %s terms the shared minimum with a standalone fallback", (kind) => {
    const { container } = render(
      <TermSection
        yearId="year-1"
        termIdx={0}
        term={{ season: "w1", kind, blocks: [] }}
        courseIndex={new Map()}
        validations={new Map()}
      />,
    );

    expect(container.firstElementChild?.classList.contains("min-h-[var(--planner-term-min,16rem)]")).toBe(true);
  });

  it.each([0, 20])("bounds the intrinsic course region with %i courses", (count) => {
    const { container } = render(
      <TermSection
        yearId="year-1"
        termIdx={0}
        term={{
          season: "w1",
          kind: "study",
          blocks: Array.from({ length: count }, (_, i) => ({ id: `block-${i}`, code: `CPSC ${i}` })),
        }}
        courseIndex={new Map()}
        validations={new Map()}
      />,
    );
    const list = container.firstElementChild?.children[1];

    for (const token of ["min-h-36", "[contain:size]", "flex-1", "px-0.5", "pt-0.5"]) {
      expect(list?.classList.contains(token), token).toBe(true);
    }
    expect(list?.classList.contains(count ? "overflow-y-auto" : "overflow-hidden")).toBe(true);
  });
});

describe("TermSection replacement motion", () => {
  it("removes study targets and course content immediately when changing to co-op", () => {
    const courseIndex = new Map<string, CourseIndexEntry>([
      ["CPSC 110", { code: "CPSC 110", title: "Programming", credits: 4, prerequisite: null, corequisite: null }],
    ]);
    const props = { yearId: "year-1", termIdx: 0, courseIndex, validations: new Map() };
    const study = { season: "w1" as const, kind: "study" as const, blocks: [{ id: "block-1", code: "CPSC 110" }] };
    const coop = { season: "w1" as const, kind: "coop" as const, blocks: [] };
    usePlanner.setState({
      coop: true,
      years: [{ id: "year-1", label: "Year 1", terms: [study] }],
      past: [],
      future: [],
    });
    const { container, rerender } = render(<TermSection {...props} term={study} />);
    const studySurface = container.firstElementChild;
    expect(screen.getByText("CPSC 110")).not.toBeNull();

    rerender(<TermSection {...props} term={coop} />);
    expect(studySurface?.isConnected).toBe(false);
    expect(screen.queryByText("CPSC 110")).toBeNull();
    expect(container.firstElementChild?.className).toContain("ui-content-enter");
    expect(droppable).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
    const coopSurface = container.firstElementChild;

    usePlanner.setState({ years: [{ id: "year-1", label: "Year 1", terms: [coop] }] });
    fireEvent.click(screen.getByRole("button", { name: "Switch to study term" }));
    expect(usePlanner.getState().years[0].terms[0].kind).toBe("study");
    rerender(<TermSection {...props} term={{ ...study, blocks: [] }} />);
    expect(coopSurface?.isConnected).toBe(false);
    expect(screen.queryByText("Co-op work term")).toBeNull();
    expect(screen.getByText("Drop courses here.")).not.toBeNull();
    expect(droppable).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: false }));
    expect(container.firstElementChild?.className).toContain("ui-content-enter");
  });
});
