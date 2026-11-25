import { describe, expect, it } from "vitest";
import { filterValue } from "./filter";

describe("filterValue", () => {
  it("quotes plain values", () => {
    expect(filterValue("CPSC_V 110")).toBe("'CPSC_V 110'");
  });

  it("escapes quotes and drops backslashes so input stays inside the literal", () => {
    expect(filterValue("x' OR session = '2024W")).toBe("'x\\' OR session = \\'2024W'");
    // A trailing backslash would otherwise escape the escape and close the literal.
    expect(filterValue("\\' OR faculty != \\")).toBe("'\\' OR faculty != '");
  });
});
