import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("deployment security defaults", () => {
  it("keeps the development origin allowlist closed", () => {
    expect(nextConfig.allowedDevOrigins ?? []).not.toContain("*");
  });

  it("sets framing, MIME, and referrer protections", async () => {
    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries(
      (rules?.find((rule) => rule.source === "/:path*")?.headers ?? []).map(({ key, value }) => [key, value]),
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("binds database and search ports to loopback and requires credentials", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toContain('"127.0.0.1:5432:5432"');
    expect(compose).toContain('"127.0.0.1:7700:7700"');
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:-|MEILI_MASTER_KEY:-/);
    expect(compose).toContain("${POSTGRES_PASSWORD:?");
    expect(compose).toContain("${MEILI_MASTER_KEY:?");
  });

  it("runs the application container without root privileges", () => {
    const runner = read("Dockerfile").split("AS runner")[1];
    expect(runner).toContain("USER node");
  });

  it("excludes environment variants from container build contexts", () => {
    expect(read(".dockerignore").split("\n")).toContain(".env*");
  });
});
