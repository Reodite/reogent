# Implementation Plan: Production Efficiency

## Overview

Apply focused TypeScript changes to existing owners. Reuse tests and tools; add only regressions for changed behavior. Commit each verified unit. This checklist tracks implementation and final verification.

## Tasks

- [x] 1. Finish cleanup
  - [x] 1.1 Consolidate documentation, remove stale paths, and prune visual, implementation-shape, duplicate, and meaningless test assertions.
    - Keep active specs short and preserve operational/security guidance.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2_
- [x] 2. Fix dataset reuse
  - [x] 2.1 Correct pending-load handling in `routing.ts`, `modules/buildings.ts`, and the course-index route; reuse server catalog serialization.
    - Keep one cold/expired load, retry after rejection, existing fallback, and completion-based TTL.
    - Retain a focused failing-before/passing-after concurrency check.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 2.2 Reuse the browser catalog inside the existing API instance with token checks, one-hour expiry, and failure eviction.
    - Reuse existing API/pane tests; cover concurrent reuse, retry, and token rejection.
    - _Requirements: 4.2, 4.3, 4.4_
- [x] 3. Fix stream resource ownership
  - [x] 3.1 Clean up browser/provider timers and readers, and pass optional cancellation through all adapters and the agent.
    - Preserve successful events and source checks; add focused timer/abort regressions.
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.10_
  - [x] 3.2 Add route backpressure, validated chat/title limits and deadlines, and exact-once capacity release.
    - Keep completed persistence independent of later disconnects and avoid saving incomplete replies.
    - Extend existing route/title tests for the changed lifecycle and limit behavior.
    - _Requirements: 1.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 7.1_
- [x] 4. Reduce eager loading and packaging
  - [x] 4.1 Lazy-load pane implementations and remove the eager map bypass; adapt existing pane tests.
    - Preserve navigation, loading/recovery geometry, direct URLs, and state retention.
    - _Requirements: 1.3, 5.1, 5.2, 5.3_
  - [x] 4.2 Narrow external-data tracing and release exclusions; inspect build output and required runtime assets.
    - Use installed Next.js guidance and existing security/build checks.
    - _Requirements: 2.1, 2.2, 2.3, 8.3_
- [x] 5. Bound ingestion and deployment resources
  - [x] 5.1 Add byte-aware ingestion batches and extend existing ingestion tests for limits and publication safety.
    - Preserve full content, single-document exceptions, and atomic replacement behavior.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_
  - [x] 5.2 Wire explicit pool/acquisition limits and production Compose resource settings with validation.
    - Keep development separate; document defaults and required host-specific overrides beside the implementation.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
- [x] 6. Verify the integrated change
  - [x] 6.1 Run existing tests, lint error checks, TypeScript, formatting, and production build; inspect the final diff and record observed resource changes without unsupported claims.
    - Repair regressions caused by the work. Keep production-host tuning separate from local evidence.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3_

## Notes

Follow the behavior-only testing policy in `AGENTS.md`. No benchmark framework, proxy fixture stack, blanket property suites, or replacement visual tests. Preserve meaningful data, security, parser, graph, and interaction coverage. Run finite commands and avoid builds while their source inputs change.

## Verification

Verified on 2026-10-13:

- `npm test`: 2,166 tests passed across 188 files. TypeScript and formatting passed; Biome exited 0 with 25 existing warnings and 7 informational diagnostics.
- Local production and Docker builds passed. Filesystem tracing warnings fell from 14 to zero. Artifact inspection found no environment files, authored tests, specs, local tooling, or mounted corpus.
- The isolated image ran as UID 1000, read a read-only fixture mount, and served three geographic routes, the course catalog, and both map worker modules. Six direct tool routes loaded in desktop and mobile browser checks. A delayed-chunk Chromium check retained navigation focus after activation. Invalid memory budgets exited with status 1 before migration.
- Live isolated Meilisearch publication retained full multibyte documents, rejected an oversized replacement, preserved the live snapshot, and removed temporary indexes.
- Stream, dataset-sharing, and byte-batching regressions demonstrated failing-before/passing-after behavior. Existing auth, persistence, source verification, graph, and keyboard/state tests remain in the passing suite.

Compared with the build at `cb1d3cf`, using unique script files referenced by prerendered HTML and `du -sb` for directory sizes:

| Measurement                    | Before, bytes | After, bytes |
| ------------------------------ | ------------: | -----------: |
| `/chat` initial JavaScript     |     2,956,841 |    2,474,540 |
| `/tools` initial JavaScript    |     2,908,513 |    2,303,526 |
| `/settings` initial JavaScript |     2,914,472 |    2,312,897 |
| Standalone directory           |    53,393,814 |   47,750,949 |
| Complete static directory      |     9,057,394 |    9,169,201 |

Initial script totals fell 16–21%; standalone size fell 10.6%. Complete static output grew 1.2% after splitting. These local, uncompressed measurements do not establish production latency or RSS. Tune host budgets before deployment. Google's SDK still owns an unref'd attempt timer with no disposer; application-owned watchdogs and transports have lifecycle cleanup.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["6.1"] }
  ]
}
```
