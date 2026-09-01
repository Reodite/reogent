// @vitest-environment happy-dom

import type { Person } from "@/src/lib/schedule/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeoplePanel } from "./people-panel";

const people: Person[] = [
  {
    id: "u1",
    handle: "ada",
    avatar: { kind: "initials", initials: "A", color: "#6ea8fe" },
    schedule: { sections: [], importedAt: "2026-09-01T00:00:00.000Z" },
    updatedAt: "2026-09-01T00:00:00.000Z",
    enabled: true,
  },
  {
    id: "u2",
    handle: "grace",
    avatar: { kind: "initials", initials: "G", color: "#ffb46b" },
    schedule: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    enabled: false,
  },
];

afterEach(cleanup);

describe("PeoplePanel", () => {
  it("uses flat visible checkboxes and toggles the whole labeled row", () => {
    const onToggle = vi.fn();
    const view = render(<PeoplePanel people={people} meId="u1" onToggle={onToggle} onEnableAll={vi.fn()} />);

    expect(view.container.querySelector(".neu-panel")).toBeNull();
    const grace = view.getByRole("checkbox", { name: "Show grace on the calendar" });
    expect((grace as HTMLInputElement).checked).toBe(false);
    fireEvent.click(grace);
    expect(onToggle).toHaveBeenCalledWith("u2", true);
    expect(view.getByRole("button", { name: "Show all" })).toBeTruthy();
  });
});
