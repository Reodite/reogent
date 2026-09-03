// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/src/lib/program-requirements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/program-requirements")>();
  return {
    ...actual,
    getProgramIndex: async () => ({
      faculties: ["Science"],
      majorsByFaculty: new Map([["Science", [{ url: "https://calendar.ubc.ca/program", label: "Computer Science" }]]]),
      minorsByFaculty: new Map([["Science", []]]),
    }),
  };
});

Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const { ProgramSelectors } = await import("./program-requirements");
const { usePlanner } = await import("./planner-store");

afterEach(() => {
  cleanup();
  values.clear();
});

describe("ProgramSelectors", () => {
  it("keeps external navigation separate from the major field label", async () => {
    usePlanner.setState({
      faculty: "Science",
      major: "https://calendar.ubc.ca/program",
      minor: null,
    });
    const { container } = render(<ProgramSelectors />);

    const link = await screen.findByRole("link", { name: /UBC Calendar/ });
    const layout = container.firstElementChild as HTMLElement;
    expect(layout.className).toContain("grid-cols-2");
    expect(layout.className).toContain("@min-[55rem]:flex");
    const input = screen.getByRole("combobox", { name: "Major / program" });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("Computer Science"));
    expect(link.closest("label")).toBeNull();
    expect(screen.getByText("Major / program").tagName).toBe("LABEL");
  });
});
