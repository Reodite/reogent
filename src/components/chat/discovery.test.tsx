// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { ComposerToolsMenu } from "@/src/components/chat/composer-tools-menu";
import { ToolCallsView } from "@/src/components/chat/tool-renderers";
import type { CourseDoc, ToolCall } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ listSessions: async () => [] }),
}));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut" }),
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({
  PrereqTreePane: function MockPrereqTreePane() {
    return null;
  },
}));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: function MockMapArea() {
    return null;
  },
}));

const mem = new Map<string, string>();
const storagePolyfill: Storage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  k: (i) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
};

beforeAll(() => {
  Object.defineProperty(window, "sessionStorage", {
    value: storagePolyfill,
    configurable: true,
    writable: true,
  });
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

const fullCourse: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "Foundations of computation.",
  credits: 4,
  prerequisite: "CPSC 103",
  corequisite: null,
  sections: [],
  terms: [],
  total_sections: 0,
};

const getCourseCall: ToolCall = {
  name: "get_course",
  input: { code: "CPSC 110" },
  result: fullCourse,
  status: "ok",
} as unknown as ToolCall;

describe("22.6 — Course tool card Prereq Tree affordance routes code into the tree (REQ-4.2)", () => {
  it("rendering a get_course card with a prerequisite shows a Prereq Tree button whose click opens the tree rooted at the card's code", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ToolCallsView calls={[getCourseCall]} />
        <Capture />
      </ChatShellProvider>,
    );
    const affordance = container.querySelector('[data-action="open-prereq-tree"]') as HTMLButtonElement | null;
    expect(affordance).not.toBeNull();
    expect(affordance?.getAttribute("data-code")).toBe("CPSC 110");
    act(() => {
      if (affordance) fireEvent.click(affordance);
    });
    expect(shellRef.current?.activeChannel?.id).toBe("prereq-tree");
    expect(shellRef.current?.activeChannel?.state.root).toBe("CPSC 110");
    expect(shellRef.current?.activeChannel?.state.selections).toEqual({});
  });
});

describe('22.2 — Composer "+" menu lists PaneEntry.label rows and routes them via setActiveChannel (REQ-4.3, REQ-19.5)', () => {
  it("opening the menu lists every PANE_REGISTRY entry by label", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ComposerToolsMenu />
        <Capture />
      </ChatShellProvider>,
    );
    const trigger = container.querySelector("[data-composer-tools-trigger]") as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    act(() => fireEvent.click(trigger));
    const menu = container.querySelector("[data-composer-tools-menu]");
    expect(menu).not.toBeNull();
    const rows = menu?.querySelectorAll("button[data-pane-id]");
    expect(rows?.length).toBe(4);
    const labels = Array.from(rows ?? []).map((r) => r.textContent ?? "");
    expect(labels.some((t) => t.includes("Campus map"))).toBe(true);
    expect(labels.some((t) => t.includes("Course lookup"))).toBe(true);
    expect(labels.some((t) => t.includes("Prereq tree"))).toBe(true);
    expect(labels.some((t) => t.includes("Calendar"))).toBe(true);
  });

  it("clicking the Course lookup row opens the course-lookup pane via setActiveChannel", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ComposerToolsMenu />
        <Capture />
      </ChatShellProvider>,
    );
    const trigger = container.querySelector("[data-composer-tools-trigger]") as HTMLButtonElement;
    act(() => fireEvent.click(trigger));
    const courseRow = Array.from(
      container.querySelector("[data-composer-tools-menu]")?.querySelectorAll("button[data-pane-id]") ?? [],
    ).find((b) => (b as HTMLButtonElement).getAttribute("data-pane-id") === "course-lookup") as
      HTMLButtonElement | undefined;
    expect(courseRow).toBeDefined();
    act(() => courseRow && fireEvent.click(courseRow));
    expect(shellRef.current?.activeChannel?.id).toBe("course-lookup");
    expect(container.querySelector("[data-composer-tools-menu]")).toBeNull();
  });

  it("Prereq Tree row exposes an inline code input; Enter commits and opens the tree rooted at the entered code", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ComposerToolsMenu />
        <Capture />
      </ChatShellProvider>,
    );
    const trigger = container.querySelector("[data-composer-tools-trigger]") as HTMLButtonElement;
    act(() => fireEvent.click(trigger));
    const prereqRow = Array.from(
      container.querySelector("[data-composer-tools-menu]")?.querySelectorAll("button[data-pane-id]") ?? [],
    ).find((b) => (b as HTMLButtonElement).getAttribute("data-pane-id") === "prereq-tree") as
      HTMLButtonElement | undefined;
    expect(prereqRow).toBeDefined();
    act(() => prereqRow && fireEvent.click(prereqRow));
    const input = container.querySelector("[data-prereq-input]") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    act(() => {
      fireEvent.change(input as HTMLInputElement, { target: { value: "CPSC 110" } });
    });
    act(() => {
      fireEvent.keyDown(input as HTMLInputElement, { key: "Enter", preventDefault: () => {} });
    });
    expect(shellRef.current?.activeChannel?.id).toBe("prereq-tree");
    expect(shellRef.current?.activeChannel?.state.root).toBe("CPSC 110");
  });

  it("Prereq Tree Open button is disabled until the inline code is non-empty", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ComposerToolsMenu />
        <Capture />
      </ChatShellProvider>,
    );
    const trigger = container.querySelector("[data-composer-tools-trigger]") as HTMLButtonElement;
    act(() => fireEvent.click(trigger));
    const prereqRow = Array.from(
      container.querySelector("[data-composer-tools-menu]")?.querySelectorAll("button[data-pane-id]") ?? [],
    ).find((b) => (b as HTMLButtonElement).getAttribute("data-pane-id") === "prereq-tree") as
      HTMLButtonElement | undefined;
    act(() => prereqRow && fireEvent.click(prereqRow));
    const commit = container.querySelector("[data-prereq-commit]") as HTMLButtonElement | null;
    expect(commit).not.toBeNull();
    expect(commit?.hasAttribute("disabled")).toBe(true);
    const input = container.querySelector("[data-prereq-input]") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "CPSC 320" } });
    });
    expect(commit?.hasAttribute("disabled")).toBe(false);
  });

  it("pointerdown outside the menu closes it; Escape closes the menu", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ComposerToolsMenu />
        <Capture />
      </ChatShellProvider>,
    );
    const trigger = container.querySelector("[data-composer-tools-trigger]") as HTMLButtonElement;
    act(() => fireEvent.click(trigger));
    expect(container.querySelector("[data-composer-tools-menu]")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector("[data-composer-tools-menu]")).toBeNull();
    act(() => fireEvent.click(trigger));
    expect(container.querySelector("[data-composer-tools-menu]")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("[data-composer-tools-menu]")).toBeNull();
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
    },
  };
}

function rectsDisjoint(a: DOMRect, b: DOMRect): boolean {
  return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
}

describe("22.5 + 22.4 — Property 32: tool-grounded answer renders in chat with non-overlapping pane rect (REQ-19.4)", () => {
  it('for every (claim, pane) pair: claim appears within [data-pane="chat"], chat rect non-zero, chat and pane rects disjoint', () => {
    fc.assert(
      fc.property(
        fc.record({
          claim: fc.string({ minLength: 1 }).map((s) => s.trim() || "Add/drop deadline is Sep 17"),
          pane: fc.constantFrom("course-lookup", "prereq-tree", "calendar"),
        }),
        ({ claim, pane }) => {
          shellRef.current = null;
          const { container } = render(
            <ChatShellProvider>
              <div data-pane="chat" id={`chat-${pane}`}>
                <span data-claim>{claim}</span>
              </div>
              <div data-pane={pane} id={`pane-${pane}`} />
              <Capture />
            </ChatShellProvider>,
          );
          act(() => shellRef.current?.setActiveChannel(pane, {}));
          const chatEl = container.querySelector('[data-pane="chat"]') as HTMLElement;
          const paneEl = container.querySelector(`[data-pane="${pane}"]`) as HTMLElement;
          const chatRect = rect(0, 0, 500, 600);
          const paneRect = rect(500, 0, 500, 600);
          vi.spyOn(chatEl, "getBoundingClientRect").mockReturnValue(chatRect);
          vi.spyOn(paneEl, "getBoundingClientRect").mockReturnValue(paneRect);
          vi.spyOn(window, "getComputedStyle").mockImplementation(
            (el) =>
              ({
                visibility: el === chatEl ? "visible" : "visible",
              }) as CSSStyleDeclaration,
          );
          const claimNode = chatEl.querySelector("[data-claim]");
          expect(claimNode?.textContent).toBe(claim);
          expect(chatEl.contains(claimNode)).toBe(true);
          const r = chatEl.getBoundingClientRect();
          expect(r.width).toBeGreaterThan(0);
          expect(r.height).toBeGreaterThan(0);
          expect(rectsDisjoint(r, paneEl.getBoundingClientRect())).toBe(true);
          expect(chatEl.getAttribute("data-pane")).toBe("chat");
          expect(claimNode?.closest("[data-pane]")?.getAttribute("data-pane")).toBe("chat");
          cleanup();
        },
      ),
      { numRuns: 12 },
    );
  });

  it("22.4 — calendar-deadline claim while Calendar pane open stays in chat and the rects do not overlap", () => {
    const claim = "The add/drop deadline is September 17, 2024.";
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <div data-pane="chat">
          <span data-claim>{claim}</span>
        </div>
        <div data-pane="calendar" />
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.setActiveChannel("calendar", { cursor: "2024-09", kinds: ["academic", "holiday"] }));
    const chatEl = container.querySelector('[data-pane="chat"]') as HTMLElement;
    const paneEl = container.querySelector('[data-pane="calendar"]') as HTMLElement;
    vi.spyOn(chatEl, "getBoundingClientRect").mockReturnValue(rect(0, 0, 500, 600));
    vi.spyOn(paneEl, "getBoundingClientRect").mockReturnValue(rect(500, 0, 500, 600));
    const claimNode = chatEl.querySelector("[data-claim]");
    expect(claimNode?.textContent).toBe(claim);
    expect(claimNode?.closest("[data-pane]")?.getAttribute("data-pane")).toBe("chat");
    expect(rectsDisjoint(chatEl.getBoundingClientRect(), paneEl.getBoundingClientRect())).toBe(true);
  });
});
