import fixture from "@/__fixtures__/food-outlets.json";
import { describe, expect, it } from "vitest";
import { transformFood } from "./food";

describe("transformFood", () => {
  it("keeps the outlet blurb without the breadcrumb, repeated title, or trailing read-more", () => {
    const [kyros, browns] = fixture.map(transformFood);
    expect(kyros?.id).toBe("22339");
    expect(kyros?.doc.name).toBe("Kyros Kitchen");
    expect(kyros?.doc.url).toBe("https://food.ubc.ca/places/kyros-kitchen/");
    expect(kyros?.doc.text.startsWith("Born from a passion")).toBe(true);
    expect(kyros?.doc.text).toContain("Residence Meal Plans");
    expect(kyros?.doc.text).not.toMatch(/Read more$/);
    expect(browns?.doc.text.startsWith("Our UBC crafthouse")).toBe(true);
  });

  it("skips rows without an id or title", () => {
    expect(transformFood({ title: { rendered: "" }, id: 1 })).toBeNull();
    expect(transformFood({ title: { rendered: "X" } })).toBeNull();
  });
});
