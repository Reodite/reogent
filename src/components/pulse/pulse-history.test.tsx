// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PulseHistory } from "./pulse-history";

const getPulseHistory = vi.hoisted(() => vi.fn());

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ getPulseHistory }),
}));

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

afterEach(() => {
  cleanup();
  getPulseHistory.mockReset();
});

describe("PulseHistory", () => {
  it("reserves its heading and result footprint while loading", () => {
    getPulseHistory.mockReturnValue(new Promise(() => {}));
    render(<PulseHistory />);

    expect(screen.getByRole("heading", { name: "Previous rounds" })).not.toBeNull();
    expect(screen.getByRole("status", { name: "Loading previous rounds" })).not.toBeNull();
    expect(document.querySelectorAll(".shell-skeleton")).toHaveLength(2);
  });
});
