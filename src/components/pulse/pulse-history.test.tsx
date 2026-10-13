// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PulseHistory } from "./pulse-history";

const getPulseHistory = vi.hoisted(() => vi.fn());

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ getPulseHistory }),
}));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => false,
}));

afterEach(() => {
  cleanup();
  getPulseHistory.mockReset();
});

describe("PulseHistory", () => {
  it("groups an empty-history explanation with its heading", async () => {
    getPulseHistory.mockResolvedValue({ rounds: [] });
    render(<PulseHistory />);
    const description = await screen.findByText("No previous rounds yet.");
    const heading = screen.getByRole("heading", { name: "Previous rounds" });
    expect(description.parentElement).toBe(heading.parentElement);
    expect(description.parentElement?.className).toContain("gap-1");
    expect(description.className).not.toMatch(/\bp[ty]-|text-center/);
  });

  it("reserves its heading and result footprint while loading", () => {
    getPulseHistory.mockReturnValue(new Promise(() => {}));
    render(<PulseHistory />);

    expect(screen.getByRole("heading", { name: "Previous rounds" })).not.toBeNull();
    expect(screen.getByRole("status", { name: "Loading previous rounds" })).not.toBeNull();
    expect(document.querySelectorAll("[data-skeleton]")).toHaveLength(8);
    expect(screen.getByRole("status", { name: "Loading previous rounds" }).querySelector(".p-4")).not.toBeNull();
  });
});
