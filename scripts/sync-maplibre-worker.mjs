// Copies MapLibre's worker and shared modules into public/ so the Web Worker
// can be spawned at a stable URL. Turbopack emits them as hashed assets, but
// the worker file's inner import (`./maplibre-gl-shared.mjs`) can't resolve to
// a hashed filename. Without this, the worker spawn fails with a text/html
// MIME error and no basemap tiles render.
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const dest = resolve("public");
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(resolve("node_modules/maplibre-gl/dist", file), resolve(dest, file));
}
