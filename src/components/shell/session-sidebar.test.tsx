// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarCollapsed, VersionBadge } from "./session-sidebar";

// happy-dom (via Node's experimental path) does not provide localStorage in
// this Node build without --localstorage-file; install an in-memory polyfill so
// the store can read/write the persisted collapsed state.
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
  Object.defineProperty(window, "localStorage", { value: storagePolyfill, configurable: true, writable: true });
});

beforeEach(() => {
  mem.clear();
  delete document.documentElement.dataset.sidebarCollapsed;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function Probe() {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  return (
    <>
      <span data-testid="state">{collapsed ? "collapsed" : "expanded"}</span>
      <button type="button" onClick={() => setCollapsed(!collapsed)}>
        toggle
      </button>
    </>
  );
}

describe("useSidebarCollapsed — collapse-state persistence (REQ-11.1, REQ-11.2)", () => {
  it("re-renders collapsed on first paint when localStorage is '1'", () => {
    mem.set("reogent.sidebar.collapsed", "1");
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
  });

  it("re-renders expanded on first paint when localStorage is '0'", () => {
    mem.set("reogent.sidebar.collapsed", "0");
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });

  it("defaults to expanded when no localStorage entry exists", () => {
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });

  it("synchronizes collapsed geometry when another tab changes storage", () => {
    mem.set("reogent.sidebar.collapsed", "1");
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("collapsed");

    mem.set("reogent.sidebar.collapsed", "0");
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: "reogent.sidebar.collapsed", oldValue: "1", newValue: "0" }),
      ),
    );

    expect(screen.getByTestId("state").textContent).toBe("expanded");
    expect(document.documentElement.dataset.sidebarCollapsed).toBe("false");
  });

  it("round-trips collapse across remount: toggle collapsed → remount stays collapsed; toggle expanded → remount stays expanded", () => {
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("expanded");

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
    expect(mem.get("reogent.sidebar.collapsed")).toBe("1");
    expect(document.documentElement.dataset.sidebarCollapsed).toBe("true");

    cleanup();
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("collapsed");

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(mem.get("reogent.sidebar.collapsed")).toBe("0");
    expect(document.documentElement.dataset.sidebarCollapsed).toBe("false");

    cleanup();
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });
});

describe("VersionBadge — account menu version render", () => {
  it("renders the injected version in mono treatment", () => {
    vi.stubEnv("NEXT_PUBLIC_REOGENT_VERSION", "0.1.0");
    render(<VersionBadge />);
    const badge = screen.getByText("v0.1.0");
    expect(badge.className).toContain("font-mono");
    expect(badge.className).toContain("text-xs");
  });

  it("exposes an sr-only 'Reogent version' label for screen readers", () => {
    vi.stubEnv("NEXT_PUBLIC_REOGENT_VERSION", "0.1.0");
    render(<VersionBadge />);
    expect(screen.getByText(/Reogent version/)).toBeTruthy();
  });

  it("renders a muted placeholder when version is unset", () => {
    render(<VersionBadge />);
    expect(screen.queryByText("v0.1.0")).toBeNull();
    expect(screen.getByText("-")).toBeTruthy();
  });
});

describe("AUTH_ENABLED=false smoke (REQ-11.4)", () => {
  it("collapse persistence and version badge function identically with auth disabled", () => {
    vi.stubEnv("AUTH_ENABLED", "false");
    mem.set("reogent.sidebar.collapsed", "1");
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
    cleanup();
    vi.stubEnv("NEXT_PUBLIC_REOGENT_VERSION", "0.1.0");
    render(<VersionBadge />);
    expect(screen.getByText("v0.1.0")).toBeTruthy();
  });
});
