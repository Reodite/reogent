import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "./auth-redirect";

describe("safeAuthRedirect", () => {
  it("preserves a local destination, query, and fragment", () => {
    expect(safeAuthRedirect("/tools/courses?q=math#results")).toBe("/tools/courses?q=math#results");
  });

  it.each([
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/login",
    "/signup?redirect=/chat",
    "/onboarding",
    "/onboarding/",
    "javascript:alert(1)",
  ])("rejects external or looping destinations: %s", (value) => {
    expect(safeAuthRedirect(value)).toBe("/chat");
  });
});
