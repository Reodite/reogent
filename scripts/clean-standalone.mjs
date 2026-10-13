import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

// Next copies loaded environment files independently of output trace exclusions.
const output = ".next/standalone";
for (const file of await readdir(output)) {
  if (file.startsWith(".env")) await unlink(join(output, file));
}
