import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, proxy } from "./proxy";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `));

describe("page Content-Security-Policy", () => {
  it("allows scripts only by nonce in production", () => {
    const script = directive(contentSecurityPolicy("abc"), "script-src");
    expect(script).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });

  it("adds eval only for the development server", () => {
    expect(directive(contentSecurityPolicy("abc", true), "script-src")).toContain("'unsafe-eval'");
  });

  it("issues a fresh nonce per request and forwards it to rendering", () => {
    const nonces = [1, 2].map(() => {
      const response = proxy(new Request("http://localhost/app") as never);
      const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];
      expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
      return nonce;
    });
    expect(nonces[0]).toBeTruthy();
    expect(nonces[0]).not.toBe(nonces[1]);
  });
});
