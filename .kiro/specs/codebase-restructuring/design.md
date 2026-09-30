# Design Document: Codebase Restructuring

## Overview

Restructure the existing TypeScript application around its current ownership boundaries. Keep `app/`, `src/components/`, `src/lib/`, `src/server/`, and `src/shared/`; use feature-local modules and the established UI primitives. Avoid a repository-wide directory rename.

This design covers four behavior-preserving changes: neutral ownership for course and pane contracts, a planner model independent of persistence, whole-plan validation outside the component, and an import-review leaf component. The user granted autonomous approval for design, requirements, tasks, implementation, and verification. Commit each verified unit and push before starting the next unit.

Preserve routes, API payloads, localStorage keys and versions, store instances, provider topology, request ordering, and UI markup. The existing `ubc-unified-data` checkout change and the separate document-integration feature remain outside this work.

## Architecture

### Evidence from the current checkout

At `68adc23`, a literal-import scan found 21 source imports in the reverse ownership direction. This scan locates candidates; it does not distinguish type-only imports from emitted JavaScript. Direct inspection established these boundaries:

| Current owner | Consumers or mixed responsibilities | Change |
| --- | --- | --- |
| `app/api/course-index/route.ts` | Client API, planner algorithms, prerequisite graph, planner UI import `CourseIndexEntry` | Move the unchanged DTO to `src/shared/course-index.ts` |
| `src/components/shell/pane-registry.tsx` | Route parsing, walking activation, pane cache import UI-independent types | Move `PaneId`, `PaneState`, `CanvasView` to `src/shared/panes.ts` |
| `src/components/degree-planner/planner-store.ts` | Placement/autofill need constants; co-op needs constructors and invokes the store | Extract `src/lib/planner-model.ts`; keep store actions and persistence in place |
| `src/components/degree-planner/degree-planner-pane.tsx` | Cumulative prerequisite/corequisite validation inside a large rendering component | Extract the existing calculation into `validation.ts` |
| `src/components/schedule-planner/schedule-planner-pane.tsx` | Workday reconciliation, grid coordination, and review-dialog presentation | Extract `planner-import-dialog.tsx` |

Course and pane imports are type-only. Moving them improves ownership, with no claimed bundle-size saving. Planner calculation imports reach runtime store initialization; removing that dependency provides a testable execution-boundary improvement.

### Target dependency direction

- Route handlers consume server operations and shared contracts.
- Feature components consume shared UI primitives, client algorithms, shared contracts, and their own state owners.
- Client algorithms consume other client algorithms and shared contracts; they do not import feature components or route handlers.
- Shared contracts remain independent of React, Next.js, browser storage, and server services.
- The planner store consumes the planner model and co-op calculation. The model and calculation do not import the store.

Keep the current singleton and rendering entrypoints. The planner store can re-export existing model declarations for compatibility, but calculation helpers import the model directly. Do not introduce a second store or a general service layer.

### Migration units

1. Relocate shared contracts and migrate their consumers.
2. Extract the planner model, move co-op application to the store, and enforce the corrected alias-import boundaries with Biome.
3. Extract whole-plan validation into its existing feature-local module.
4. Extract the import-review dialog and complete the final verification gate.

## Components and Interfaces

### Shared course and pane contracts

**Purpose:** Own data declarations independently of application entrypoints.

**Interface:** Preserve the exact existing `CourseIndexEntry`, `PaneId`, `PaneState`, and `CanvasView` declarations. Import them directly from their shared modules. Keep `PaneEntry`, React component registration, labels, icons, and default state in the registry.

**Responsibilities:** The course-index route retains pagination, normalization, sorting, cache, rate limiting, and response headers. The registry retains the current component references and registration order.

### Planner model and persistent store

**Purpose:** Let placement, autofill, and co-op calculations run without loading Zustand or reading localStorage.

**Interface:** Move `Season`, `TermKind`, `SeasonMeta`, `PlannedBlock`, `Term`, `Year`, season metadata/order, credit limits, year limits, year construction, and summer detection to `src/lib/planner-model.ts`. Share the existing ID and study-term construction through named model helpers. Preserve the UUID/random fallback and object construction order.

**Responsibilities:** Keep `usePlanner`, migration, persisted projection, undo/redo, and mutations in `planner-store.ts`. Move `applyCoopSequence` from `src/lib/coop.ts` to that store module. It must still read the current store, call `buildCoopSequence`, and invoke `replaceYears` once. Keep `buildCoopSequence` free of store access. Reuse the model's summer detection and ID generation where the existing helpers implement the same behavior.

### Whole-plan validation

**Purpose:** Separate domain calculation from rendering without changing the calculation.

**Interface:** Add `validatePlan(years, courseIndex, ignoredSet)` to the existing `src/components/degree-planner/validation.ts`. Return the same ordered `Map<string, BlockValidation>`. Accept a null index and return an empty map. The component retains `useMemo` with the existing dependency list.

**Responsibilities:** Preserve earlier-term prerequisite checks, same-or-earlier corequisite checks, duplicate warnings, unknown-course handling, ignored-error details, and completion-set snapshots. Leave parsing frequency and traversal order unchanged in this extraction.

### Planner import dialog

**Purpose:** Own import-review presentation and temporary ambiguous-section choices.

**Interface:** Move `PlannerImportDialog(review, onApply, onClose)` and its private section-option formatter to `src/components/schedule-planner/planner-import-dialog.tsx`.

**Responsibilities:** Preserve JSX, native controls, shared design primitives, names, focus, dismissal, and callback payloads. The parent retains catalog requests, reconciliation, store updates, view changes, and the surrounding `AnimatePresence`. Do not add lazy loading or alter the dialog key or mounting condition.

## Data Models

### Course index and pane state

Keep nullable course fields and canonical course-code behavior. Preserve the extensible `PaneId` union and arbitrary pane-state records. These declarations describe existing contracts; this move adds no new validation or serialization.

### Degree plan

Keep `PersistedPlan` at the store boundary, `reodite-planner` as the storage key, version 2, and the current migration defaults. Keep block/year identifiers, term ordering, ignored IDs, manual completion, and history limits. Do not persist new fields.

### Import review and validation results

Retain `PlannerImportReview`, `ScheduleImportSelection`, and `BlockValidation`. Consumers receive the same shapes, ordering, and object references where the current implementation shares snapshots within a term.

## Correctness Properties

### Property 1: Stable completion snapshots

For any ordered plan with distinct block IDs, each result's `completedBefore` contains exactly the codes in earlier terms, and `completedSameOrBefore` additionally contains the current term's codes. Evaluating later terms leaves earlier snapshots and the input plan unchanged.

**Validates: Requirements 3.2, 3.4**

Use one fast-check property for membership and input preservation together. Separate examples cover null indexes, duplicate warnings, ignored details, and the prerequisite/corequisite distinction.

### Acceptance coverage

| Requirements | Check type | Evidence |
| --- | --- | --- |
| 1.1–1.2, 1.4 | Type/static and integration | Exact declaration comparison, imports, pane route/cache/walking tests |
| 1.3 | Examples and edge cases | Mocked course-index route tests |
| 2.1 | Dependency isolation | Guarded imports that reject Zustand/storage access |
| 2.2–2.3 | Examples and structural comparison | Model construction, store export identity, existing migration tests |
| 2.4–2.5 | Integration | Co-op application and undo tests on the real store |
| 3.1, 3.3, 3.5 | Examples and integration | Direct validation and existing pane tests; unchanged memo dependencies |
| 3.2, 3.4 | Property 1 and examples | Generated term membership plus explicit prerequisite/corequisite cases |
| 4.1–4.5 | Structural and integration | Identical dialog JSX; ambiguous, apply, cancel, and reopen tests |
| 5.1–5.3 | Static-rule negative controls | Temporary prohibited imports fail Biome |
| 5.4–5.5 | Repository gates | Dependency/configuration diff, untouched submodule, tests, lint, typecheck, formatting, build |

## Error Handling

### Course-index loading failure

**Condition:** Search loading rejects or rate limiting refuses the request.
**Response:** Preserve existing status, headers, and error response.
**Recovery:** Retain current retries and caching behavior.

### Invalid or unavailable planner state

**Condition:** Stored input needs migration, an index is unavailable, or co-op would replace an occupied term.
**Response:** Preserve current normalization, empty validation output, and skipped-term behavior.
**Recovery:** Preserve undo/redo and the existing UI messages.

### Incomplete import review

**Condition:** Ambiguous rows lack a choice or no sections match.
**Response:** Keep merge/replace disabled and retain skipped-row explanations.
**Recovery:** Cancellation leaves the schedule unchanged. Reopening after the exit completes and the dialog unmounts starts with fresh temporary choices. Pre-extraction characterization showed that reopening during the exit retains the mounted dialog's choices; preserve that interrupted-exit behavior in this structural change.

## Testing Strategy

### Unit Testing Approach

Run characterization checks against the original owner before extraction. Add course-index route coverage for canonicalization, sorting, pagination, nulls, response headers, and cache reuse. Add planner-store coverage for one-action co-op application and undo. Add direct validation examples and an immutable-input check. Retain the import-dialog integration test and add cancel/reopen coverage before moving its implementation.

Verify model imports without loading Zustand or touching storage using a test that fails if those dependencies load. Prove Biome's restricted-import rules reject a temporary prohibited import, then remove the probe and run lint normally. The rules cover the project's alias convention; do not claim they are a complete resolved dependency graph.

### Property-Based Testing Approach

Use the installed `fast-check` only where input variation adds value. Existing parser and planner property tests remain in the full suite. Add one generated validation snapshot property over ordered terms to ensure completion membership and input preservation. Use a fixed recorded seed and at least 100 runs. Do not add property tests for type relocations, JSX, or Biome configuration.

### Integration Testing Approach

Run the affected route, planner, pane-state, walking, dialog, and synchronization tests after their respective moves. Run the full test suite, TypeScript, Biome, and formatting before each implementation commit. Finish with an isolated production build without credentials or live services.

Use the installed Babel parser in a private audit to compare moved declarations and JSX with their source revision. Do not add a transitive parser as a tracked test dependency. Compare constructor/helper behavior and store exports as well as syntax. A structural audit complements runtime tests; it does not establish module initialization behavior alone.

This restructuring preserves rendered markup. Keep the preceding selector migration's visual-review follow-up open; do not describe syntax preservation or the prior measured-only approval as a new visual review.

## Performance Considerations

Remove persistent-store initialization from planner-calculation imports. Keep existing memoization, lazy imports, request sequencing, and caches. Avoid adding memoization or extra runtime abstraction to make a file smaller. Do not claim latency or bundle improvements without measurements. Defer lazy pane registration and shell-context splitting because they can change mounted state and loading behavior.

## Security Considerations

Keep auth, authorization, rate limits, body validation, ingestion publication, and database writes unchanged. Type relocation must not create runtime imports of server code in client modules. Use synthetic tests and an isolated build with nonproduction configuration. Do not read or commit credentials or change the dataset submodule.

## Dependencies

Use the installed TypeScript compiler, React, Next.js, Zustand, Vitest, fast-check, Biome, and Prettier. Add no packages. Follow the installed Next.js boundary and testing guides. Keep project comments, commit subjects, and UI primitives consistent with the existing repository.
