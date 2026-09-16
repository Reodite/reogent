// Shared paths + the catalog-valid course-code set for the degree-data scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAL_DIR = path.join(ROOT, "ubc-unified-data/data/academic-calendar/vancouver");

/** Canonical "SUBJ 123" codes present in the current course catalog. */
export function validCodes() {
  const subjects = JSON.parse(fs.readFileSync(path.join(CAL_DIR, "subjects.json"), "utf8"));
  const courses = JSON.parse(fs.readFileSync(path.join(CAL_DIR, "courses.json"), "utf8"));
  const subjById = new Map(subjects.map((s) => [s.id, s.name.replace(/_V$/, "")]));
  const codes = new Set();
  for (const c of courses) {
    const subj = subjById.get(c.related?.course_code);
    const num = (c.field_computed_course_number ?? "").trim();
    if (subj && /^\d{3}[A-Z]?$/.test(num)) codes.add(`${subj} ${num}`);
  }
  return codes;
}
