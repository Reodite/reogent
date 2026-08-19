// @vitest-environment happy-dom
import type { PrereqGraph } from "@/src/server/prereq/build-graph";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({
  getPrereqTree: vi.fn() as (root: string) => Promise<PrereqGraph>,
  searchCourses: vi.fn() as (params: unknown) => Promise<{ courses: unknown[]; subject_total?: number }>,
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => apiState,
}));

const { PrereqTreePane } = await import("./prereq-tree-pane");

function graph(rootCode: string, found: boolean, hasPrereqs = false, hasCoreqs = false): PrereqGraph {
  return { rootCode, nodes: [], edges: [], selectionKeys: [], hasPrereqs, hasCoreqs, found };
}

describe("PrereqTreePane states", () => {
  beforeEach(() => {
    apiState.getPrereqTree.mockReset();
    apiState.searchCourses.mockReset();
    apiState.searchCourses.mockResolvedValue({ courses: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the literal 'Loading course index…' text while the index loads (REQ-10.5)", () => {
    apiState.getPrereqTree.mockReturnValue(new Promise<PrereqGraph>(() => {}));
    render(<PrereqTreePane />);
    expect(screen.getByText(/Loading course index/)).toBeTruthy();
    expect(screen.getByLabelText("Root course code")).toBeTruthy();
  });

  it("renders the not-found state with CPSC 110 / MATH 200 suggestions when the root is missing (REQ-10.4)", async () => {
    apiState.getPrereqTree.mockResolvedValue(graph("NOPE 999", false));
    render(<PrereqTreePane initialRoot="NOPE 999" />);
    await waitFor(() => expect(screen.getByText(/isn't in the catalog/)).toBeTruthy());
    expect(screen.getByText("CPSC 110")).toBeTruthy();
    expect(screen.getByText("MATH 200")).toBeTruthy();
  });

  it("renders the empty state when a found course has no prereqs or coreqs (REQ-10.3)", async () => {
    apiState.getPrereqTree.mockResolvedValue(graph("CPSC 1", true));
    render(<PrereqTreePane initialRoot="CPSC 1" />);
    await waitFor(() =>
      expect(screen.getByText(/has no prerequisites or corequisites listed in the calendar/)).toBeTruthy(),
    );
  });

  it("re-fetches and re-roots when the root input changes (REQ-4.3)", async () => {
    apiState.getPrereqTree.mockImplementation(async (root: string) => graph(root, true));
    render(<PrereqTreePane initialRoot="CPSC 110" />);
    await waitFor(() => expect(apiState.getPrereqTree).toHaveBeenCalledWith("CPSC 110"));
    const callsBefore = apiState.getPrereqTree.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "MATH 200" } });
    await waitFor(() => expect(apiState.getPrereqTree.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(apiState.getPrereqTree).toHaveBeenCalledWith("MATH 200");
  });
});
