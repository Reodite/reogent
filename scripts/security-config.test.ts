import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const composeAvailable = (() => {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function renderCompose(
  env: NodeJS.ProcessEnv,
  external = false,
): Record<string, { ports: { host_ip: string; published: string; target: number }[] }> {
  const files = ["-f", "docker-compose.yml"];
  if (external) files.push("-f", "docker-compose.external.yml");
  return JSON.parse(
    execFileSync("docker", ["compose", ...files, "config", "--format", "json"], {
      cwd: new URL("..", import.meta.url),
      env,
      encoding: "utf8",
    }),
  ).services;
}

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

  it("binds database and search ports to loopback and sets database mode", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toMatch(/"127\.0\.0\.1:\$\{MONGODB_PORT:-27017\}:27017"/);
    expect(compose).toMatch(/"127\.0\.0\.1:\$\{MEILISEARCH_PORT:-7700\}:7700"/);
    expect(compose).toContain("MONGODB_URI:-mongodb://mongo:27017/reodite?replicaSet=rs0");
    expect(compose).not.toMatch(/mongodb:\/\/[^\s]*:[^\s]*@/);
    expect(compose).toMatch(/USE_EXTERNAL_MONGODB=\$\{USE_EXTERNAL_MONGODB:-false\}/);
    expect(compose).toContain("${MEILI_MASTER_KEY:?");
  });

  it.skipIf(!composeAvailable)("resolves default and overridden host ports in Compose config", () => {
    const defaults = { ...process.env };
    delete defaults.MONGODB_PORT;
    delete defaults.MEILISEARCH_PORT;
    const defaultServices = renderCompose(defaults);
    const bindings = (ports: { host_ip: string; published: string; target: number }[]) =>
      ports.map(({ host_ip, published, target }) => ({ host_ip, published, target }));

    expect(bindings(defaultServices.mongo.ports)).toContainEqual({
      host_ip: "127.0.0.1",
      published: "27017",
      target: 27017,
    });
    expect(bindings(defaultServices.meilisearch.ports)).toContainEqual({
      host_ip: "127.0.0.1",
      published: "7700",
      target: 7700,
    });

    const overriddenServices = renderCompose({
      ...defaults,
      MONGODB_PORT: "27018",
      MEILISEARCH_PORT: "17700",
    });
    expect(bindings(overriddenServices.mongo.ports)).toContainEqual({
      host_ip: "127.0.0.1",
      published: "27018",
      target: 27017,
    });
    expect(bindings(overriddenServices.meilisearch.ports)).toContainEqual({
      host_ip: "127.0.0.1",
      published: "17700",
      target: 7700,
    });
  });

  it.skipIf(!composeAvailable)("removes the local Mongo dependency for external deployments", () => {
    const services = renderCompose(
      { ...process.env, USE_EXTERNAL_MONGODB: "true", MONGODB_URI: "mongodb+srv://example.invalid/reodite" },
      true,
    );
    expect(services.app.depends_on).not.toHaveProperty("mongo");
  });

  it("runs the application container without root privileges", () => {
    const runner = read("Dockerfile").split("AS runner")[1];
    expect(runner).toContain("USER node");
  });

  it("excludes environment variants from container build contexts", () => {
    expect(read(".dockerignore").split("\n")).toContain(".env*");
  });
});
