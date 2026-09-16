// @vitest-environment happy-dom
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "./build-graph";

const apiState = vi.hoisted(() => ({
  getCourseIndex: vi.fn() as () => Promise<{ courses: CourseIndexEntry[] }>,
}));
const routerPush = vi.hoisted(() => vi.fn());
const flowProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const flowState = vi.hoisted(() => ({ throws: false, initialized: true }));
const shellActions = vi.hoisted(() => ({ setActiveChannel: vi.fn() }));
let wideViewport = false;
const motionState = vi.hoisted(() => ({ reduced: false }));
const flowActions = vi.hoisted(() => ({ zoomIn: vi.fn(), zoomOut: vi.fn() }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionState.reduced,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => apiState,
}));

vi.mock("@/src/components/chat/chat-shell-context", () => ({
  useChatShellOptional: () => shellActions,
}));

// ReactFlow needs a real DOM layout engine; stub the pieces the pane uses so
// happy-dom renders the surrounding states without the canvas.
vi.mock("reactflow", () => ({
  default: (props: {
    children?: React.ReactNode;
    onNodeContextMenu?: (e: React.MouseEvent, node: unknown) => void;
    nodesFocusable?: boolean;
    edgesFocusable?: boolean;
  }) => {
    flowProps.current = props as Record<string, unknown>;
    if (flowState.throws) throw new Error("ReactFlow failed before fitting");
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: test stub for the ReactFlow canvas.
      <div
        data-testid="rf-canvas"
        onContextMenu={(event) =>
          props.onNodeContextMenu?.(event, { id: "CPSC 110", type: "course", data: { code: "CPSC 110" } })
        }
      >
        {props.children}
      </div>
    );
  },
  Background: () => null,
  ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ setViewport: vi.fn(), ...flowActions, fitView: vi.fn() }),
  useStoreApi: () => ({ getState: () => ({ width: 0, height: 0 }) }),
  useNodesInitialized: () => flowState.initialized,
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
    routerPush.mockReset();
    flowProps.current = null;
    flowState.throws = false;
    flowState.initialized = true;
    shellActions.setActiveChannel.mockReset();
    wideViewport = false;
    motionState.reduced = false;
    flowActions.zoomIn.mockClear();
    flowActions.zoomOut.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: wideViewport,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
  });

  it("renders one padded canvas skeleton while the index loads (REQ-10.5)", () => {
    apiState.getCourseIndex.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PrereqTreePane />);
    const loading = screen.getByRole("status", { name: "Loading course index…" });
    expect(loading.className).toContain("p-4");
    expect(loading.closest("[data-workspace-canvas]")).not.toBeNull();
    expect(loading.querySelector("[data-skeleton]")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.queryByText("Search for a course above to render its prerequisite tree.")).toBeNull();
    expect(screen.getByText(/Loading course index/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Prereq tree" })).toBeTruthy();
    expect(screen.getByLabelText("Root course code").className).toContain("neu-shadow-on-surface");
  });

  it("keeps the result close to controls when feedback is empty", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 210" />);
    await screen.findByTestId("rf-canvas");
    const feedback = container.querySelector("[data-prereq-feedback]");
    expect(feedback?.childElementCount).toBe(0);
    expect(feedback?.classList.contains("empty:hidden")).toBe(true);
    expect(feedback?.className).not.toContain("min-h-5");
    const toggle = container.querySelector("[data-prereq-view-toggle]");
    expect(toggle?.classList.contains("grid")).toBe(true);
    expect(toggle?.classList.contains("grid-cols-2")).toBe(true);
    expect(toggle?.parentElement?.className).toContain("@min-[40rem]:items-center");
    for (const name of ["outline", "map"]) {
      expect(screen.getByRole("button", { name }).classList.contains("whitespace-nowrap")).toBe(true);
    }
  });

  it.each([false, true])("keeps one in-flow embedded search across resizes (outlet: %s)", async (hasOutlet) => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const outlet = render(null).container;
    const onChangeRoot = vi.fn();
    const onUiState = vi.fn();
    const pane = (width: number) => (
      <div style={{ width }}>
        <WorkspaceHostProvider host="answer-canvas" titlebarOutlet={hasOutlet ? outlet : null}>
          <PrereqTreePane initialRoot="CPSC 210" onChangeRoot={onChangeRoot} onUiState={onUiState} />
        </WorkspaceHostProvider>
      </div>
    );
    const { container, rerender } = render(pane(320));
    const canvas = await screen.findByTestId("rf-canvas");
    const input = screen.getByRole("combobox", { name: "Root course code" });
    const form = input.closest("form")!;
    const commands = form.parentElement!;
    const layout = commands.parentElement!;
    const graphRegion = container.querySelector('[data-pane="prereq-tree"]')!.parentElement!;
    expect(container.contains(form)).toBe(true);
    expect(outlet.childElementCount).toBe(0);
    expect(container.querySelector("[data-workspace-page]")).toBeNull();
    expect(input.className).toContain("neu-shadow-on-surface-container-low");
    expect(input.classList.contains("sm:h-9")).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(commands.classList.contains("shrink-0")).toBe(true);
    expect(commands.classList.contains("px-4")).toBe(true);
    expect(commands.classList.contains("bg-surface-container-low")).toBe(true);
    expect(commands.classList.contains("absolute")).toBe(false);
    expect(form.classList.contains("w-full")).toBe(true);
    expect(form.className).not.toContain("max-w-");
    expect(layout.classList.contains("flex-col")).toBe(true);
    expect(layout.classList.contains("gap-2")).toBe(true);
    expect(graphRegion.classList.contains("flex-1")).toBe(true);
    expect(graphRegion.classList.contains("min-h-0")).toBe(true);
    expect(graphRegion.parentElement).toBe(layout);
    expect(commands.compareDocumentPosition(graphRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const feedback = container.querySelector("[data-prereq-feedback]")!;
    expect(feedback.childElementCount).toBe(0);
    expect(feedback.classList.contains("empty:hidden")).toBe(true);
    expect(container.querySelector(".pt-20")).toBeNull();

    for (const width of [1440, 390, 640]) {
      rerender(pane(width));
      fireEvent(window, new Event("resize"));
      expect(screen.getAllByRole("combobox")).toEqual([input]);
      expect(input.closest("form")).toBe(form);
      expect(screen.getByTestId("rf-canvas")).toBe(canvas);
      expect(canvas.closest('[data-pane="prereq-tree"]')?.parentElement).toBe(graphRegion);
      expect(apiState.getCourseIndex).toHaveBeenCalledTimes(1);
    }
    fireEvent.change(input, { target: { value: "cpsc 2" } });
    const suggestions = await screen.findByRole("listbox");
    expect(document.body.contains(suggestions)).toBe(true);
    expect(container.contains(suggestions)).toBe(false);
    fireEvent.click(within(suggestions).getByRole("option"));
    expect(onChangeRoot).toHaveBeenLastCalledWith("CPSC 210");
    expect((input as HTMLInputElement).value).toBe("CPSC 210");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "cpsc 121" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(onChangeRoot).toHaveBeenLastCalledWith("CPSC 121");
    expect(screen.getByTestId("rf-canvas")).toBe(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(onChangeRoot).toHaveBeenLastCalledWith("");
    expect(onUiState).toHaveBeenLastCalledWith({ query: "", selections: {}, softDisabled: {} });
    expect(screen.queryByTestId("rf-canvas")).toBeNull();
    expect(feedback.childElementCount).toBe(0);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("protects Outline course codes while leaving notes and choice labels wrappable", async () => {
    apiState.getCourseIndex.mockResolvedValue({
      courses: [
        ...COURSES,
        {
          code: "CPSC 221",
          title: "Basic Algorithms and Data Structures with a long course title",
          prerequisite: "CPSC 210 and one of CPSC 110, CPSC 121.",
          corequisite: null,
        },
        {
          code: "CPSC 210",
          title: "Software Construction",
          prerequisite: "2nd-year class standing or higher.",
          corequisite: null,
        },
      ],
    });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 221" />);
    await screen.findByTestId("rf-canvas");
    const outline = container.querySelector("[data-prereq-outline]")!;
    const code = within(outline as HTMLElement).getByText("CPSC 221");
    expect(code.classList.contains("shrink-0")).toBe(true);
    expect(code.classList.contains("whitespace-nowrap")).toBe(true);
    expect(code.nextElementSibling?.classList.contains("min-w-0")).toBe(true);
    expect(code.nextElementSibling?.classList.contains("truncate")).toBe(true);
    for (const label of ["2nd-year class standing or higher", "Choose one prerequisite"]) {
      const prose = within(outline as HTMLElement).getByText(label);
      expect(prose.classList.contains("shrink-0")).toBe(false);
      expect(prose.classList.contains("whitespace-nowrap")).toBe(false);
      expect(prose.closest("summary")?.classList.contains("whitespace-nowrap")).toBe(false);
    }
  });

  it.each([false, true])(
    "preserves corequisite siblings, their prerequisites, and optional state (%s)",
    async (disabled) => {
      apiState.getCourseIndex.mockResolvedValue({
        courses: [
          ...COURSES,
          {
            code: "CPSC 400",
            title: "Root course",
            prerequisite: "MATH 200. STAT 200 is recommended.",
            corequisite: "CPSC 210 and one of CPSC 221, CPSC 222.",
          },
          { code: "CPSC 221", title: "First corequisite choice", prerequisite: "CPSC 121.", corequisite: null },
          { code: "CPSC 222", title: "Second corequisite choice", prerequisite: "MATH 100.", corequisite: null },
          { code: "STAT 200", title: "Recommended course", prerequisite: "STAT 100.", corequisite: null },
        ],
      });
      const softKey = "CPSC 400::.and[1].soft";
      const onUiState = vi.fn();
      const { container } = render(
        <PrereqTreePane initialRoot="CPSC 400" initialSoftDisabled={{ [softKey]: disabled }} onUiState={onUiState} />,
      );
      await screen.findByTestId("rf-canvas");
      const graph = flowProps.current as unknown as Graph;
      const optionalEdge = graph.edges.find((edge) => edge.type === "optional")!;
      expect(optionalEdge.data).toMatchObject({ softKey, disabled });
      expect(graph.edges.some((edge) => edge.source === "CPSC 210" && edge.target.startsWith("grp:"))).toBe(true);

      const outline = container.querySelector<HTMLElement>("[data-prereq-outline]")!;
      const root = within(outline).getByText("CPSC 400").closest("details")!;
      const sibling = within(root).getByText("CPSC 210").closest("details")!;
      expect(sibling.parentElement?.closest("details")).toBe(root);
      const choice = within(root).getByText("Choose one corequisite").closest("details")!;
      expect(choice.parentElement).toBe(sibling.parentElement);
      expect(within(sibling.querySelector("summary")!).getByText("Corequisite")).toBeTruthy();
      expect(within(choice.querySelector("summary")!).getByText("Corequisite")).toBeTruthy();
      const ownPrerequisite = within(choice).getByText("CPSC 121").closest("details")!;
      expect(ownPrerequisite.parentElement?.closest("details")).toBe(choice);
      expect(within(ownPrerequisite).queryByText("Corequisite")).toBeNull();
      fireEvent.click(choice.querySelector("summary")!);
      fireEvent.click(within(choice).getByRole("button", { name: "CPSC 222" }));
      expect(within(choice).getByRole("button", { name: "CPSC 222" }).getAttribute("aria-pressed")).toBe("true");
      expect(within(choice).queryByText("CPSC 121")).toBeNull();
      expect(within(choice).getByText("MATH 100").closest("details")?.parentElement?.closest("details")).toBe(choice);
      expect(sibling.parentElement?.closest("details")).toBe(root);

      const optional = within(root).getByText("STAT 200").closest("details")!;
      expect(optional.parentElement?.closest("details")).toBe(root);
      expect(within(optional.querySelector("summary")!).getByText("Optional")).toBeTruthy();
      fireEvent.click(optional.querySelector("summary")!);
      const toggle = within(optional).getByRole("button", {
        name: disabled ? "Show optional subtree" : "Hide optional subtree",
      });
      expect(toggle.getAttribute("aria-pressed")).toBe(String(!disabled));
      expect(within(optional).queryByText("STAT 100") !== null).toBe(!disabled);
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe(String(disabled));
      expect(toggle.textContent).toBe(disabled ? "Hide optional subtree" : "Show optional subtree");
      expect(within(optional).queryByText("STAT 100") !== null).toBe(disabled);
      expect(onUiState).toHaveBeenLastCalledWith(expect.objectContaining({ softDisabled: { [softKey]: !disabled } }));
      expect(
        (flowProps.current as unknown as Graph).edges.find((edge) => edge.type === "optional")?.data.disabled,
      ).toBe(!disabled);
    },
  );

  it("retains optional controls when another path requires the same course and stops cycles", async () => {
    apiState.getCourseIndex.mockResolvedValue({
      courses: [
        ...COURSES,
        {
          code: "CPSC 400",
          title: "Root course",
          prerequisite: "CPSC 210. CPSC 110 is recommended.",
          corequisite: null,
        },
        { code: "CPSC 110", title: "Shared prerequisite", prerequisite: "CPSC 400.", corequisite: null },
      ],
    });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 400" />);
    await screen.findByTestId("rf-canvas");
    const outline = container.querySelector<HTMLElement>("[data-prereq-outline]")!;
    const root = within(outline).getByText("CPSC 400").closest("details")!;
    const optional = within(root).getByText("Optional").closest("details")!;
    expect(optional.parentElement?.closest("details")).toBe(root);
    expect(within(root).getAllByText("CPSC 110", { selector: "summary span" })).toHaveLength(2);
    expect(within(outline).getAllByText("CPSC 400", { selector: "summary span" })).toHaveLength(1);
    fireEvent.click(optional.querySelector("summary")!);
    fireEvent.click(within(optional).getByRole("button", { name: "Hide optional subtree" }));
    expect(within(optional).getByRole("button", { name: "Show optional subtree" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("keeps selected corequisite disjunction children nested beneath their choice", async () => {
    apiState.getCourseIndex.mockResolvedValue({
      courses: [
        ...COURSES,
        {
          code: "CPSC 400",
          title: "Root course",
          prerequisite: null,
          corequisite: "CPSC 210 and either (a) CPSC 110 and CPSC 121 or (b) MATH 200.",
        },
      ],
    });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 400" />);
    await screen.findByTestId("rf-canvas");
    const graph = flowProps.current as unknown as Graph;
    const group = graph.nodes.find((node) => node.type === "radio")!;
    expect(graph.edges.filter((edge) => edge.target === group.id)).toHaveLength(3);
    const outline = container.querySelector<HTMLElement>("[data-prereq-outline]")!;
    const root = within(outline).getByText("CPSC 400").closest("details")!;
    const choice = within(root).getByText("Choose one corequisite").closest("details")!;
    const sibling = within(root).getByText("CPSC 210").closest("details")!;
    expect(choice.parentElement).toBe(sibling.parentElement);
    expect(choice.parentElement?.closest("details")).toBe(root);
    for (const code of ["CPSC 110", "CPSC 121"]) {
      const child = within(choice).getByText(code).closest("details")!;
      expect(child.parentElement?.closest("details")).toBe(choice);
    }
    fireEvent.click(choice.querySelector("summary")!);
    fireEvent.click(within(choice).getByRole("button", { name: "MATH 200" }));
    expect(
      within(choice)
        .getByText("MATH 200", { selector: "summary span" })
        .closest("details")
        ?.parentElement?.closest("details"),
    ).toBe(choice);
    expect(within(choice).queryByText("CPSC 110", { selector: "summary span" })).toBeNull();
    expect(sibling.parentElement?.closest("details")).toBe(root);
  });

  it.each(["tools", "answer-canvas"] as const)("replaces pre-fit failures and preparing UI in %s", async (host) => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    wideViewport = true;
    flowState.throws = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = render(
        <WorkspaceHostProvider host={host}>
          <PrereqTreePane initialRoot="CPSC 210" />
        </WorkspaceHostProvider>,
      );
      await waitFor(() => expect(container.querySelector("[data-prereq-canvas] [data-prereq-outline]")).not.toBeNull());
      const canvas = container.querySelector<HTMLElement>("[data-prereq-canvas]")!;
      expect(canvas.querySelectorAll("[data-prereq-outline]")).toHaveLength(1);
      expect(within(canvas).queryByRole("status", { name: "Preparing prerequisite map", hidden: true })).toBeNull();
      expect(canvas.querySelector("[data-skeleton]")).toBeNull();
      expect(within(canvas).queryByTestId("rf-canvas")).toBeNull();
      const root = within(canvas).getByText("CPSC 210").closest("details")!;
      expect(root.open).toBe(true);
      fireEvent.click(root.querySelector("summary")!);
      expect(root.open).toBe(false);
      fireEvent.click(root.querySelector("summary")!);
      expect(root.open).toBe(true);
      fireEvent.click(within(root).getAllByRole("button", { name: "Open course details" })[0]);
      if (host === "tools") expect(routerPush).toHaveBeenCalledWith("/tools/courses/CPSC210");
      else expect(shellActions.setActiveChannel).toHaveBeenCalledWith("course-lookup", { code: "CPSC 210" });
      expect(errorLog).toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it.each(["tools", "answer-canvas"] as const)("keeps preparing UI until a successful fit in %s", async (host) => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    wideViewport = true;
    flowState.initialized = false;
    const pane = (
      <WorkspaceHostProvider host={host}>
        <PrereqTreePane initialRoot="CPSC 210" />
      </WorkspaceHostProvider>
    );
    const { rerender } = render(pane);
    const canvas = await screen.findByTestId("rf-canvas");
    expect(screen.getByRole("status", { name: "Preparing prerequisite map" })).toBeTruthy();
    expect(flowProps.current?.className).toBe("invisible");
    flowState.initialized = true;
    rerender(
      <WorkspaceHostProvider host={host}>
        <PrereqTreePane initialRoot="CPSC 210" />
      </WorkspaceHostProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("status", { name: "Preparing prerequisite map" })).toBeNull());
    expect(flowProps.current?.className).toBe("prereq-graph-ready");
    expect(screen.getByTestId("rf-canvas")).toBe(canvas);
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
    expect(document.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-composition")).toBe("canvas");
    expect(document.querySelector("[data-workspace-region='rail']")).toBeNull();
    expect(document.querySelector("[data-workspace-view-toggle]")).toBeNull();
    expect(routerPush).toHaveBeenCalledWith("/tools/prereq/CPSC210");
    expect(screen.getByTestId("rf-canvas")).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Preparing prerequisite map", hidden: true }).querySelector("[data-skeleton]"),
    ).not.toBeNull();
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

  it.each(["", "CPSC 210"])("clears missing-code feedback after an unknown submit from %s", async (initialRoot) => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const onChangeRoot = vi.fn();
    const { container } = render(<PrereqTreePane initialRoot={initialRoot} onChangeRoot={onChangeRoot} />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "NOPE 999" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect((screen.getByLabelText("Root course code") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("[data-prereq-feedback]")?.childElementCount).toBe(0);
    expect(onChangeRoot).toHaveBeenLastCalledWith("");
    expect(routerPush).toHaveBeenLastCalledWith("/tools/prereq");
  });

  it("renders the empty state when a found course has no prereqs or coreqs (REQ-10.3)", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 110" />);
    await waitFor(() => expect(screen.getAllByText(/has no listed prerequisites/).length).toBeGreaterThan(0));
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
    fireEvent.click(screen.getByText("Open in Course Finder"));
    expect(routerPush).toHaveBeenCalledWith("/tools/courses/CPSC110");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("syncs a rooted URL change without clobbering typed input", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const view = render(<PrereqTreePane initialRoot="CPSC 210" />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());

    view.rerender(<PrereqTreePane initialRoot="CPSC 121" />);

    await waitFor(() => expect((screen.getByLabelText("Root course code") as HTMLInputElement).value).toBe("CPSC 121"));
  });

  it("clears the rooted graph and returns to the empty route", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 210" />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(routerPush).toHaveBeenCalledWith("/tools/prereq");
    expect((screen.getByLabelText("Root course code") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText(/Search for a course above/).length).toBeGreaterThan(0);
  });

  it("shows the view tabs on wide screens and opens the map by default", async () => {
    wideViewport = true;
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 210" />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());

    expect(screen.getByRole("button", { name: "map" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-prereq-view-toggle]")?.className).not.toContain("@min-[40rem]:hidden");
    expect(container.querySelector("[data-prereq-layout]")?.className).toContain("gap-2");

    fireEvent.click(screen.getByRole("button", { name: "outline" }));
    expect(screen.getByRole("button", { name: "outline" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-prereq-compact-view]")?.getAttribute("data-prereq-compact-view")).toBe(
      "outline",
    );
  });

  it("reveals the selected view without replacing the graph or outline nodes", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    const { container } = render(<PrereqTreePane initialRoot="CPSC 210" />);
    await screen.findByTestId("rf-canvas");
    const canvas = screen.getByTestId("rf-canvas");
    const outline = container.querySelector("[data-prereq-outline]");
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    expect(screen.getByTestId("rf-canvas")).toBe(canvas);
    expect(canvas.closest(".ui-content-enter")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "outline" }));
    expect(container.querySelector("[data-prereq-outline]")).toBe(outline);
    expect(screen.getByTestId("rf-canvas")).toBe(canvas);
    expect(outline?.closest(".ui-content-enter")).not.toBeNull();
  });

  it.each([false, true])("respects reduced motion (%s) in canvas-menu zoom commands", async (reduced) => {
    motionState.reduced = reduced;
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 210" />);
    await screen.findByTestId("rf-canvas");
    for (const [label, zoom] of [
      ["Zoom in", flowActions.zoomIn],
      ["Zoom out", flowActions.zoomOut],
    ] as const) {
      act(() => {
        const open = flowProps.current?.onPaneContextMenu as (event: unknown) => void;
        open({ clientX: 20, clientY: 20, preventDefault: vi.fn() });
      });
      const menu = screen.getByRole("menu");
      expect(menu.className).not.toContain("ui-popover-enter");
      expect(menu.querySelector(".ui-popover-enter")).not.toBeNull();
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      expect(zoom).toHaveBeenCalledWith({ duration: reduced ? 0 : 150 });
      expect(screen.queryByRole("menu")).toBeNull();
    }
  });

  it("offers a compact outline while keeping graph controls out of nested tab stops", async () => {
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    render(<PrereqTreePane initialRoot="CPSC 210" />);
    await waitFor(() => expect(screen.queryByText(/Loading course index/)).toBeNull());

    expect(screen.getByRole("button", { name: "outline" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    expect(screen.getByRole("button", { name: "map" }).getAttribute("aria-pressed")).toBe("true");
    expect(flowProps.current?.nodesFocusable).toBe(false);
    expect(flowProps.current?.edgesFocusable).toBe(false);
    expect(flowProps.current?.onNodeClick).toBeUndefined();
    expect(flowProps.current?.minZoom).toBe(0.8);
  });

  it("renders the retry alert when the index fetch fails", async () => {
    apiState.getCourseIndex.mockRejectedValue(new Error("boom"));
    const { container } = render(<PrereqTreePane />);
    await waitFor(() => expect(screen.getByText(/Couldn't load the tree/)).toBeTruthy());
    const feedback = container.querySelector("[data-prereq-feedback]");
    expect(feedback?.contains(screen.getByRole("alert"))).toBe(true);
    expect(feedback?.childElementCount).toBeGreaterThan(0);
    apiState.getCourseIndex.mockResolvedValue({ courses: COURSES });
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.queryByText(/Couldn't load the tree/)).toBeNull());
    expect(feedback?.childElementCount).toBe(0);
    expect(feedback?.classList.contains("empty:hidden")).toBe(true);
  });
});
