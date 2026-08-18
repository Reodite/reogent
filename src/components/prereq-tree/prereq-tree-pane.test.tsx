// @vitest-environment happy-dom
import type { PrereqGraph } from "@/src/server/prereq/build-graph";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("reactflow", () => ({
  default: ({ nodes }: { nodes?: unknown[] }) => <div data-testid="reactflow" data-count={nodes?.length ?? 0} />,
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  getBezierPath: () => ["M0 0", 0, 0],
}));

const { PrereqTreePane } = await import("./prereq-tree-pane");

function graph(rootCode: string, found: boolean, hasPrereqs = false, hasCoreqs = false): PrereqGraph {
  return { rootCode, nodes: [], edges: [], selectionKeys: [], hasPrereqs, hasCoreqs, found };
}

function res(body: PrereqGraph, ok = true): Response {
  return { ok, status: ok ? 200 : 400, json: async () => body } as unknown as Response;
}

describe("PrereqTreePane states", () => {
  const original = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    vi.restoreAllMocks();
  });

  it("renders the literal 'Loading course index…' text while the index loads (REQ-10.5)", () => {
    render(<PrereqTreePane />);
    expect(screen.getByText(/Loading course index/)).toBeTruthy();
    expect(screen.getByLabelText("Root course code")).toBeTruthy();
  });

  it("renders the not-found state with CPSC 110 / MATH 200 suggestions when the root is missing (REQ-10.4)", async () => {
    globalThis.fetch = vi.fn(async () => res(graph("NOPE 999", false))) as unknown as typeof globalThis.fetch;
    render(<PrereqTreePane initialRoot="NOPE 999" />);
    await waitFor(() => expect(screen.getByText(/isn't in the catalog/)).toBeTruthy());
    expect(screen.getByText("CPSC 110")).toBeTruthy();
    expect(screen.getByText("MATH 200")).toBeTruthy();
  });

  it("renders the empty state when a found course has no prereqs or coreqs (REQ-10.3)", async () => {
    globalThis.fetch = vi.fn(async () => res(graph("CPSC 1", true))) as unknown as typeof globalThis.fetch;
    render(<PrereqTreePane initialRoot="CPSC 1" />);
    await waitFor(() =>
      expect(screen.getByText(/has no prerequisites or corequisites listed in the calendar/)).toBeTruthy(),
    );
  });

  it("re-fetches and re-roots when the root input is submitted (REQ-4.3)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const root = new URL(url, "http://x").searchParams.get("root") ?? "";
      return res(graph(root, true));
    }) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;
    render(<PrereqTreePane initialRoot="CPSC 110" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("root=CPSC%20110")));
    fireEvent.change(screen.getByLabelText("Root course code"), { target: { value: "MATH 200" } });
    fireEvent.click(screen.getByText("Build"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("root=MATH%20200")));
  });
});
