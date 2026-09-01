// Refresh the COGS "module courses" categories in program_requirements.json
// from the scraper's cogs_module_courses dataset (produced by the cogsmodules
// collector in ubc-unified-data from cogsys.ubc.ca/module-courses).
//
// Filters to active modules that exist in the current course catalog, applies
// the per-stream exclusions the list itself states, and rewrites the five
// stream categories in place. Run after each scrape refresh.
import fs from "node:fs";
import path from "node:path";
import { CAL_DIR, ROOT, validCodes } from "./lib.mjs";

const datasetPath = path.join(CAL_DIR, "cogs_module_courses.json");
if (!fs.existsSync(datasetPath)) {
  console.error(
    "cogs_module_courses.json not found — run the ubc-unified-data 'calendar' collector first (src/collectors/cogsmodules.ts).",
  );
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const catalog = validCodes();
const modules = dataset.filter((r) => r.active && catalog.has(r.code)).map((r) => r.code);

const fetchedAt = new Date().toISOString().slice(0, 10);
const SOURCE = `Course list from cogsys.ubc.ca/module-courses via the ubc-unified-data cogsmodules collector (refreshed ${fetchedAt}; the program revises it annually).`;

// Per-stream floors (display-only — the option schema has ceilings, not
// floors) and exclusions stated on the module list itself.
const STREAMS = {
  "arts-cognitive-systems-cognition-and-brain-stream": {
    exclude: [],
    note: "At least 6 credits must be PSYC or NSCI module courses and at least 6 credits non-PSYC module courses (floor constraints — shown, not enforced).",
  },
  "arts-cognitive-systems-language-stream": {
    exclude: [],
    note: "At least 6 credits must be LING and at least 6 credits non-LING module courses (floor constraints — shown, not enforced).",
  },
  "arts-cognitive-systems-mind-language-and-computation-stream": {
    exclude: [],
    note: "12 credits suffice if 6 credits of PSYC 324+344 were used for the Psychology upper-level requirement.",
  },
  "sci-cognitive-systems-cognition-and-brain": {
    exclude: [],
    note: "At least 6 credits must be PSYC or NSCI module courses (floor constraint — shown, not enforced).",
  },
  "sci-cognitive-systems-computational-intelligence-and-design": {
    exclude: ["CPSC 320", "CPSC 322"],
    note: "At least 3 credits must be 400-level CPSC module courses (floor constraint — shown, not enforced). CPSC 320/322 are excluded for this stream per the module list.",
  },
};

const ovPath = path.join(ROOT, "public/data/program_requirements.json");
const ov = JSON.parse(fs.readFileSync(ovPath, "utf8"));
let updated = 0;
for (const [id, cfg] of Object.entries(STREAMS)) {
  const cat = ov[id]?.categories.find((c) => /module course/i.test(c.name));
  if (!cat) {
    console.error("no module category for", id);
    continue;
  }
  cat.options = [{ rule: { kind: "course_list", courses: modules.filter((c) => !cfg.exclude.includes(c)) } }];
  cat.notes = `${cfg.note} ${SOURCE}`;
  updated++;
}
fs.writeFileSync(ovPath, JSON.stringify(ov, null, 1));
console.log("module courses:", modules.length, "| stream categories updated:", updated);
