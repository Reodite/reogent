# Implementation Plan: Codebase Restructuring

## Overview

Keep the existing directory layout and implement four ownership changes in order. Preserve behavior before optimizing algorithms. Use TypeScript and existing test tools. The user granted approval to proceed through these tasks without questions.

## Tasks

- [ ] 1. Decouple shared contracts from entrypoints
  - [ ] 1.1 Add course-index characterization and move the unchanged course and pane declarations to their shared owners; migrate consumers.
    - Preserve route processing, registration, and runtime component imports.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ] 1.2 Verify declaration equality, route/pane tests, and full repository gates; commit and push.
    - _Requirements: 1.1, 1.3, 1.4, 5.4, 5.5_

- [ ] 2. Separate the planner model from persistence
  - [ ] 2.1 Characterize co-op application, extract model declarations and constructors, and move co-op application to the existing store.
    - Keep store exports compatible and use the model directly from placement, autofill, and co-op calculations.
    - Preserve one `usePlanner` instance and the persisted schema.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 2.2 Add calculation-import isolation checks and Biome boundary rules; verify prohibited-import negative controls.
    - _Requirements: 2.1, 5.1, 5.2, 5.3_
  - [ ] 2.3 Run model, co-op, store, planner, and full repository gates; commit and push.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.4, 5.5_

- [ ] 3. Extract whole-plan validation
  - [ ] 3.1 Move the existing calculation into `validation.ts`, retain the memoized caller, and add direct behavioral examples.
    - Preserve traversal, unknown courses, duplicate and ignored issues, and per-term snapshot sharing.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ] 3.2 Add the generated completion-snapshot check.
    - **Property 1: Stable completion snapshots**
    - **Validates: Requirements 3.2, 3.4**
  - [ ] 3.3 Compare the extracted calculation with its source and run planner plus full repository gates; commit and push.
    - _Requirements: 3.1, 3.3, 3.5, 5.4, 5.5_

- [ ] 4. Extract import-review presentation and finish verification
  - [ ] 4.1 Add cancellation/reopening characterization, then move the dialog and private formatter into `planner-import-dialog.tsx` without changing JSX or parent orchestration.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ] 4.2 Compare moved declarations and run dialog, schedule, and full repository gates plus an isolated production build; commit and push.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 5.4, 5.5_

## Notes

- Tests listed here are required. Retain existing parser/property coverage rather than adding redundant properties.
- Each verification subtask includes `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, and `git diff --check`.
- Compare lint diagnostics by path and rule, not only totals. Preserve baseline warnings in unrelated files.
- Keep source-only refactors separate from algorithms, visual changes, dependency upgrades, and store-schema changes.
- Commit only this task's files. Leave `ubc-unified-data` and credentials untouched. Push after each commit.
- The preceding selector migration still needs visual screenshot review. This plan adds no visual redesign or approval claim.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] },
    { "id": 7, "tasks": ["3.3"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] }
  ]
}
```
