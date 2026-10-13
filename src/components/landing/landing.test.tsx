// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("Landing spacing contracts", () => {
  it("keeps the invisible skip link out of pointer targeting without removing keyboard focus", () => {
    render(<Landing />);
    const skip = screen.getByRole("link", { name: "Skip to content" });

    expect(Array.from(skip.classList)).toEqual(
      expect.arrayContaining(["pointer-events-none", "focus:pointer-events-auto", "opacity-0", "focus:opacity-100"]),
    );
    expect(skip.getAttribute("href")).toBe("#main");
    expect(skip.tabIndex).toBe(0);
    skip.focus();
    expect(document.activeElement).toBe(skip);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(setMode).toHaveBeenCalledWith("light");
  });

  it("lets navigation wrap while protecting the brand and intrinsic theme controls", () => {
    render(<Landing />);
    const nav = screen.getByRole("navigation");
    const brand = within(nav).getByRole("link", { name: "Reodite home" });
    const theme = within(nav).getByRole("radiogroup", { name: "Appearance" });

    expect(Array.from(nav.classList)).toEqual(
      expect.arrayContaining(["min-h-14", "flex-wrap", "gap-2", "px-4", "py-0.5"]),
    );
    expect(nav.classList.contains("h-14")).toBe(false);
    expect(Array.from(brand.classList)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
    expect(brand.firstElementChild?.classList.contains("shrink-0")).toBe(true);
    expect(Array.from(theme.parentElement!.classList)).toEqual(
      expect.arrayContaining(["ml-auto", "max-w-full", "flex-wrap", "gap-2"]),
    );
    expect(Array.from(theme.classList)).toEqual(expect.arrayContaining(["w-max", "shrink-0", "grid-cols-3"]));
    for (const radio of within(theme).getAllByRole("radio")) {
      expect(radio.classList.contains("size-11")).toBe(true);
    }
    expect(within(nav).getByRole("link", { name: "Sign in" }).classList.contains("h-11")).toBe(true);
  });

  it("keeps the sticky header in document flow and gives the hero a padded viewport minimum", () => {
    render(<Landing />);
    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;

    expect(header.parentElement?.classList.contains("overflow-x-clip")).toBe(true);
    expect(header.parentElement?.classList.contains("overflow-hidden")).toBe(false);
    expect(Array.from(header.classList)).toEqual(expect.arrayContaining(["sticky", "top-0"]));
    expect(header.classList.contains("fixed")).toBe(false);
    expect(header.nextElementSibling).toBe(main);
    expect(main.classList.contains("scroll-mt-48")).toBe(true);
    expect(Array.from(hero.classList)).toEqual(expect.arrayContaining(["min-h-[calc(100dvh-4.25rem)]", "py-8"]));
    expect(hero.classList.contains("min-h-[100dvh]")).toBe(false);
  });

  it.each([0, 40])("ties the header mask and raised surface to scroll state from initial scroll %s", (initialY) => {
    const scrollY = vi.spyOn(window, "scrollY", "get").mockReturnValue(initialY);
    render(<Landing />);
    const nav = screen.getByRole("navigation");
    const mask = screen.getByRole("banner").firstElementChild!;

    const expectScrolled = (scrolled: boolean) => {
      expect(mask.classList.contains(scrolled ? "opacity-100" : "opacity-0")).toBe(true);
      expect(mask.classList.contains(scrolled ? "opacity-0" : "opacity-100")).toBe(false);
      expect(nav.classList.contains("neu-panel")).toBe(scrolled);
    };
    expect(mask.classList.contains("h-48")).toBe(true);
    expectScrolled(initialY > 16);
    for (const y of [16, 17, 0]) {
      scrollY.mockReturnValue(y);
      fireEvent.scroll(window);
      expectScrolled(y > 16);
    }
  });
});
