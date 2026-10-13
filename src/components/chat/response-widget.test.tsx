// @vitest-environment happy-dom
import { ChatPanel } from "@/src/components/chat/chat-panel";
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { renderers, ResponseWidget } from "@/src/components/chat/tool-renderers";
import type { ChatMessage, ToolCall } from "@/src/lib/api-types";
import { cachePaneState, getCachedPaneState } from "@/src/lib/pane-state-cache";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  chat: vi.fn(),
  getSession: vi.fn(async () => [] as ChatMessage[]),
  listSessions: vi.fn(async () => []),
}));
vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedIn" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/chat",
  useParams: () => ({}),
}));
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
  Object.defineProperty(window, "localStorage", { value: storagePolyfill, configurable: true, writable: true });
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
  api.chat.mockReset();
  api.getSession.mockReset().mockResolvedValue([]);
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
const courseCall = {
  name: "show_widget",
  input: { type: "course" },
  result: {
    type: "course",
    result: {
      code: "CPSC_V 110",
      title: "Computation, Programs, and Programming",
      description: "A first course in programming.",
      credits: 4,
      prerequisite: "One of CPSC 100 or 103",
      corequisite: null,
      sections: [],
    },
  },
  status: "ok",
} as unknown as ToolCall;

const unsupportedPrereqCall: ToolCall = {
  name: "show_widget",
  input: { type: "prereq_tree" },
  result: { type: "prereq_tree", result: { rootCode: "CPSC 320", nodes: [], edges: [] } },
};

describe("ResponseWidget", () => {
  it("does not give an unsupported prereq widget an empty action or tab stop", () => {
    const { container, queryByRole } = renderWidget(unsupportedPrereqCall, "unsupported");
    const widget = container.querySelector('[data-widget="show_widget"]')!;
    expect(widget.getAttribute("role")).toBeNull();
    expect(widget.getAttribute("tabindex")).toBeNull();
    expect(queryByRole("button")).toBeNull();
    act(() => shellRef.current?.activateCanvasView(keyDatesCall, "valid"));
    const view = shellRef.current?.workspaceView;
    fireEvent.click(widget);
    fireEvent.keyDown(widget, { key: "Enter" });
    fireEvent.keyDown(widget, { key: " " });
    act(() => shellRef.current?.activateCanvasView(unsupportedPrereqCall, "unsupported"));
    expect(shellRef.current?.workspaceView).toBe(view);
    expect(shellRef.current?.activeCallKey).toBe("valid");
  });

  it("opens the calendar at the event month", () => {
    const { getByRole } = renderWidget({
      name: "show_widget",
      input: { type: "event" },
      result: { type: "event", result: { events: [{ title: "Campus event", start_date: "2026-10-01" }] } },
    });
    const calendar = getByRole("button", { name: "Add to Calendar" });
    fireEvent.click(calendar);
    expect(shellRef.current?.workspaceView).toEqual({
      paneId: "calendar",
      state: { cursor: "2026-10", kinds: ["academic", "holiday"] },
    });
  });

  it.each([
    ["September 1 through September 30, 2026", "2026-09-01", "September 1 through September 30, 2026"],
    [null, "2026-09-01", "2026-09-01"],
    [null, null, "—"],
  ])("uses date text or the available start-date fallback: %s", (dateText, start, expected) => {
    const { getByText } = renderWidget({
      name: "show_widget",
      input: { type: "key_dates" },
      result: { type: "key_dates", result: { dates: [{ name: "Registration deadline", date_text: dateText, start }] } },
    });
    expect(getByText(expected)).not.toBeNull();
  });

  it("preserves zero capacity and reports at least one free minute", () => {
    const { getByText } = renderWidget({
      name: "show_widget",
      input: { type: "free_rooms" },
      result: {
        type: "free_rooms",
        result: {
          rooms: [{ room: "Learning Centre room 201", location: "ICCS", capacity: 0, minutes: 0, start: "2026-09-01" }],
        },
      },
    });
    expect(getByText("0 seats")).not.toBeNull();
    expect(getByText("free 1 min")).not.toBeNull();
  });
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

  it("activates mapped tool buttons and announces their pressed state", () => {
    const { container } = renderWidget(
      {
        ...walkingLoadingCall,
        result: { from: "ICCS", to: "IBLC", meters: 400, minutes: 5 },
      },
      "walking-badge",
    );
    const badge = container.querySelector('[data-widget="walking_distance"]') as HTMLButtonElement;
    expect(badge.tagName).toBe("BUTTON");
    expect(badge.getAttribute("type")).toBe("button");
    expect(badge.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(badge);
    expect(shellRef.current?.workspaceView?.paneId).toBe("map");
    expect(badge.getAttribute("aria-pressed")).toBe("true");
  });

  it("reopens a dismissed phone canvas through an explicit mapped action", () => {
    const { container } = renderWidget(keyDatesCall, "reopened");
    act(() => {
      shellRef.current?.setUserDismissedPane(true);
      shellRef.current?.setAnswerSheetOpen(false);
      shellRef.current?.setRightPaneCollapsed(true);
    });
    fireEvent.click(container.querySelector('[data-widget="show_widget"]')!);
    expect(shellRef.current?.answerSheetOpen).toBe(true);
    expect(shellRef.current?.rightPaneCollapsed).toBe(false);
    expect(shellRef.current?.userDismissedPane).toBe(false);
    expect(shellRef.current?.activeCallKey).toBe("reopened");
  });

  it.each([
    ["Add to Calendar", "calendar"],
    ["Show on map", "map"],
  ])("opens the visible destination for %s after a phone dismissal", (action, pane) => {
    const { getByRole } = renderWidget({
      name: "show_widget",
      input: { type: "event" },
      result: { type: "event", result: { events: [{ title: "Campus event", start_date: "2026-10-01" }] } },
    });
    act(() => {
      shellRef.current?.setUserDismissedPane(true);
      shellRef.current?.setAnswerSheetOpen(false);
      shellRef.current?.setRightPaneCollapsed(true);
    });
    fireEvent.click(getByRole("button", { name: action }));
    expect(shellRef.current?.workspaceView?.paneId).toBe(pane);
    expect(shellRef.current?.answerSheetOpen).toBe(true);
    expect(shellRef.current?.rightPaneCollapsed).toBe(false);
    expect(shellRef.current?.userDismissedPane).toBe(false);
    expect(shellRef.current?.activeCallKey).toBeNull();
  });

  it("unmapped tools render a static, non-focusable summary", () => {
    const { container } = renderWidget(tuitionCall);
    const widget = container.querySelector('[data-widget="get_tuition"]') as HTMLElement;
    expect(widget).not.toBeNull();
    expect(widget.getAttribute("role")).toBeNull();
    expect(widget.getAttribute("tabindex")).toBeNull();
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

  it("gives compound course widgets explicit child actions instead of an interactive ancestor", () => {
    const { container, getByRole } = renderWidget(courseCall, "m1:tc-0");
    const widget = container.querySelector('[data-widget="show_widget"]') as HTMLElement;

    expect(widget.getAttribute("role")).toBeNull();
    expect(widget.getAttribute("tabindex")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Course details" }));
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
  });

  it("uses the clicked prerequisite root instead of a different cached query", () => {
    cachePaneState("prereq-tree", { root: "MATH 200", query: "MATH 200", selections: {} });
    expect(getCachedPaneState("prereq-tree")?.query).toBe("MATH 200");
    const { getByRole } = renderWidget(courseCall);
    act(() => shellRef.current?.setActiveChannel("calendar", { cursor: "2026-10" }));
    fireEvent.click(getByRole("button", { name: "Prereq Tree" }));
    const state = shellRef.current?.workspaceView?.state;
    expect(state?.root).toBe("CPSC_V 110");
    expect(state?.query).toBe("CPSC_V 110");
    expect(state?.selections).toEqual({});
  });

  it("renders study-space evidence as static rows when no concrete row action exists", () => {
    const call = {
      name: "show_widget",
      input: { type: "study_spaces" },
      result: {
        type: "study_spaces",
        result: { spaces: [{ id: "1", title: "Quiet room", name: null, building_code: "IBLC" }] },
      },
      status: "ok",
    } as unknown as ToolCall;
    const { queryByRole, getByText } = renderWidget(call);

    expect(getByText("Quiet room")).not.toBeNull();
    expect(queryByRole("button", { name: /Quiet room/ })).toBeNull();
  });

  it("only links program rows that have a destination", () => {
    const call = {
      name: "show_widget",
      input: { type: "program" },
      result: {
        type: "program",
        result: {
          programs: [
            { id: 1, name: "With URL", url: "https://example.com/program", degrees: ["BSc"] },
            { id: 2, name: "Without URL", url: "", degrees: ["BA"] },
          ],
        },
      },
      status: "ok",
    } as unknown as ToolCall;
    const { getByText } = renderWidget(call);

    expect(getByText("With URL").closest("a")?.getAttribute("href")).toBe("https://example.com/program");
    expect(getByText("Without URL").closest("a")).toBeNull();
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

  it.each([
    [{}, "2 learning spaces"],
    [{ bookable_room_count: 0 }, "2 learning spaces · 0 bookable rooms"],
    [{ availability: { rooms: [{}] } }, "2 learning spaces · 1 bookable room"],
  ])("only shows booking counts when the widget carries them: %j", async (booking, expected) => {
    const { getByText } = renderWidget({
      name: "show_widget",
      input: { type: "building_spaces", building_code: "IBLC" },
      result: {
        type: "building_spaces",
        result: {
          building: { code: "IBLC", name: "Learning Centre" },
          rooms: [{ name: "Room 1" }, { name: "Room 2" }],
          ...booking,
        },
      },
    });
    await act(async () => {});
    expect(getByText(expected)).not.toBeNull();
  });

  it.each([
    [
      "building_detail",
      { rooms: { state: "unavailable" }, pois: { state: "unavailable" }, entrances: { state: "unavailable" } },
      "Rooms unavailable · Services unavailable · Entrances unavailable",
    ],
    [
      "building_detail",
      { rooms: { state: "ready" }, pois: { state: "unavailable" }, entrances: { state: "ready" } },
      "0 rooms · Services unavailable · 0 entrances",
    ],
    ["building_spaces", { rooms: { state: "unavailable" } }, "Learning spaces unavailable"],
    ["building_entrances", { entrances: { state: "unavailable" } }, "Entrances unavailable"],
    ["building_detail", undefined, "0 rooms · 0 services · 0 entrances"],
    ["building_spaces", undefined, "0 learning spaces"],
    ["building_entrances", undefined, "0 verified entrances"],
  ] as const)("distinguishes unavailable sources from empty %s data: %j", async (type, sourceStatus, expected) => {
    const { getByText } = renderWidget({
      name: "show_widget",
      input: { type, building_code: "IBLC" },
      result: {
        type,
        result: {
          building: { code: "IBLC", name: "Learning Centre" },
          rooms: [],
          room_count: 0,
          pois: [],
          entrances: [],
          sourceStatus,
        },
      },
    });
    await act(async () => {});
    expect(getByText(expected)).toBeTruthy();
  });

  it("retains independent booking counts when learning spaces are unavailable", async () => {
    const { getByText } = renderWidget({
      name: "show_widget",
      input: { type: "building_spaces", building_code: "IBLC" },
      result: {
        type: "building_spaces",
        result: {
          building: { code: "IBLC" },
          rooms: [],
          room_count: 0,
          bookable_room_count: 2,
          sourceStatus: { rooms: { state: "unavailable" } },
        },
      },
    });
    await act(async () => {});
    expect(getByText("Learning spaces unavailable · 2 bookable rooms")).toBeTruthy();
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

it("updates a loaded payload without remounting its widget", () => {
  const view = (call: ToolCall) => (
    <ChatShellProvider>
      <ResponseWidget call={call} />
    </ChatShellProvider>
  );
  const { container, rerender } = render(view({ ...keyDatesCall, result: undefined }));
  const widget = container.querySelector('[data-widget="show_widget"]');
  rerender(view(keyDatesCall));
  rerender(
    view({
      ...keyDatesCall,
      result: { type: "key_dates", result: { dates: [{ name: "Updated date", start: "2026-10-02" }] } },
    }),
  );
  expect(container.querySelector('[data-widget="show_widget"]')).toBe(widget);
  expect(widget?.textContent).toContain("Updated date");
});

it("expands extra courses without remounting the preview and deactivates closing rows", () => {
  const courses = Array.from({ length: 6 }, (_, index) => ({
    code: `CPSC ${110 + index}`,
    title: `Course ${index}`,
    credits: 3,
    sections: [],
  }));
  const { getByRole, container } = renderWidget({
    name: "show_widget",
    input: { type: "courses" },
    result: { type: "courses", result: { courses } },
  });
  const preview = getByRole("button", { name: /CPSC 110/ });
  const toggle = getByRole("button", { name: "Show all (6)" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("[data-disclosure]")).toBeNull();
  fireEvent.click(toggle);
  expect(getByRole("button", { name: /CPSC 115/ })).not.toBeNull();
  expect(getByRole("button", { name: /CPSC 110/ })).toBe(preview);
  const disclosure = container.querySelector("[data-disclosure]")!;
  expect(disclosure.id).toBe(toggle.getAttribute("aria-controls"));
  fireEvent.click(getByRole("button", { name: "Show fewer" }));
  expect(disclosure.getAttribute("inert")).not.toBeNull();
  expect(disclosure.getAttribute("aria-hidden")).toBe("true");
  expect(getByRole("button", { name: /CPSC 110/ })).toBe(preview);
});

describe("shared grade chart envelopes", () => {
  it.each(["grades", "direct distribution", "nested distribution"] as const)(
    "keeps chart data and local keyboard scrolling for %s",
    async (envelope) => {
      const buckets = { "80-84": 4, "90-100": 2 };
      const type = envelope === "grades" ? "grades" : "grade_distribution";
      const data =
        envelope === "grades"
          ? { grade_distribution: { buckets, total_enrolled: 6 }, grade_summary: { avg: 86, sample_sections: 2 } }
          : {
              ...(envelope === "direct distribution" ? { buckets } : { bucket_distribution: { buckets } }),
              highlight_bucket: "90-100",
            };
      const view = renderWidget({ name: "show_widget", input: { type }, result: { type, result: data } });
      await act(async () => {});
      const chart = view.getByRole("region", { name: "Grade distribution chart" });
      expect(chart.tabIndex).toBe(0);
      expect(view.getByText(/Grade distribution.+6 students/)).not.toBeNull();
      expect(chart.closest("[data-widget]")?.getAttribute("role")).toBeNull();
    },
  );
});

describe("unsupported rich-widget history and stream selection", () => {
  it("restores the last supported call across trailing unsupported history entries", async () => {
    api.getSession.mockResolvedValue([
      {
        role: "assistant",
        content: "Supported calendar result",
        activity: [
          { type: "tool_call", content: keyDatesCall.name, input: keyDatesCall.input, result: keyDatesCall.result },
        ],
      },
      {
        role: "assistant",
        content: "Unsupported result",
        activity: [
          {
            type: "tool_call",
            content: unsupportedPrereqCall.name,
            input: unsupportedPrereqCall.input,
            result: unsupportedPrereqCall.result,
          },
        ],
      },
    ]);
    render(
      <ChatShellProvider>
        <ChatPanel sessionId="rich-history" />
        <Capture />
      </ChatShellProvider>,
    );
    await waitFor(() => expect(shellRef.current?.workspaceView?.paneId).toBe("calendar"));
    expect(shellRef.current?.activeCallKey).toBeNull();
  });

  it.each([false, true])("keeps the supported streamed call and dismissal policy (dismissed=%s)", async (dismissed) => {
    const tools = [keyDatesCall, unsupportedPrereqCall];
    api.chat.mockImplementation(
      async (
        _id: string,
        _messages: ChatMessage[],
        callbacks: {
          onToolStart?: (name: string, input: Record<string, unknown>) => void;
          onToolEnd?: (name: string, result: unknown) => void;
        },
      ) => {
        for (const call of tools) {
          callbacks.onToolStart?.(call.name, call.input);
          callbacks.onToolEnd?.(call.name, call.result);
        }
        return { message: "Stream complete", tool_calls: tools };
      },
    );
    const { getByRole, findByText, container } = render(
      <ChatShellProvider>
        <ChatPanel sessionId={null} />
        <Capture />
      </ChatShellProvider>,
    );
    act(() => {
      shellRef.current?.setUserDismissedPane(dismissed);
      shellRef.current?.setAnswerSheetOpen(false);
      shellRef.current?.setRightPaneCollapsed(true);
    });
    fireEvent.change(getByRole("textbox", { name: "Message the assistant" }), { target: { value: "Show dates" } });
    fireEvent.click(getByRole("button", { name: "Send message" }));
    await findByText("Stream complete");
    await waitFor(() => expect(shellRef.current?.workspaceView?.paneId).toBe("calendar"));
    expect(shellRef.current?.userDismissedPane).toBe(dismissed);
    expect(shellRef.current?.answerSheetOpen).toBe(!dismissed);
    expect(shellRef.current?.rightPaneCollapsed).toBe(dismissed);
    const widgets = container.querySelectorAll('[data-widget="show_widget"]');
    expect(widgets).toHaveLength(2);
    expect(widgets[1].getAttribute("role")).toBeNull();
    expect(widgets[1].getAttribute("tabindex")).toBeNull();
    if (dismissed) {
      expect(shellRef.current?.activeCallKey).toBeNull();
    } else {
      expect(shellRef.current?.activeCallKey).toMatch(/:tc-0$/);
    }
  });
});
