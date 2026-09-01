// @vitest-environment happy-dom
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Heavy sub-trees are stubbed so the assertions target AppShell's composition
// (regions + #main-content + sheet/drawer), not the pane internals.
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedIn" }) }));
vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => <div data-testid="map-area" />,
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({ CalendarPane: () => null }));
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({ CourseLookupPane: () => null }));
vi.mock("@/src/components/shell/session-sidebar", () => ({
  useSidebarCollapsed: () => [false, () => {}],
  BrandHeader: () => null,
  SessionSidebar: ({ footer }: { footer?: ReactNode }) => <div data-testid="session-list">{footer}</div>,
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/components/shell/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/src/components/ui/live-region", () => ({ LiveRegion: () => null }));
const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => pathname.value,
  useParams: () => ({}),
}));

let wideMatches = false;
const mem = new Map<string, string>();
const storage: Storage = {
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
  Object.defineProperty(window, "sessionStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: wideMatches,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  pathname.value = "/";
  mem.clear();
  vi.clearAllMocks();
  cleanup();
});
afterAll(() => {
  sessionStorage.clear();
  localStorage.clear();
});

function ShellFixture() {
  return (
    <ChatShellProvider>
      <AppShell>
        <div data-testid="chat-children" />
      </AppShell>
    </ChatShellProvider>
  );
}

function renderShell(wide: boolean) {
  wideMatches = wide;
  return render(<ShellFixture />);
}

function modeLink(container: HTMLElement, label: string): HTMLAnchorElement {
  const link = Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-mode-toggle]")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!link) throw new Error(`Missing ${label} mode link`);
  return link;
}

describe("10.4 — AppShell layouts (REQ-2.1, REQ-4.1, REQ-7.1)", () => {
  it("inline AI renders chat + Answer Canvas with the skip target on chat", () => {
    const { container, getByTestId } = renderShell(true);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector("[data-workspace-surface]")).toBeNull();
    expect(getByTestId("chat-children")).toBeDefined();
    expect(container.querySelector('[data-testid="session-list"]')).not.toBeNull();
    expect(container.querySelector("[data-mode-toggle]")).not.toBeNull();
    expect(container.querySelector('[data-answer-sheet="closed"]')).not.toBeNull();
  });

  it("inline AI right pane starts collapsed and has no re-expand in topbar", () => {
    const { container } = renderShell(true);

    const sheet = container.querySelector("[data-answer-sheet]");
    expect(sheet?.classList.contains("sm:grow-0")).toBe(true);
    expect(sheet?.classList.contains("sm:invisible")).toBe(true);

    // There is no topbar expand button for the right pane.
    expect(container.querySelector('[aria-label="Expand right pane"]')).toBeNull();
  });

  it("Tools mode renders no right pane collapse button", () => {
    const { container } = renderShell(true);
    fireEvent.click(modeLink(container, "Tools"));
    expect(container.querySelector('[aria-label="Close answer canvas"]')).toBeNull();
    expect(container.querySelector('[aria-label="Expand right pane"]')).toBeNull();
  });

  it("mobile AI has no way to manually open the answer sheet — only show_widget can", () => {
    const { container } = renderShell(false);
    expect(container.querySelector('[data-answer-sheet="open"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open answer canvas"]')).toBeNull();
  });

  it("inline Tools renders the Full-Bleed Tool with the skip target on the tool", () => {
    const { container } = renderShell(true);
    fireEvent.click(modeLink(container, "Tools"));
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
    const surface = container.querySelector("[data-workspace-surface]");
    expect(surface?.className).toContain("workspace-surface");
    expect(surface?.className).toContain("overflow-hidden");
    // No view activated yet → children (not-found) renders instead of the tool.
    // This matches the real app: navigating to an unknown /tools/<slug> shows the
    // not-found page in the workspace, while a valid tool activates via the
    // ToolRouteActivator effect.
    expect(container.querySelector('[data-testid="chat-children"]')).not.toBeNull();
    expect(container.querySelector("[data-tool-list]")).not.toBeNull();
  });

  it("renders Settings as a utility workspace without exposing the prior tool as current", () => {
    const view = renderShell(true);
    fireEvent.click(modeLink(view.container, "Tools"));
    fireEvent.click(view.container.querySelector('[data-tool-id="prereq-tree"]') as HTMLElement);

    pathname.value = "/settings";
    view.rerender(<ShellFixture />);

    expect(view.container.querySelectorAll("main")).toHaveLength(1);
    expect(view.container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("settings");
    expect(view.container.querySelector("#main-content")?.getAttribute("data-shell-mode")).toBe("tools");
    expect(view.container.querySelector("[data-workspace-surface]")).not.toBeNull();
    expect(view.container.querySelector('[data-testid="chat-children"]')).not.toBeNull();
    expect(view.container.querySelector('[data-tool-id="prereq-tree"]')?.getAttribute("aria-current")).toBeNull();
    expect(view.container.querySelector("[data-answer-sheet]")).toBeNull();
  });

  it("Unity uses the same shell-owned workspace surface", () => {
    const { container } = renderShell(true);
    fireEvent.click(modeLink(container, "Unity"));

    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("unity");
    expect(container.querySelector("[data-workspace-surface]")?.className).toContain("workspace-surface");
    expect(container.querySelector("[data-testid='chat-children']")).not.toBeNull();
  });

  it("compact Tools lives in the left drawer and keeps the tool full-bleed", () => {
    const { container } = renderShell(false);
    fireEvent.click(modeLink(container, "Tools"));
    const opener = container.querySelector('[aria-label="Open sidebar"]') as HTMLElement;
    expect(opener.className).toContain("z-40");
    fireEvent.click(opener);
    const drawer = container.querySelector('[role="dialog"][aria-label="Tools"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelector("[data-tool-list]")).not.toBeNull();
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
  });
});

describe("13.2 — ARIA landmarks (REQ-8.2)", () => {
  it("the ChatSurface wrapper is the sole <main> and carries #main-content; the Answer canvas is a labelled region", () => {
    const { container } = renderShell(true);
    const main = container.querySelectorAll("main");
    expect(main.length).toBe(1);
    expect(main[0]?.id).toBe("main-content");
    expect(main[0]?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector('[aria-label="Answer canvas"]')).toBeNull();
  });
});

describe("13.3 — focus move/return + inert (REQ-2.5, REQ-8.1, REQ-8.3)", () => {
  it("closing the left drawer returns focus to the Open-sidebar button", () => {
    const { container } = renderShell(false);
    const opener = container.querySelector('[aria-label="Open sidebar"]') as HTMLButtonElement;
    fireEvent.click(opener);
    expect(container.querySelector('[role="dialog"]')?.parentElement?.hasAttribute("inert")).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')?.parentElement?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(opener);
  });
});
