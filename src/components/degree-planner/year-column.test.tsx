/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, HTMLAttributes, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Year } from "./planner-store";
import { YearColumn } from "./year-column";

const { toggleSummer, summerMotion, reducedMotion } = vi.hoisted(() => ({
  toggleSummer: vi.fn(),
  summerMotion: vi.fn(),
  reducedMotion: vi.fn(() => false),
}));

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

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: PropsWithChildren<
      HTMLAttributes<HTMLDivElement> & {
        initial?: unknown;
        animate?: unknown;
        exit?: unknown;
        transition?: unknown;
      }
    >) => {
      summerMotion({ initial, animate, exit, transition });
      return <div {...props}>{children}</div>;
    },
  },
  useReducedMotion: reducedMotion,
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
  summerMotion.mockClear();
  reducedMotion.mockReturnValue(false);
});

describe("YearColumn summer layout", () => {
  it("lets winter terms occupy the column until summer is added", () => {
    const { container } = render(<YearColumn {...defaultProps} year={winterYear} />);

    expect(screen.getAllByTestId(/^term-/)).toHaveLength(2);
    expect(container.querySelector("[data-summer-terms]")).toBeNull();
    expect(screen.getByRole("button", { name: "Add summer session" })).toBeTruthy();
  });

  it("groups summer terms into the animated region", () => {
    const { container } = render(<YearColumn {...defaultProps} year={summerYear} />);

    expect(screen.getAllByTestId(/^term-/)).toHaveLength(4);
    expect(container.querySelector("[data-summer-terms]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove summer session" })).toBeTruthy();
  });

  it("propagates minimum content height through the year and winter ancestors", () => {
    const { container } = render(<YearColumn {...defaultProps} year={winterYear} />);
    const year = container.querySelector("section");
    const winter = screen.getByTestId("term-w1").parentElement;
    const body = winter?.parentElement;

    expect(year?.classList.contains("[--planner-term-min:16rem]")).toBe(true);
    expect(year?.classList.contains("h-full")).toBe(true);
    for (const ancestor of [year, body, winter]) {
      expect(ancestor?.classList.contains("min-h-min")).toBe(true);
      expect(ancestor?.classList.contains("min-h-0")).toBe(false);
    }
    expect(body?.classList.contains("flex-1")).toBe(true);
    expect(winter?.classList.contains("flex-1")).toBe(true);
  });

  it.each([false, true])("animates the two-term summer floor with reduced motion %s", (reduce) => {
    reducedMotion.mockReturnValue(reduce);
    const { container } = render(<YearColumn {...defaultProps} year={summerYear} />);
    const summer = container.querySelector<HTMLElement>("[data-summer-terms]");

    expect(summer?.style.minHeight).toBe("calc(var(--summer-open, 1) * (2 * var(--planner-term-min) + 0.5rem))");
    for (const token of ["[contain:size]", "basis-0", "overflow-hidden", "gap-2"]) {
      expect(summer?.classList.contains(token), token).toBe(true);
    }
    expect(summer?.classList.contains("min-h-0")).toBe(false);
    expect(summer?.children).toHaveLength(2);
    expect(summerMotion).toHaveBeenLastCalledWith({
      initial: reduce ? false : { opacity: 0, flexGrow: 0, marginTop: 0, "--summer-open": 0 },
      animate: { opacity: 1, flexGrow: 1, marginTop: 8, "--summer-open": 1 },
      exit: { opacity: 0, flexGrow: 0, marginTop: 0, "--summer-open": 0 },
      transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    });
  });

  it("toggles summer for the current year", () => {
    render(<YearColumn {...defaultProps} year={winterYear} />);

    fireEvent.click(screen.getByRole("button", { name: "Add summer session" }));

    expect(toggleSummer).toHaveBeenCalledWith("year-1");
  });
});
