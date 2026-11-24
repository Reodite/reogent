import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataWriter } from "./core/types";

const dataPath = () => process.env.DATA_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export { dataPath };

/**
 * Filesystem-backed data store rooted at DATA_PATH. The data lives outside the
 * build, so file tracing skips these runtime paths.
 */
export function dataStore(): DataWriter {
  const root = dataPath();
  return {
    async getJson(key) {
      const content = await readFile(path.join(/* turbopackIgnore: true */ root, key), "utf-8");
      return JSON.parse(content);
    },
    async getText(key) {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        await readFile(path.join(/* turbopackIgnore: true */ root, key)),
      );
    },
    async list(key) {
      return (await readdir(path.join(/* turbopackIgnore: true */ root, key))).sort();
    },
    async putJson(key, value) {
      const filePath = path.join(/* turbopackIgnore: true */ root, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(value));
    },
  };
}
