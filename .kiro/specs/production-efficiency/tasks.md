# Implementation Plan: Production Efficiency

## Overview

Apply focused TypeScript changes to existing owners. Reuse tests and tools; add only regressions for changed behavior. Commit each verified unit. This checklist describes active work, not shipped behavior.

## Tasks

- [x] 1. Finish cleanup
  - [x] 1.1 Consolidate documentation, remove stale paths, and prune visual, implementation-shape, duplicate, and meaningless test assertions.
    - Keep active specs short and preserve operational/security guidance.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2_
- [ ] 2. Fix dataset reuse
  - [x] 2.1 Correct pending-load handling in `routing.ts`, `modules/buildings.ts`, and the course-index route; reuse server catalog serialization.
    - Keep one cold/expired load, retry after rejection, existing fallback, and completion-based TTL.
    - Retain a focused failing-before/passing-after concurrency check.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 2.2 Reuse the browser catalog inside the existing API instance with token checks, one-hour expiry, and failure eviction.
    - Reuse existing API/pane tests; cover concurrent reuse, retry, and token rejection.
    - _Requirements: 4.2, 4.3, 4.4_
- [ ] 3. Fix stream resource ownership
  - [ ] 3.1 Clean up browser/provider timers and readers, and pass optional cancellation through all adapters and the agent.
    - Preserve successful events and source checks; add focused timer/abort regressions.
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.10_
  - [ ] 3.2 Add route backpressure, validated chat/title limits and deadlines, and exact-once capacity release.
    - Keep completed persistence independent of later disconnects and avoid saving incomplete replies.
    - Extend existing route/title tests for the changed lifecycle and limit behavior.
    - _Requirements: 1.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 7.1_
- [ ] 4. Reduce eager loading and packaging
  - [ ] 4.1 Lazy-load pane implementations and remove the eager map bypass; adapt existing pane tests.
    - Preserve navigation, loading/recovery geometry, direct URLs, and state retention.
    - _Requirements: 1.3, 5.1, 5.2, 5.3_
  - [ ] 4.2 Narrow external-data tracing and release exclusions; inspect build output and required runtime assets.
    - Use installed Next.js guidance and existing security/build checks.
    - _Requirements: 2.1, 2.2, 2.3, 8.3_
- [ ] 5. Bound ingestion and deployment resources
  - [ ] 5.1 Add byte-aware ingestion batches and extend existing ingestion tests for limits and publication safety.
    - Preserve full content, single-document exceptions, and atomic replacement behavior.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_
  - [ ] 5.2 Wire explicit pool/acquisition limits and production Compose resource settings with validation.
    - Keep development separate; document defaults and required host-specific overrides beside the implementation.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
- [ ] 6. Verify the integrated change
  - [ ] 6.1 Run existing tests, lint error checks, TypeScript, formatting, and production build; inspect the final diff and record observed resource changes without unsupported claims.
    - Repair regressions caused by the work. Keep production-host tuning separate from local evidence.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3_

## Notes

Follow the behavior-only testing policy in `AGENTS.md`. No benchmark framework, proxy fixture stack, blanket property suites, or replacement visual tests. Preserve meaningful data, security, parser, graph, and interaction coverage. Run finite commands and avoid builds while their source inputs change.

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
