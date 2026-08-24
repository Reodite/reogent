// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DisjunctionDetailStrip } from "./DisjunctionDetailStrip";

const strip = (
  disjunctions: Parameters<typeof DisjunctionDetailStrip>[0]["disjunctions"],
  selections: Record<string, number> = {},
) => render(<DisjunctionDetailStrip disjunctions={disjunctions} selections={selections} />).container;

describe("DisjunctionDetailStrip (REQ-9.3)", () => {
  it("renders nothing when there are no disjunctions", () => {
    expect(strip([]).firstChild).toBeNull();
  });

  it("shows the selected option's resolved description for each disjunction", () => {
    const c = strip(
      [
        { selectionKey: "CPSC 320::0", path: "0", options: ["Introduction to Logic", "CPSC 121"] },
        { selectionKey: "MATH 200::1", path: "1", options: ["Calculus III", "(not in calendar)"] },
      ],
      { "CPSC 320::0": 0, "MATH 200::1": 1 },
    );
    expect(c.textContent).toContain("0: Introduction to Logic");
    expect(c.textContent).toContain("1: (not in calendar)");
    expect(c.querySelector("[data-disjunction-strip]")).toBeTruthy();
  });

  it("defaults to option index 0 when the selection key is absent (Property 17)", () => {
    const c = strip([{ selectionKey: "CPSC 320::0", path: "0", options: ["First", "Second"] }], {});
    expect(c.textContent).toContain("0: First");
  });

  it("falls back to option 0 then the sentinel when the selected index overruns the options", () => {
    const c = strip([{ selectionKey: "k", path: "0.1", options: ["Only"] }], { k: 99 });
    expect(c.textContent).toContain("0.1: Only");
    expect(
      render(<DisjunctionDetailStrip disjunctions={[{ selectionKey: "k", path: "0", options: [] }]} selections={{}} />)
        .container.textContent,
    ).toContain("(none)");
  });
});
