import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthMode } from "./auth-mode";

afterEach(() => vi.unstubAllEnvs());

describe("getAuthMode", () => {
  it.each([undefined, "", "true", "yes", "0"])("defaults to OAuth for USE_OAUTH=%s", (value) => {
    vi.stubEnv("USE_OAUTH", value ?? "");
    expect(getAuthMode()).toBe("oauth");
  });

  it.each(["false", " FALSE ", "False"])("selects password mode for USE_OAUTH=%s", (value) => {
    vi.stubEnv("USE_OAUTH", value);
    expect(getAuthMode()).toBe("password");
  });
});
