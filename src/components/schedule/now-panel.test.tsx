// @vitest-environment happy-dom

import type { Person } from "@/src/lib/schedule/types";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NowPanel } from "./now-panel";

const person: Person = {
  id: "u1",
  handle: "ada",
  avatar: { kind: "initials", initials: "A", color: "#6ea8fe" },
  schedule: {
    importedAt: "2026-09-01T00:00:00.000Z",
    sections: [
      {
        id: "cpsc-110",
        courseCode: "CPSC_V 110",
        title: "Computation, Programs, and Programming",
        component: "Lecture",
        instructors: [],
        termStart: "2026-09-01",
        termEnd: "2026-12-31",
        meetings: [{ days: ["Mon"], startMin: 540, endMin: 600, raw: "" }],
      },
    ],
  },
  updatedAt: "2026-09-01T00:00:00.000Z",
  enabled: true,
};

afterEach(cleanup);

describe("NowPanel", () => {
  it("renders flat textual status without decorative success or error dots", () => {
    const view = render(<NowPanel people={[person]} now={new Date(2026, 8, 14, 9, 30)} />);

    expect(view.getByText(/In class/)).toBeTruthy();
    expect(view.container.querySelector(".neu-panel")).toBeNull();
    expect(view.container.querySelector(".bg-error,.bg-secondary")).toBeNull();
  });
});
