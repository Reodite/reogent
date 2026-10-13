// @vitest-environment happy-dom
import { AppProviders } from "@/src/components/providers";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn() }),
}));

const values = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => void values.set(key, String(value)),
  removeItem: (key) => void values.delete(key),
  clear: () => values.clear(),
  key: (index) => Array.from(values.keys())[index] ?? null,
  get length() {
    return values.size;
  },
};
Object.defineProperty(window, "localStorage", { configurable: true, value: storage });

function deviceAppearance(dark: boolean, reducedMotion = true) {
  const media = { matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => (query.includes("prefers-color-scheme") ? media : { matches: reducedMotion })),
  });
  return media;
}

function renderToggle(showLabels = false) {
  return render(
    <AppProviders>
      <ThemeToggle showLabels={showLabels} />
    </AppProviders>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.remove("vt-active");
  document.documentElement.style.removeProperty("--ripple-x");
  document.documentElement.style.removeProperty("--ripple-y");
  Reflect.deleteProperty(document, "startViewTransition");
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f7f5">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121214">
  `;
  deviceAppearance(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.head.innerHTML = "";
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("ThemeToggle", () => {
  it("groups two icon choices inside one inset pill", () => {
    renderToggle();
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(["Light", "Dark"]);
    expect(Array.from(group.classList)).toEqual(
      expect.arrayContaining(["neu-inset", "w-max", "shrink-0", "grid-cols-2", "rounded-full", "p-1"]),
    );
    expect(group.className.split(/\s+/)).not.toContain("border");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.classList.contains("rounded-full")).toBe(true);
      expect(radio.querySelector("svg")).not.toBeNull();
      expect(radio.className).not.toContain("transition-all");
    }
  });

  it("adds visible labels for onboarding without changing the shared control", () => {
    renderToggle(true);
    expect(screen.getByRole("radio", { name: "Light" }).textContent).toBe("Light");
    expect(screen.getByRole("radio", { name: "Dark" }).textContent).toBe("Dark");
  });

  it.each([false, true])("uses the device appearance once, with dark preference %s", (dark) => {
    const media = deviceAppearance(dark);
    const first = renderToggle();
    const expected = dark ? "dark" : "light";
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(storage.getItem("campus.theme")).toBe(expected);
    expect(media.addEventListener).not.toHaveBeenCalled();
    first.unmount();

    deviceAppearance(!dark);
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(screen.getByRole("radio", { name: dark ? "Dark" : "Light" }).getAttribute("aria-checked")).toBe("true");
  });

  it.each(["light", "dark"])("keeps a saved %s choice instead of following the device", (mode) => {
    deviceAppearance(mode !== "dark");
    storage.setItem("campus.theme", mode);
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe(mode);
    expect(storage.getItem("campus.theme")).toBe(mode);
  });

  it("resolves a legacy system preference to a concrete choice", () => {
    deviceAppearance(true);
    storage.setItem("campus.theme", "system");
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(storage.getItem("campus.theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" }).tabIndex).toBe(0);
  });

  it("uses the device and permits switching when storage is unavailable", () => {
    deviceAppearance(true);
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps browser chrome synchronized with an explicit theme", () => {
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).every(
        (meta) => meta.content === "#121214",
      ),
    ).toBe(true);
  });

  it("updates the theme and selection inside the ripple snapshot", async () => {
    deviceAppearance(false, false);
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const snapshots: Array<{ theme?: string; checked: string | null }> = [];
    const startTransition = vi.fn((update: () => void) => {
      void Promise.resolve().then(() => {
        update();
        snapshots.push({
          theme: document.documentElement.dataset.theme,
          checked: screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
        });
      });
      return { finished };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startTransition });
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }), { detail: 1, clientX: 120, clientY: 80 });
    await waitFor(() => expect(snapshots).toEqual([{ theme: "dark", checked: "true" }]));
    expect(startTransition).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.getPropertyValue("--ripple-x")).toBe("120px");
    expect(document.documentElement.style.getPropertyValue("--ripple-y")).toBe("80px");
    expect(document.documentElement.classList.contains("vt-active")).toBe(true);
    finish();
    await waitFor(() => expect(document.documentElement.classList.contains("vt-active")).toBe(false));
  });

  it("uses the same ripple for keyboard choices and keeps one tab stop", async () => {
    deviceAppearance(false, false);
    const finishes: Array<() => void> = [];
    const startTransition = vi.fn((update: () => void) => {
      update();
      return { finished: new Promise<void>((resolve) => finishes.push(resolve)) };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startTransition });
    renderToggle();
    const light = screen.getByRole("radio", { name: "Light" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    vi.spyOn(dark, "getBoundingClientRect").mockReturnValue({ left: 100, top: 60, width: 32, height: 32 } as DOMRect);
    light.focus();
    fireEvent.keyDown(light, { key: "ArrowRight" });
    expect(document.activeElement).toBe(dark);
    expect(dark.tabIndex).toBe(0);
    expect(light.tabIndex).toBe(-1);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--ripple-x")).toBe("116px");
    expect(document.documentElement.style.getPropertyValue("--ripple-y")).toBe("76px");
    fireEvent.keyDown(dark, { key: "ArrowRight" });
    expect(document.activeElement).toBe(light);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(startTransition).toHaveBeenCalledTimes(2);
    await act(async () => finishes[0]());
    expect(document.documentElement.classList.contains("vt-active")).toBe(true);
    await act(async () => finishes[1]());
    expect(document.documentElement.classList.contains("vt-active")).toBe(false);
  });

  it("skips the ripple for reduced motion and unchanged choices", () => {
    const startTransition = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startTransition });
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    deviceAppearance(false, false);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(startTransition).not.toHaveBeenCalled();
  });
});
