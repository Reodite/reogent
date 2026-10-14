// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./landing";

const setMode = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({
  status: "signedOut" as "initializing" | "signedOut" | "signedIn",
  isGuest: false,
  continueAsGuest: vi.fn(),
}));

vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));
vi.mock("@/src/components/providers", () => ({
  useTheme: () => ({ mode: "dark", setMode }),
}));
vi.mock("@/src/components/landing/product-mock", () => ({ ProductMock: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  const scrollYProgress = actual.motionValue(0);
  return {
    ...actual,
    useReducedMotion: () => true,
    useInView: () => true,
    useScroll: () => ({ scrollYProgress }),
  };
});

beforeEach(() => {
  auth.status = "signedOut";
  auth.isGuest = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Landing navigation", () => {
  it.each([
    ["initializing", false],
    ["signedOut", false],
    ["signedIn", false],
    ["signedIn", true],
  ] as const)("keeps the landing page visible for %s (guest: %s)", (status, isGuest) => {
    Object.assign(auth, { status, isGuest });
    render(<Landing />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Ask UBC anything.");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([false, true])("links signed-in visitors back to /app (guest: %s)", (isGuest) => {
    Object.assign(auth, { status: "signedIn", isGuest });
    render(<Landing />);

    const links = screen.getAllByRole("link", { name: "Open app" });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link.getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("button", { name: "Continue as guest" })).toBeNull();
  });

  it("waits for authentication initialization before allowing guest entry", () => {
    auth.status = "initializing";
    render(<Landing />);

    for (const button of screen.getAllByRole<HTMLButtonElement>("button", { name: "Continue as guest" })) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(auth.continueAsGuest).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([0, 1])("opens /app after starting a guest session from action %s", (index) => {
    render(<Landing />);
    fireEvent.click(screen.getAllByRole("button", { name: "Continue as guest" })[index]);

    expect(auth.continueAsGuest).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith("/app");
  });

  it("provides a focusable skip link and theme selection", () => {
    render(<Landing />);
    const skip = screen.getByRole("link", { name: "Skip to content" });

    expect(skip.getAttribute("href")).toBe("#main");
    expect(skip.tabIndex).toBe(0);
    skip.focus();
    expect(document.activeElement).toBe(skip);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(setMode).toHaveBeenCalledWith("light");
  });
});
