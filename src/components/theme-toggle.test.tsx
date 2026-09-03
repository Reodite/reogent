// @vitest-environment happy-dom
import { AppProviders } from "@/src/components/providers";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

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

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f7f5">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121214">
  `;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: !query.includes("dark") && query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.head.innerHTML = "";
});

describe("ThemeToggle", () => {
  it("uses the shared inset material without a second border", () => {
    render(
      <AppProviders>
        <ThemeToggle />
      </AppProviders>,
    );

    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(group.className.split(/\s+/)).not.toContain("border");
    expect(group.className).not.toContain("border-border-subtle");
    expect(dark.className).not.toContain("transition-all");
    expect(dark.className).toContain("transition-[color,background-color,box-shadow,transform]");
  });

  it("keeps browser chrome synchronized with an explicit theme", async () => {
    render(
      <AppProviders>
        <ThemeToggle />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).every(
        (meta) => meta.content === "#121214",
      ),
    ).toBe(true);
  });
});
