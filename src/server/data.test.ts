import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { dataStore } from "./data";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "reodite-data-"));
  vi.stubEnv("DATA_PATH", root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function json(key: string, value: unknown) {
  const file = path.join(root, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

describe("dataset filesystem", () => {
  it("keeps runtime datasets and caches out of application build artifacts", async () => {
    expect(nextConfig.outputFileTracingExcludes?.["/*"]).toEqual(
      expect.arrayContaining(["./data/**/*", "./ubc-unified-data/**/*", "./.cache/**/*"]),
    );
    const ignored = (await readFile(new URL("../../.dockerignore", import.meta.url), "utf8")).split("\n");
    expect(ignored).toEqual(expect.arrayContaining(["data", "ubc-unified-data", ".cache"]));
  });

  it.each(["development", "production"])("reads dataset tables through DATA_PATH in %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const rows = [{ code: "CPSC 110", title: "Synthetic course" }];
    await json("academic-calendar/vancouver/courses.json", rows);
    expect(await dataStore().getJson("academic-calendar/vancouver/courses.json")).toEqual(rows);
  });

  it("reports missing datasets and malformed JSON", async () => {
    await expect(dataStore().getJson("courses.json")).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(path.join(root, "courses.json"), "not JSON");
    await expect(dataStore().getJson("courses.json")).rejects.toThrow(SyntaxError);
  });

  it("uses relative data roots and retains derived artifact writes", async () => {
    vi.stubEnv("DATA_PATH", path.relative(process.cwd(), root));
    await dataStore().putJson("derived/example.json", { value: 1 });
    expect(await dataStore().getJson("derived/example.json")).toEqual({ value: 1 });
  });
});
