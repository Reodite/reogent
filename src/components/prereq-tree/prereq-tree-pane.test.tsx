// @vitest-environment happy-dom
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({
  getCourseIndex: vi.fn() as () => Promise<{ courses: CourseIndexEntry[] }>,
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => apiState,
}));

// ReactFlow needs a real DOM layout engine; stub the pieces the pane uses so
// happy-dom renders the surrounding states without the canvas.
vi.mock("reactflow", () => ({
  default: ({
    children,
    onNodeContextMenu,
  }: {
    children?: React.ReactNode;
    onNodeContextMenu?: (e: React.MouseEvent, node: unknown) => void;
  }) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: test stub for the ReactFlow canvas.
    <div
      data-testid="rf-canvas"
      onContextMenu={(e) => onNodeContextMenu?.(e, { id: "CPSC 110", type: "course", data: { code: "CPSC 110" } })}
    >
      {children}
    </div>
  ),
  Background: () => null,
  ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ setViewport: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() }),
  useStoreApi: () => ({ getState: () => ({ width: 0, height: 0 }) }),
  useNodesInitialized: () => true,
  getViewportForBounds: () => ({ x: 0, y: 0, zoom: 1 }),
  getNodesBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useStore: () => 1,
  EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  getBezierPath: () => ["M0 0", 0, 0],
}));

const { PrereqTreePane } = await import("./prereq-tree-pane");

const COURSES: CourseIndexEntry[] = [
  { code: "CPSC 110", title: "Computation, Programs, and Programming", prerequisite: null, corequisite: null },
  { code: "CPSC 121", title: "Models of Computation", prerequisite: null, corequisite: null },
  { code: "CPSC 210", title: "Software Construction", prerequisite: "CPSC 110.", corequisite: null },
];

describe("PrereqTreePane", () => {
  beforeEach(() => {
    apiState.getCourseIndex.mockReset();
  });

  it("renders the literal 'Loading course index…' text while the index loads (REQ-10.5)", () => {
    apiState.getCourseIndex.mockReturnValue(new Promise(() => {}));
    render(<PrereqTreePane />);
    expect(screen.getByText(/Loading course index/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Prereq tree" })).toBeTruthy();
    expect(screen.getByLabelText("Root course code").className).toContain("neu-shadow-on-surface");
  });

  it("uses the explicit Answer Canvas titlebar outlet without DOM probing", async () => {
    apiState.getCourseIndex.mockReturnValue(new Promise(() => {}));
    const outlet = document.createElement("div");
    document.body.append(outlet);
    const { container } = render(
      <WorkspaceHostProvider host="answer-canvas" menuClearance={false} titlebarOutlet={outlet}>
        <PrereqTreePane />
      </WorkspaceHostProvider>,
    );

    await waitFor(() => expect(outlet.querySelector("input")?.className).toContain("neu-shadow-on-surface"));
    expect(container.querySelector("[data-workspace-page]")).toBeNull();
    outlet.remove();
  });

  it("suggests catalog codes by prefix as the user types (autofill)", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "cpsc 1" } });
    const listbox = await screen.findByRole("listbox");
    expect(listbox.textContent).toContain("CPSC 110");
    expect(listbox.textContent).toContain("CPSC 121");
    expect(listbox.textContent).not.toContain("CPSC 210");
  });

  it("picking a suggestion fills the input and renders that course's tree", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "CPSC 2" } });
    fireEvent.click(await screen.findByRole("option"));
    expect((screen.getByLabelText("Root course code") as HTMLInputElement).value).toBe("CPSC 210");
    expect(document.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("main");
    expect(screen.getByTestId("rf-canvas")).toBeTruthy();
  });

  it("renders the not-found state with CPSC 110 / MATH 200 suggestions on a missing submit (REQ-10.4)", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "NOPE 999" } });
    fireEvent.click(screen.getByText("Show"));
    await waitFor(() => expect(screen.getByText(/isn't in the catalog/)).toBeTruthy());
    expect(screen.getByRole("alert").className).toContain("text-on-error-container");
    expect(screen.getByText("CPSC 110")).toBeTruthy();
    expect(screen.getByText("MATH 200")).toBeTruthy();
  });

  it("renders the empty state when a found course has no prereqs or coreqs (REQ-10.3)", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 110" />);
    await waitFor(() =>
      expect(screen.getByText(/has no prerequisites or corequisites listed in the calendar/)).toBeTruthy(),
    );
  });

  it("right-clicking a course card opens the context menu with a locked Add to Schedule", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 210" />);
    await waitFor(() => expect(screen.getByTestId("rf-canvas")).toBeTruthy());
    fireEvent.contextMenu(screen.getByTestId("rf-canvas"));
    const menu = await screen.findByRole("menu");
    expect(menu.textContent).toContain("Open in Course Finder");
    expect(menu.textContent).toContain("Ask AI about this tree");
    const schedule = screen.getByText("Add to Schedule").closest("button");
    expect(schedule?.disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("renders the retry alert when the index fetch fails", async () => {
    apiState.getCourseIndex.mockRejectedValue(new Error("boom"));
    render(<PrereqTreePane />);
    await waitFor(() => expect(screen.getByText(/Couldn't load the tree/)).toBeTruthy());
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.queryByText(/Couldn't load the tree/)).toBeNull());
  });
});
