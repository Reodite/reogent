// public/data/subject_faculties.json <- ubc-unified-data subjects + faculties.
// Subject code (no _V) -> owning faculty display name; drives the planner's
// faculty_credit rules ("12 Arts credits" etc.).
import fs from "node:fs";
import path from "node:path";
import { CAL_DIR, ROOT } from "./lib.mjs";

const subjects = JSON.parse(fs.readFileSync(path.join(CAL_DIR, "subjects.json"), "utf8"));
const faculties = JSON.parse(fs.readFileSync(path.join(CAL_DIR, "faculties.json"), "utf8"));

const facById = new Map(faculties.map((f) => [f.id, f.name]));
// WRIT (School of Journalism, Writing and Media) carries no faculty link in
// the taxonomy; EXCH/EXGR are exchange placeholders with no faculty at all.
const HAND_MAP = { WRIT: "Faculty of Arts" };
const DROP = new Set(["EXCH", "EXGR"]);

const out = {};
for (const s of subjects) {
  const name = s.name.replace(/_V$/, "");
  if (DROP.has(name)) continue;
  const fac = facById.get(s.related?.tax_subject_faculty) ?? HAND_MAP[name] ?? null;
  if (fac) out[name] = fac;
}
fs.writeFileSync(path.join(ROOT, "public/data/subject_faculties.json"), JSON.stringify(out, null, 1));
console.log("subject_faculties.json:", Object.keys(out).length, "subjects");
