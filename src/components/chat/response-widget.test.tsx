// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { renderers, ResponseWidget } from "@/src/components/chat/tool-renderers";
import type { ToolCall } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/map/map-panel", () => ({ MapArea: () => null }));

const mem = new Map<string, string>();
const storagePolyfill: Storage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
};

beforeAll(() => {
  Object.defineProperty(window, "sessionStorage", { value: storagePolyfill, configurable: true, writable: true });
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  mem.clear();
  vi.clearAllMocks();
  cleanup();
});
afterAll(() => {
  sessionStorage.clear();
});

const shellRef: { current: ChatShellState | null } = { current: null };
function Capture() {
  shellRef.current = useChatShell();
  return null;
}

function renderWidget(call: ToolCall, callKey?: string) {
  shellRef.current = null;
  return render(
    <ChatShellProvider>
      <ResponseWidget call={call} callKey={callKey} />
      <Capture />
    </ChatShellProvider>,
  );
}

// show_widget type key_dates maps to the calendar pane unconditionally (no
// input/result shape requirements), so it exercises the mapped+clickable path
// without a renderer complicating the DOM.
const keyDatesCall = {
  name: "show_widget",
  input: { type: "key_dates" },
  result: { type: "key_dates", result: { dates: [{ kind: "academic", name: "W", start: "2026-10-01", end: null }] } },
  status: "ok",
} as unknown as ToolCall;
// get_tuition has no canvas mapping: static, non-focusable summary.
const tuitionCall = {
  name: "get_tuition",
  input: { program_slug: "undergraduate" },
  result: { program: "ug", fees: [] },
  status: "ok",
} as unknown as ToolCall;
// walking_distance with no result yet: extractMapHighlight returns null, so
// the widget is unmapped while loading and shows the spinner badge.
const walkingLoadingCall = {
  name: "walking_distance",
  input: { from_building: "A", to_building: "B" },
  result: undefined,
  status: "ok",
} as unknown as ToolCall;

describe("5.3 — ResponseWidget (REQ-3, REQ-4)", () => {
  it("a mapped widget is focusable and loads its canvas view on click", () => {
    const { container } = renderWidget(keyDatesCall);
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;
    expect(widget).not.toBeNull();
    expect(widget.getAttribute("role")).toBe("button");
    expect(widget.getAttribute("tabindex")).toBe("0");
    act(() => {
      fireEvent.click(widget);
    });
    expect(shellRef.current?.workspaceView?.paneId).toBe("calendar");
  });

  it("unmapped tools render a static, non-focusable summary", () => {
    const { container } = renderWidget(tuitionCall);
    const widget = container.querySelector('[data-widget="get_tuition"]') as HTMLElement;
    expect(widget).not.toBeNull();
    expect(widget.getAttribute("role")).toBeNull();
    expect(widget.getAttribute("tabindex")).toBeNull();
  });

  it("the active ring follows the clicked chip only", () => {
    const { container } = renderWidget(keyDatesCall, "m1:tc-0");
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;
    expect(widget.getAttribute("data-active")).toBeNull();
    act(() => {
      fireEvent.click(widget);
    });
    expect(widget.getAttribute("data-active")).not.toBeNull();
  });

  it("a chip with the same canvas data stays unhighlighted when another chip activated", () => {
    const { container } = renderWidget(keyDatesCall, "m1:tc-2");
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;
    act(() => {
      shellRef.current?.activateCanvasView(keyDatesCall, "m1:tc-0");
    });
    expect(widget.getAttribute("data-active")).toBeNull();
  });

  it("closing the pane clears the chip highlight", () => {
    const { container } = renderWidget(keyDatesCall, "m1:tc-0");
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;
    act(() => {
      fireEvent.click(widget);
    });
    expect(widget.getAttribute("data-active")).not.toBeNull();
    act(() => {
      shellRef.current?.setRightPaneCollapsed(true);
    });
    expect(widget.getAttribute("data-active")).toBeNull();
  });

  it("Enter and Space keys activate a mapped widget, and clicking again keeps it active (no toggle-off)", () => {
    const { container } = renderWidget(keyDatesCall);
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(widget, { key: "Enter" });
    });
    expect(shellRef.current?.workspaceView?.paneId).toBe("calendar");
    // Clicking again does not close the pane — only the close button can.
    act(() => {
      fireEvent.keyDown(widget, { key: " " });
    });
    expect(shellRef.current?.workspaceView?.paneId).toBe("calendar");
  });

  it("a loading call stays non-focusable when unmapped", () => {
    const { container } = renderWidget(walkingLoadingCall);
    const widget = container.querySelector('[data-widget="walking_distance"]') as HTMLElement;
    expect(widget.getAttribute("role")).toBeNull();
  });

  it("renders and activates rich building entrance widgets", () => {
    const call = {
      name: "show_widget",
      input: { type: "building_entrances", building_code: "IBLC" },
      result: {
        type: "building_entrances",
        result: {
          building: {
            code: "IBLC",
            name: "Irving K. Barber Learning Centre",
            centroid: [-123.252, 49.267],
          },
          entrances: [{ id: "IBLC-1" }, { id: "IBLC-2" }],
        },
      },
      status: "ok",
    } as unknown as ToolCall;
    const { container, getByText } = renderWidget(call);

    expect(getByText("2 verified entrances")).toBeTruthy();
    fireEvent.click(container.querySelector('[data-widget="show_widget"]') as HTMLElement);
    expect(shellRef.current?.workspaceView?.paneId).toBe("map");
    expect(shellRef.current?.workspaceView?.state.highlight).toMatchObject({ showEntrances: true });
  });

  it("keeps raw evidence visible when a rich renderer crashes", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderers.exploding_widget = () => {
      throw new Error("renderer failed");
    };
    const call = {
      name: "exploding_widget",
      input: {},
      result: { course: "CPSC 110" },
      status: "ok",
    } as unknown as ToolCall;

    const { getByRole, getByText } = renderWidget(call);
    expect(getByRole("alert").textContent).toContain("couldn't be displayed");
    expect(getByText(/CPSC 110/)).not.toBeNull();
    delete renderers.exploding_widget;
    error.mockRestore();
  });
});
