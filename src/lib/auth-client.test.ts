import { describe, expect, it } from "vitest";

describe("JWT expiry check logic", () => {
  function isExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return typeof payload.exp === "number" && payload.exp < Date.now() / 1000;
    } catch {
      return false;
    }
  }

  function makeToken(exp: number): string {
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "u1", exp }));
    return `${header}.${payload}.fakesig`;
  }

  it("detects expired tokens", () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 3600);
    expect(isExpired(expiredToken)).toBe(true);
  });

  it("accepts valid tokens", () => {
    const validToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
    expect(isExpired(validToken)).toBe(false);
  });

  it("treats tokens without exp as not expired", () => {
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "u1" }));
    const token = `${header}.${payload}.fakesig`;
    expect(isExpired(token)).toBe(false);
  });

  it("handles malformed tokens without crashing", () => {
    expect(isExpired("not-a-jwt")).toBe(false);
    expect(isExpired("")).toBe(false);
    expect(isExpired("a.b.c")).toBe(false);
  });
});

describe("redirect URL validation", () => {
  function isValidRedirect(url: string): boolean {
    return url.startsWith("/") && !url.startsWith("//");
  }

  it("accepts relative paths", () => {
    expect(isValidRedirect("/chat")).toBe(true);
    expect(isValidRedirect("/chat/abc-123")).toBe(true);
    expect(isValidRedirect("/")).toBe(true);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isValidRedirect("//evil.com")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isValidRedirect("https://evil.com")).toBe(false);
    expect(isValidRedirect("javascript:void(0)")).toBe(false);
    expect(isValidRedirect("")).toBe(false);
  });
});
