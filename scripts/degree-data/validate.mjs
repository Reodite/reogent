// Machine validator for the degree-planner data files. Usage:
//   node validate.mjs registry public/data/program_registry.json
//   node validate.mjs overlay  public/data/program_requirements.json
// Known-accepted overlay flags (documented in data/review_queue.json): stale
// calendar codes that no longer exist in the catalog, and alternative-track
// categories whose credits sum above the program total.
import fs from "node:fs";
import { validCodes as loadCodes } from "./lib.mjs";

const validCodes = loadCodes();
const validSubjects = new Set(Array.from(validCodes).map((c) => c.split(" ")[0]));
const [mode, file] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];

if (mode === "registry") {
  const ids = new Set();
  for (const e of data) {
    if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) errors.push(`bad id: ${JSON.stringify(e.id)} (${e.title})`);
    if (ids.has(e.id)) errors.push(`duplicate id: ${e.id}`);
    ids.add(e.id);
    if (!e.url?.startsWith("https://vancouver.calendar.ubc.ca/")) errors.push(`${e.id}: bad url ${e.url}`);
    if (!e.title) errors.push(`${e.id}: missing title`);
    if (!["major", "honours", "combined_major", "minor", "stream", "certificate", "diploma", "degree"].includes(e.kind))
      errors.push(`${e.id}: bad kind ${e.kind}`);
  }
} else if (mode === "overlay") {
  for (const [id, req] of Object.entries(data)) {
    if (req.total_credits != null && (typeof req.total_credits !== "number" || req.total_credits < 1 || req.total_credits > 300))
      errors.push(`${id}: implausible total_credits ${req.total_credits}`);
    let catSum = 0;
    for (const cat of req.categories ?? []) {
      if (typeof cat.credits_required !== "number" || cat.credits_required < 0 || cat.credits_required > 200)
        errors.push(`${id} / ${cat.name}: bad credits_required ${cat.credits_required}`);
      catSum += cat.credits_required || 0;
      for (const opt of cat.options ?? []) {
        if (opt.code && !validCodes.has(opt.code)) errors.push(`${id} / ${cat.name}: unknown course ${opt.code}`);
        if (opt.subject_pattern) {
          const subj = opt.subject_pattern.split(" ")[0];
          if (!validSubjects.has(subj)) errors.push(`${id} / ${cat.name}: unknown subject in pattern ${opt.subject_pattern}`);
        }
        if (!opt.code && !opt.subject_pattern && !opt.rule)
          errors.push(`${id} / ${cat.name}: option with no code/subject_pattern/rule`);
        if (opt.rule && !["faculty_credit", "level_credit", "course_list"].includes(opt.rule.kind))
          errors.push(`${id} / ${cat.name}: unknown rule kind ${opt.rule?.kind}`);
      }
    }
    if (req.total_credits && catSum > req.total_credits * 1.5)
      errors.push(`${id}: category credits sum ${catSum} >> total ${req.total_credits}`);
  }
} else {
  console.error("unknown mode");
  process.exit(2);
}

if (errors.length) {
  console.log(errors.join("\n"));
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log("OK");
