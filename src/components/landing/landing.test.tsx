// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./landing";

const setMode = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut", isGuest: false, continueAsGuest: vi.fn() }),
}));
vi.mock("@/src/components/providers", () => ({
  useTheme: () => ({ mode: "system", setMode }),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Landing", () => {
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
