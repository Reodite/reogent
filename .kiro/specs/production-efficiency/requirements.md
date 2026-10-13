# Requirements Document

## Introduction

Reduce production resource use on the existing single-host Docker Compose stack. Preserve successful behavior and data. No framework migration, visual redesign, new production service, benchmark framework, or changes to the data submodule.

## Glossary

- **App**: The Next.js server, agent, provider adapters, and browser client.
- **Build**: Standalone and Docker packaging.
- **Loaders**: Geographic and course-catalog loading on the server and browser.
- **Ingest**: Existing sequential indexing and snapshot replacement.
- **Completion**: A valid agent `done` event accepted before the owner-gated save. EOF, cancellation, and timeout are not completion.

## Requirements

### Requirement 1: Preserve contracts

**User Story:** As a student, I want optimization to preserve my answers and saved work.

#### Acceptance Criteria

1. THE App SHALL preserve successful API/event contracts, citations, full document content, source verification, and tool budgets.
2. THE App SHALL preserve authentication, account ownership, validation, private-response cache restrictions, and public field allowlists.
3. THE App SHALL preserve routed tools, saved state, keyboard access, reduced motion, and documented layout contracts.
4. THE App SHALL leave the data submodule and existing user changes untouched.

### Requirement 2: Limit release contents

**User Story:** As an operator, I want to deploy runtime files without copying the workspace.

#### Acceptance Criteria

1. THE Build SHALL include required runtime dependencies, static assets, and the map worker while excluding secrets, corpora, caches, tests, specs, and local tooling.
2. THE Build SHALL avoid whole-project tracing at the runtime data boundary.
3. WHEN starting with configured services and a read-only data mount, THE App SHALL retain its dataset-backed behavior and non-root runtime.

### Requirement 3: Bound chat work

**User Story:** As an operator, I want completed, abandoned, and stalled chats to release resources.

#### Acceptance Criteria

1. WHEN an exchange is cancelled or reaches its deadline, THE App SHALL cancel supported provider transport and stop new model turns/tools without retrying explicit cancellation.
2. WHEN a stream read or operation settles, THE App SHALL clear its timers/listeners and release its reader or iterator without replacing the original error with a cleanup error.
3. IF a browser read stalls for 60 seconds or a Google read stalls for 15 seconds, THEN THE App SHALL fail the stream rather than accept a partial completion.
4. WHILE response demand is paused, THE App SHALL permit at most one pending agent read and one queued complete event frame.
5. WHILE configured chat capacity is full, THE App SHALL return 503 with an integer-seconds retry delay without queuing another exchange; existing per-user limits retain 429.
6. WHEN admitted chat or title work settles, THE App SHALL release its capacity exactly once.
7. IF an exchange ends before Completion, THEN THE App SHALL avoid saving it as successful or starting a title request.
8. WHEN Completion precedes disconnect, THE App SHALL finish one owner-gated save attempt without automatically repeating a failed write.
9. WHEN a first-exchange save succeeds, THE App SHALL bound title generation separately and retain the fallback title if title capacity is full.
10. THE App SHALL preserve NDJSON fields, ordering, UTF-8 chunk handling, malformed-line behavior, and the existing input-buffer limit.

### Requirement 4: Share dataset work

**User Story:** As an operator, I want concurrent callers to share unfinished loads.

#### Acceptance Criteria

1. WHEN requests overlap a cold or expired dataset load, THE Loaders SHALL share one load and allow retry after failure.
2. THE Loaders SHALL retain geographic results for ten minutes from completion, the server catalog for the process lifetime, and the browser catalog for at most one hour per API instance.
3. THE Loaders SHALL preserve entrance fallback, route results, complete sorted catalog fields, token checks, and existing rate limits.
4. THE Loaders SHALL reuse the server catalog's serialized response without adding unbounded query caches or caching private account data.

### Requirement 5: Defer inactive tools

**User Story:** As a student, I want navigation to load without unrelated tool implementations.

#### Acceptance Criteria

1. WHEN rendering navigation and pane defaults, THE App SHALL avoid loading inactive tool implementations solely for metadata.
2. WHEN activating a tool, THE App SHALL preserve direct URLs, state callbacks, matched loading/recovery frames, navigation access, and keyboard focus.
3. WHEN a compact view or canvas changes visibility, THE App SHALL preserve intentionally mounted form, map, and scroll state.

### Requirement 6: Bound ingestion batches

**User Story:** As an operator, I want variable-sized articles to fit bounded indexing requests without losing content.

#### Acceptance Criteria

1. THE Ingest SHALL cap ordinary batches at 500 documents and a configured UTF-8 request-byte target, including JSON overhead.
2. IF one document exceeds the batch target but fits the request limit, THEN THE Ingest SHALL submit it alone without truncation.
3. IF one document exceeds the request limit, THEN THE Ingest SHALL fail that publication before a replacement swap.
4. THE Ingest SHALL preserve transformed document order/content, sequential confirmed tasks, validation and derivation before swap, live index names, freshness, failure aggregation, and post-swap cleanup reporting.
5. IF replacement publication fails before swap, THEN THE Ingest SHALL preserve the previous live snapshot.

### Requirement 7: Configure shared-host limits

**User Story:** As an operator, I want explicit limits without guessing the production host's capacity.

#### Acceptance Criteria

1. THE App SHALL reject nonpositive/unsafe counts and byte limits, timer durations outside 1–2,147,483,647 milliseconds, and ingestion targets above the request limit.
2. THE App SHALL cap its shared database pool and bound connection acquisition without retrying mutations.
3. THE Build SHALL expose production service CPU/RAM, Node heap, database, and search-indexing settings separately from development, with heap below app memory and space for host overhead.
4. THE App SHALL preserve one server process, read-only application data, loopback database/search ports, and ingestion outside startup/request handling.

### Requirement 8: Verify proportionately

**User Story:** As a maintainer, I want evidence for the changed behavior without maintaining another test framework.

#### Acceptance Criteria

1. THE App SHALL pass existing relevant tests, type checks, lint error checks, formatting, and the production build.
2. WHEN changing stream cleanup, cache concurrency, or batching, THE App SHALL retain focused regression coverage for those paths and reuse existing coverage elsewhere.
3. THE Build SHALL support inspection of artifact contents and size for documented before/after comparisons.

Production host budgets and latency targets remain operator inputs. Use existing tools and small probes for measurements; do not introduce a proxy fixture stack, generalized benchmark runner, or blanket property-test requirements.
