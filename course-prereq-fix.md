# Task: author a complete prerequisite catalog for the prerequisite tree

Work in `D:/Documents/AI Projects/Reogent`. Read `AGENTS.md` and the applicable installed Next.js guides before editing.

## Goal

Create a **manually authored, static catalog of course requirement rules**. Make both prerequisite-tree implementations look up those rules by course code instead of deriving them from prose with `parsePrereq`.

Read the descriptions yourself and write their logical meaning as structured data. Use scripts for inventory, batching, validation, and serialization. **Do not generate the rules with another regex parser or build an LLM extraction pipeline.**

The scope includes catalog authoring, a shared lookup contract, and prerequisite-tree integration. Preserve raw descriptions. Keep planner eligibility changes outside this task unless compatibility requires them, and report any remaining parser consumers.

## 1. Establish the source inventory

Inspect these files:

- `ubc-unified-data/data/academic-calendar/vancouver/courses.json`
- `ubc-unified-data/data/academic-calendar/vancouver/subjects.json`
- `ubc-unified-data/data/courses/courses.json`
- `src/server/modules/courses.ts`, especially `joinCourses`
- `src/shared/course-index.ts`
- `app/api/course-index/route.ts`
- `src/shared/prereq-ast/index.ts`
- `src/components/prereq-tree/build-graph.ts`
- `src/server/prereq/build-graph.ts`

Build the inventory using the application's current course inclusion and source-precedence rules. Recalculate coverage from the current files rather than relying on previously reported counts.

**Read the complete original descriptions:**

- Calendar: `field_course_description`
- Schedule fallback: `body`

The derived `prerequisite` and `corequisite` fields are comparison aids, not authoritative inputs. Their extractor sometimes mistakes recommended prerequisites for mandatory ones and discards subsequent requirements.

Review courses with empty derived prerequisite fields too. Their descriptions can contain unlabeled requirements or enrollment restrictions.

## 2. Define a lossless rule format

Choose the smallest structured format that represents the source requirements. Reuse suitable existing types, but extend the model where necessary.

It must support:

- Nested AND and OR groups.
- At-least-N course selections.
- Credit totals, including subject and level restrictions.
- Minimum grades attached to the correct courses or groups.
- Earlier-term requirements and permitted same-term enrollment.
- Branch-specific corequisites.
- Standing, program membership, permission, placement, and other non-course conditions.
- Recommendations and credit exclusions, separate from mandatory requirements.
- Explicit unresolved conditions with supporting source text.

Preserve course references even when the local catalog lacks that course. Keep Okanagan and external qualifications distinguishable from Vancouver courses; their absence from the tree's expandable catalog does not erase them as alternatives.

The existing AST contains rendering concerns and cannot express some of these semantics. Keep the authored meaning intact rather than flattening it to fit existing widgets.

Each course record must include:

- Canonical course identity.
- Structured mandatory requirements.
- Recommendations and exclusions when present.
- Source identifier and a hash of the source description used.
- Supporting source passages.
- Review status and any unresolved interpretation.

Distinguish **reviewed with no requirements listed**, **reviewed with unresolved conditions**, and **not yet reviewed**. A missing record must not mean "no prerequisites."

## 3. Author the entire catalog

Work through the inventory in manageable batches. Maintain a resumable ledger of completed and pending course codes.

For each course:

1. Read the complete description.
2. Identify mandatory requirements, recommendations, exclusions, and explanatory notes.
3. Translate the requirements into structured rules.
4. Check the grouping, quantities, grade scope, and enrollment timing against the source.
5. Record supporting passages and genuine ambiguities.
6. Mark the course reviewed only after that check.

Reuse identical structures after confirming that the source conditions match. Preserve course-specific qualifications.

Examples of the intended meaning:

```text
CHBE 346
  Required: CHBE 244 AND MATH 253
  Recommended: MATH 256

VISA 220
  Required: at least two of VISA 110, VISA 180, VISA 183
  Minimum grade: 72% in each counted course

EPSE 481
  Required: EPSE 482 completed earlier or taken concurrently
```

Recheck these examples against the current source before authoring them.

Use unresolved conditions for genuine ambiguity, contradictory wording, or unavailable referenced policies. Recognizable requirements such as "two of" or minimum grades should receive structured representations.

## 4. Wire the prerequisite tree to catalog lookups

Provide one authoritative catalog and a shared lookup contract. Follow the repository's static-data conventions and avoid maintaining separate client and server copies by hand.

Update both:

- `src/components/prereq-tree/build-graph.ts`
- `src/server/prereq/build-graph.ts`

Trace their callers and the course-index loading path. Ensure transitive expansion looks up the authored rules for each referenced course.

Requirements for integration:

- Remove runtime prose parsing from prerequisite-tree construction.
- Preserve source text for inspection.
- Show explicit states for missing or unresolved rules.
- Render recommendations as optional and concurrency as concurrency.
- Keep credit exclusions out of prerequisite edges.
- Show quantities and grade qualifiers.
- Represent a two-of-three requirement faithfully rather than using a one-choice dropdown.

Where the existing UI lacks an appropriate interaction, use a faithful noninteractive requirement display while retaining the full structured rule. Avoid unrelated visual redesign.

## 5. Add source-derived regression cases

Cover at least these known failure patterns, using current source descriptions:

| Courses            | Interpretation to check                                               |
| ------------------ | --------------------------------------------------------------------- |
| CHBE 346, CPEN 455 | Recommended prerequisites precede the mandatory prerequisite section. |
| STAT 416           | "Both" means both courses are required.                               |
| COMM 453           | Comma-separated mandatory courses retain both requirements.           |
| CPSC 340           | Adjacent labeled groups retain all required groups.                   |
| CPSC 415           | Grade-qualified alternatives preserve each group and its threshold.   |
| VISA 220           | Two qualifying courses are necessary.                                 |
| ECON 305           | Repeated grade-qualified clauses retain their separate requirements.  |
| BIOC 403           | A recommended grade does not make the required course optional.       |
| BIOC 306           | Corequisites belong to their respective alternative branches.         |
| EPSE 481, ELEC 321 | Concurrent-enrollment wording preserves timing and alternatives.      |
| FNH 161, CPEN 355  | Credit-exclusion prose creates no prerequisite edges.                 |
| EPSE 635           | `CNPS_V362` remains a Vancouver course reference.                     |

Test logical structure and graph output. Checking only the set of referenced course codes cannot detect incorrect AND/OR grouping.

## 6. Validate coverage and correctness

Leave a runnable catalog validator that checks:

- Coverage against the current application course inventory.
- Record shape and allowed rule types.
- Canonical identifiers and duplicate records.
- Valid quantities and grade values.
- Source hashes and supporting passages.
- Missing references and suspicious self-dependencies.
- Counts of reviewed, unresolved, and pending records.

Treat suspicious findings as review items rather than deleting them automatically.

Review authored rules against their original descriptions throughout the work. Automated validation cannot prove that an interpretation is correct.

Run relevant tests, type checking, lint, and formatting checks. Exercise both tree-building paths with catalog-backed requirements and confirm that neither falls back to regex parsing.

## Completion criteria

Deliver:

1. The complete authored catalog and shared lookup.
2. Client and server prerequisite trees consuming it.
3. Coverage validation and regression tests.
4. A precise list of unresolved source conditions and remaining non-tree parser consumers.

Finish the inventory rather than stopping after the regression examples. Preserve unrelated working-tree changes and commit coherent units according to `AGENTS.md`.

Report measured coverage and verification results. Claim complete review only when no unread course records remain.
