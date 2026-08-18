// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { PanePreempt } from "@/src/components/shell/pane-preempt";
import type { MapHighlight } from "@/src/lib/walking";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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

// happy-dom via Node's experimental path lacks storage; install an in-memory one
// so the shell's persisted previousUserChannel reads/writes don't throw.
const mem = new Map<string, string>();
const storagePolyfill: Storage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => Array.from(mem.keys())[i] ?? null,
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

const buildingPayload: MapHighlight = {
  kind: "route",
  from: "BUCH",
  to: "FOREST",
  meters: 320,
  minutes: 4,
};

describe("Property 30 — chat panel stays visible across all activeChannel states (REQ-19.1, REQ-19.2)", () => {
  const channels: (string | null)[] = [null, "map", "course-lookup", "prereq-tree", "calendar", "unknown"];
  for (const ch of channels) {
    it(`data-pane="chat" resolves when activeChannel=${ch ?? "null"}`, () => {
      shellRef.current = null;
      render(
        <ChatShellProvider>
          <div data-pane="chat">chat</div>
          <Capture />
        </ChatShellProvider>,
      );
      if (ch) act(() => shellRef.current?.setActiveChannel(ch, {}));
      expect(document.querySelector('[data-pane="chat"]')).not.toBeNull();
    });
  }
});

describe("Property 31 — agent map over a user tool switches the pane and keeps the user channel recoverable (REQ-19.3)", () => {
  it("records the prior user-tool channel in previousUserChannel when showOnMap fires from a user tool", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <div data-pane="chat">chat</div>
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.setActiveChannel("prereq-tree", { root: "CPSC 320", selections: {} }));
    act(() => shellRef.current?.showOnMap(buildingPayload));
    expect(shellRef.current?.activeChannel?.id).toBe("map");
    expect(shellRef.current?.previousUserChannel?.id).toBe("prereq-tree");
    expect(shellRef.current?.previousUserChannel?.state.root).toBe("CPSC 320");
  });

  it("opening a user tool directly (no agent map) leaves previousUserChannel cleared", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <div data-pane="chat">chat</div>
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.setActiveChannel("course-lookup", { code: "CPSC 110" }));
    expect(shellRef.current?.activeChannel?.id).toBe("course-lookup");
    expect(shellRef.current?.previousUserChannel).toBeNull();
  });
});

describe("Integration — agent emits map while Course Lookup open: Back-to pill offered + restores (REQ-19.3)", () => {
  it("renders the Back-to pill, then restoring clears the capture and returns to the user tool", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <div data-pane="chat">chat</div>
        <Capture />
        <PanePreempt />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.setActiveChannel("course-lookup", { code: "CPSC 320" }));
    expect(document.querySelector("[data-preempt-restore]")).toBeNull();
    act(() => shellRef.current?.showOnMap(buildingPayload));
    const pill = document.querySelector("[data-preempt-restore]") as HTMLButtonElement | null;
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain("Course lookup");
    act(() => {
      if (pill) fireEvent.click(pill);
    });
    expect(shellRef.current?.activeChannel?.id).toBe("course-lookup");
    expect(shellRef.current?.activeChannel?.state.code).toBe("CPSC 320");
    expect(shellRef.current?.previousUserChannel).toBeNull();
  });
});
