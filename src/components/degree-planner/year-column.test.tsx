/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Year } from "./planner-store";
import { YearColumn } from "./year-column";

const { toggleSummer } = vi.hoisted(() => ({ toggleSummer: vi.fn() }));

vi.mock("./planner-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./planner-store")>();
  return {
    ...actual,
    usePlanner: (selector: (state: { toggleSummer: typeof toggleSummer }) => unknown) => selector({ toggleSummer }),
  };
});

vi.mock("./term-section", () => ({
  TermSection: ({ term }: { term: { season: string } }) => <div data-testid={`term-${term.season}`} />,
}));

const winterYear: Year = {
  id: "year-1",
  label: "Year 1",
  terms: [
    { season: "w1", kind: "study", blocks: [] },
    { season: "w2", kind: "study", blocks: [] },
  ],
};

const summerYear: Year = {
  ...winterYear,
  terms: [
    ...winterYear.terms,
    { season: "s1", kind: "study", blocks: [] },
    { season: "s2", kind: "study", blocks: [] },
  ],
};

const defaultProps: Omit<ComponentProps<typeof YearColumn>, "year"> = {
  courseIndex: new Map(),
  validations: new Map(),
};

afterEach(() => {
  cleanup();
  toggleSummer.mockReset();
});

describe("YearColumn summer terms", () => {
  it("includes only winter terms when summer is disabled", () => {
    render(<YearColumn {...defaultProps} year={winterYear} />);

    expect(screen.getAllByTestId(/^term-/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add summer session" })).toBeTruthy();
  });

  it("includes both summer terms when summer is enabled", () => {
    render(<YearColumn {...defaultProps} year={summerYear} />);

    expect(screen.getAllByTestId(/^term-/)).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Remove summer session" })).toBeTruthy();
  });

  it("toggles summer for the current year", () => {
    render(<YearColumn {...defaultProps} year={winterYear} />);

    fireEvent.click(screen.getByRole("button", { name: "Add summer session" }));

    expect(toggleSummer).toHaveBeenCalledWith("year-1");
  });
});
