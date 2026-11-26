// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PulseHistory } from "./pulse-history";

const getPulseHistory = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ getPulseHistory }));

vi.mock("@/src/components/providers", () => ({
  useApi: () => api,
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

  it("renders historical questions with their final tally", async () => {
    getPulseHistory.mockResolvedValue({
      rounds: [
        {
          id: "round-1",
          title: "Campus life",
          published_at: "2026-10-01T00:00:00.000Z",
          questions: [{ id: 1, text: "More study spaces?", my_agree: true, agree_count: 3, disagree_count: 1 }],
        },
      ],
    });
    render(<PulseHistory />);

    expect(await screen.findByRole("heading", { name: "Campus life" })).not.toBeNull();
    expect(screen.getByText("More study spaces?")).not.toBeNull();
    expect(screen.getByRole("img", { name: "25% disagree, 75% agree, 4 votes" })).not.toBeNull();
  });

  it("allows retry after a history request fails", async () => {
    getPulseHistory.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      rounds: [
        {
          id: "round-2",
          title: "Recovered round",
          published_at: "2026-10-02T00:00:00.000Z",
          questions: [],
        },
      ],
    });
    render(<PulseHistory />);

    expect(within(await screen.findByRole("alert")).getByText("offline")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Recovered round" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getPulseHistory).toHaveBeenCalledTimes(2);
  });
});
