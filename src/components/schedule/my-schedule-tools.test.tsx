// @vitest-environment happy-dom

import type { Schedule, Section } from "@/src/lib/schedule/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyScheduleTools } from "./my-schedule-tools";

function section(id: string, startMin: number, endMin: number, buildingCode: string): Section {
  return {
    id,
    courseCode: id,
    title: id,
    component: "Lecture",
    instructors: [],
    termStart: "2026-09-08",
    termEnd: "2026-12-04",
    meetings: [{ days: ["Mon"], startMin, endMin, buildingCode, raw: "" }],
  };
}

const schedule: Schedule = {
  importedAt: "2026-09-01T00:00:00.000Z",
  sections: [
    section("CPSC 110", 540, 590, "ICCS"),
    section("MATH 100", 600, 650, "LSK"),
    section("ENGL 112", 660, 710, "BUCH"),
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MyScheduleTools", () => {
  it("flags only transfers whose walk meets or exceeds the gap", async () => {
    const minutes: Record<string, number> = { "ICCS|LSK": 12, "LSK|BUCH": 6 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const params = new URL(url, "http://localhost").searchParams;
        const key = `${params.get("from")}|${params.get("to")}`;
        return new Response(JSON.stringify({ minutes: minutes[key], method: "network" }));
      }),
    );
    render(<MyScheduleTools schedule={schedule} sections={schedule.sections} />);

    const list = await screen.findByRole("region", { name: "Tight transfers" });
    expect(list.textContent).toContain("ICCS to LSK: 12 min walk, 10 min gap");
    expect(list.textContent).not.toContain("BUCH");
    expect(screen.getByRole("button", { name: /Export to calendar/ })).toBeTruthy();
  });
});
