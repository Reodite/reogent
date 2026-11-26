import { describe, expect, it } from "vitest";
import { getOAuthProvider } from "./providers";

describe("OAuth provider registry", () => {
  it("resolves the configured Google adapter", () => {
    expect(getOAuthProvider("google")).toMatchObject({ id: "google" });
  });

  it("rejects provider IDs that are not registered", () => {
    expect(getOAuthProvider("unknown")).toBeUndefined();
  });
});
