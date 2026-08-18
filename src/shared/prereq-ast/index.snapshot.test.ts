import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/prereq-strings.json";
import { displayExpr, parsePrereq } from "./index";
import { walkCodeLeaves } from "./walk";

/** Locks the ported parser's output on a donor-derived fixture corpus so edits
 * to the verbatim copy are caught by snapshot drift. */
describe("prereq parser fixture baseline", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: parser display + code set is stable`, () => {
      const expr = parsePrereq(fixture.input);
      const summary = {
        display: expr ? displayExpr(expr) : null,
        codes: expr
          ? walkCodeLeaves(expr)
              .map((l) => l.leaf.code)
              .sort()
          : [],
      };
      expect(summary).toMatchSnapshot();
    });
  }
});
