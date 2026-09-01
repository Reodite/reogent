# Degree-planner data pipeline

`public/data/*` is derived from **ubc-unified-data** (vendored at
`./ubc-unified-data`), which is the single source of raw truth. Three layers:

## 1. Raw (ubc-unified-data collectors)

- `data/academic-calendar/vancouver/` — calendar pages, programs, courses,
  subjects, faculties. Produced by the `calendar` collector.
- `cogs_module_courses.json` — the COGS module-course list from
  cogsys.ubc.ca (off-calendar, revised annually). Produced by
  `src/collectors/cogsmodules.ts`; the site sits behind a bot challenge, so a
  failed fetch is recorded in `_unavailable.json` rather than failing the run.

Two scraper fixes live upstream in `src/calendarpages.ts` (sync to
Reodite/ubc-unified-data): "X Degree Program"-titled roots (Dental Hygiene)
and cross-alias-tree program resolution (Urban Forestry). Until a scrape
re-runs with them, `public/data/degree_programs.json` carries those two
records hand-recovered from `pages.json`.

## 2. Derived — deterministic (these scripts)

- `derive-subject-faculties.mjs` → `public/data/subject_faculties.json`
- `cogs-modules-overlay.mjs` → refreshes the five COGS module categories in
  `public/data/program_requirements.json` (active + catalog-valid courses only)
- `validate.mjs` → sanity gate for `program_registry.json` and
  `program_requirements.json`

Run after each scrape refresh, then validate.

## 3. Curated — judgment over prose (agent pipeline, 2026-08-31)

- `program_registry.json` — 398 selectable programs, classified from calendar
  records (opus classifiers + reconciler; deterministic fixes applied).
- `degree_rules.json` — faculty-wide rules per degree container (BA/BFA/BSc/
  BASc/BCom/BKin), encoded from policy pages.
- `program_requirements.json` — structured requirements per program
  (opus extract → sonnet adversarial verify → opus repair, per calendar page).

These are interpretations of prose, not scrape facts — they carry provenance
in their notes and their known issues in `data/review_queue.json`. To
regenerate, re-run the extraction workflows (see the
`degree-planner-data-limits` project memory) against a fresh scrape, then
`validate.mjs`.
