import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderColorTokensCss } from "../src/shared/color-tokens";

const outputPath = fileURLToPath(new URL("../app/theme-colors.generated.css", import.meta.url));
const expected = renderColorTokensCss();

let current: string | undefined;
try {
  current = readFileSync(outputPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

if (process.argv.includes("--check")) {
  if (current !== expected) {
    console.error("Generated theme colors are stale. Run npm run colors:generate.");
    process.exitCode = 1;
  } else {
    console.log("Generated theme colors are current.");
  }
} else if (current === expected) {
  console.log("Generated theme colors are current.");
} else {
  writeFileSync(outputPath, expected);
  console.log("Generated app/theme-colors.generated.css.");
}
