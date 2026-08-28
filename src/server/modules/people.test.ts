import fixture from "@/__fixtures__/people-profiles.json";
import { describe, expect, it } from "vitest";
import { transformPerson } from "./people";

describe("transformPerson", () => {
  it("maps a real profile, builds the URL from host + alias, and nulls blank fields", () => {
    const [noOffice, withOffice] = fixture.map(transformPerson);
    expect(noOffice?.doc).toMatchObject({
      name: "Susan Allen",
      email: "sallen@science.ubc.ca",
      office: null,
      unit: "science.ubc.ca",
      url: "https://science.ubc.ca/directory/profile/susan-allen",
    });
    expect(withOffice?.doc.office).toBe("CEME 1214");
    expect(withOffice?.id).toBe(fixture[1].id);
  });

  it("skips rows without an id or name", () => {
    expect(transformPerson({ id: "x", title: "  " })).toBeNull();
    expect(transformPerson({ title: "No Id" })).toBeNull();
  });
});
