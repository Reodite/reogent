import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataWriter } from "./core/types";

const dataPath = () => process.env.DATA_PATH || path.join(process.cwd(), "data");
export { dataPath };

/** Filesystem-backed data store implementing DataWriter interface. */
export function dataStore(): DataWriter {
  const root = dataPath();
  return {
    async getJson(key) {
      const content = await readFile(path.join(root, key), "utf-8");
      return JSON.parse(content);
    },
    async putJson(key, value) {
      const filePath = path.join(root, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(value));
    },
  };
}
