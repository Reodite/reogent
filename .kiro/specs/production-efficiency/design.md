# Design Document: Production Efficiency

## Overview

Keep the existing TypeScript/Next.js application and single-host Compose deployment. Remove duplicate work and retained resources before tuning limits. Preserve security, saved state, full source retrieval, and snapshot publication. No new service, generic cache framework, benchmark framework, or visual redesign.

## Architecture

Keep the current ownership: routes in `app/`, UI in `src/components/`, browser helpers in `src/lib/`, shared contracts in `src/shared/`, and server logic in `src/server/`. Retain the standalone non-root runner, externally mounted data, one database pool, and existing provider adapters.

Confirmed targets:

- `src/server/data.ts` produces broad filesystem-tracing warnings despite corpus exclusions.
- Concurrent cold route requests discard unfinished cache promises and repeat both dataset reads.
- Browser and Google stream readers leave losing timeout timers alive.
- Chat lacks an end-to-end abort path and drains the agent without response backpressure.
- Pane registration eagerly imports tool implementations; catalog callers repeat retrieval/parsing.
- Ingestion limits document count but not encoded batch size; production resource settings remain implicit.

## Components and Interfaces

| Area                       | Change                                                                                    | Preserve                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Data/build                 | Scope the runtime filesystem trace; inspect standalone/Docker contents                    | Data-root behavior, static/map-worker assets, dependencies, non-root runner               |
| Providers/agent            | Add an optional signal to existing requests; clean up iteration and timers                | Provider selection, successful events, source checks, tool budgets, script callers        |
| Chat route/title           | Use demand-driven reads, cancellation/deadlines, and separate bounded chat/title capacity | Auth and ownership before work; one completed save; no save/title before completion       |
| Browser API                | Clear read timers and release readers; reuse one public catalog request per API instance  | Wire grammar, buffer guard, token checks, failure retry, private-data boundary            |
| Geographic/catalog loaders | Separate pending work from completed TTL state; reuse catalog serialization               | Ten-minute geographic TTL, process-lifetime server catalog, route/fallback semantics      |
| Pane registry              | Literal-path lazy implementation loaders; remove eager map bypass                         | Synchronous metadata, direct URLs, geometry, stable state callbacks, mounted state        |
| Ingestion                  | Add encoded-byte accounting beside the 500-document cap                                   | Full documents, task ordering, validation/derivation, swaps, freshness and cleanup errors |
| Deployment/database        | Validate explicit limits; cap pool size and acquisition time                              | One process/pool, read-only app data, loopback service ports, separate ingestion          |

Use existing helpers and primitives. Extract shared validation only when multiple changed callers need it. Keep the current wire content type; protocol renaming is outside this cleanup.

## Data Models

Keep API payloads, persisted records, dataset IDs, and hashes unchanged. An optional `AbortSignal` extends provider/agent request types. Finite caches need only pending work, the completed value, and completion-based expiry. No database migration or new domain model is required.

## Error Handling

- Cancelled/deadline-expired exchanges stop new turns and tool dispatch. Pass aborts to supported SDK transports; do not retry explicit cancellation. Remote provider billing and synchronous work are not cancellable guarantees.
- Clear each read watchdog when the read settles. Preserve the 60-second browser and 15-second Google idle limits. A stall is an error, not a completed partial answer.
- Keep at most one pending agent read and one queued frame. Release chat capacity once after cleanup; reject excess work with 503 and a retry delay, retaining existing 429 behavior for per-user limits.
- Before a valid `done`, do not persist a successful exchange or start title generation. After accepted completion, finish one owner-gated save attempt even if the client disconnects. Do not retry writes blindly.
- Share pending cold/expired dataset loads. Start geographic TTL at success; clear failures for retry. Preserve the missing-entrance fallback and other existing errors. Browser catalog reuse expires after one hour.
- Flush before either batch limit. Send an above-target document alone only within the request limit; otherwise fail before replacement swap. Keep pre-swap failure isolation and post-swap cleanup reporting.

## Testing Strategy

### Unit Testing Approach

Reuse existing tests. Add the smallest regressions that fail if the changed behavior breaks: timers/readers after success and cancellation, shared cold/expired loads and retry, capacity release/completion ordering, and batch byte accounting/publication failures. Preserve security, account ownership, parser, graph, and accessibility interaction coverage.

### Property-Based Testing Approach

No new property suites are required for this cleanup. Keep existing property tests that cover domain logic. Do not replace a few concrete lifecycle cases with generated test infrastructure.

### Integration Testing Approach

Run relevant Vitest files, then the existing full test, lint, TypeScript, formatting, and build commands. Inspect standalone contents and size; use the smallest available smoke check for changed runtime paths. Use fixture data for mutations. Do not add a proxy fixture stack or a generalized performance runner.

## Performance Considerations

Record observable changes with existing tools: duplicate read counts, retained timers, build warnings, artifact bytes, and loaded chunks. Include limitations when browser or production-host measurements are unavailable. Do not claim latency/RSS improvements from unit tests or a local build alone. Host capacity and production tuning remain operator inputs; keep limits configurable.

## Security Considerations

Preserve auth, ownership, validation, rate limiting, private `no-store`, source verification, and account-scoped browser state. Keep secrets outside artifacts and reports. Leave the submodule and operator data untouched. Treat retrieved prose as untrusted input.

## Dependencies

Use the installed framework, provider SDKs, database/search clients, and test tools. Read the installed Next.js guides for the changed runtime boundary. No new application runtime dependency is planned.
