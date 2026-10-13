# Degree-planner data

The planner reads checked-in files under `public/data/`. Preserve the distinction between collected facts, deterministic derivations, and interpretations of source prose.

## Sources and outputs

| Layer                 | Files                                                                     | Maintenance                                                                                     |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Collected             | `ubc-unified-data/data/academic-calendar/vancouver/`                      | Refresh through the submodule's collectors                                                      |
| Derived               | `public/data/subject_faculties.json`                                      | `derive-subject-faculties.mjs`                                                                  |
| Source-backed overlay | COGS module categories in `public/data/program_requirements.json`         | `cogs-modules-overlay.mjs`; retain only active, catalog-valid courses and per-stream exclusions |
| Curated               | `program_registry.json`, `degree_rules.json`, `program_requirements.json` | Review against linked calendar/policy prose and preserve provenance notes                       |

The COGS overlay reads `cogs_module_courses.json` from the calendar data directory. Collection can fail behind the source site's bot challenge; inspect the producer's unavailable records rather than treating missing data as an empty course list.

## Refresh and validate

Run from the repository root after updating source data:

```bash
node scripts/degree-data/derive-subject-faculties.mjs
node scripts/degree-data/cogs-modules-overlay.mjs
node scripts/degree-data/validate.mjs registry public/data/program_registry.json
node scripts/degree-data/validate.mjs overlay public/data/program_requirements.json
```

The first two commands rewrite derived/overlay files. Review the diff before committing. The validator checks structure and catalog references; it does not establish that a curated interpretation matches degree policy. Review known exceptions in `data/review_queue.json` and investigate new findings rather than accepting them as inherited exceptions.

These scripts do not regenerate the curated degree registry, faculty rules, or full requirement interpretations from scratch. The extraction workflow is not checked in. Preserve source URLs and notes when editing those files, and verify the result against the published policy.

`public/data/degree_programs.json` includes hand-recovered Dental Hygiene and Urban Forestry records. Preserve them until refreshed source data supplies verified replacements; do not overwrite them solely because a collector omitted those program roots.
