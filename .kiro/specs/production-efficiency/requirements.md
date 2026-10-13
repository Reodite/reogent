# Requirements Document

## Introduction

Optimize Reodite for one Docker Compose host running the standalone Next.js application, Postgres, and Meilisearch. Reduce duplicate dataset work, retained stream resources, unnecessary build tracing, and inactive-tool loading. Preserve successful application behavior, source verification, complete datasets, and account ownership.

These requirements derive from the approved production-efficiency design. They cover implementation and verification, not a production deployment. Exclude visual redesign, framework replacement, new infrastructure services, changes to the data submodule, and unrelated cleanup.

Host CPU/RAM capacity and expected traffic remain unspecified. Production tuning requires a recorded Limits_Profile and Measurement_Plan before comparison. Tests can supply explicit fixture limits without treating those values as production recommendations. Preserve the existing 600,000-millisecond geographic interval, 60,000-millisecond browser stream stall interval, and 15,000-millisecond Google stream stall interval. Set the new browser catalog reuse lifetime to 3,600,000 milliseconds, matching the existing public HTTP cache lifetime. Choose new deployment-specific limits from the measured baseline rather than claiming an unmeasured capacity or percentage improvement.

## Glossary

- **Reodite**: The application, browser client, and supporting server modules covered by the approved design.
- **Reference_Scenarios**: The existing automated contract fixtures plus the approved design's successful chat/persistence, document verification, walking-route/geometry, course-index, tool-navigation, and snapshot-publication scenarios. Comparisons fix clocks and generated identities or normalize those values before comparing outputs.
- **Release_Builder**: The production build and packaging commands that produce the standalone server and Docker image.
- **Release_Artifact**: The deployable application files, required packages, static assets, and map worker; excludes external datasets, secrets, and development-only files.
- **Chat_Service**: The authenticated chat endpoint, agent loop, persistence boundary, and first-exchange title generation.
- **Provider_Adapter**: The existing OpenAI, Anthropic, or Google integration. Cancellation means stopping supported local SDK transport work; provider-side compute and billing remain outside this guarantee.
- **Stream_Transport**: The server event serializer and browser event reader using the existing NDJSON event contract.
- **NDJSON**: UTF-8 JSON objects, each terminated by a line-feed character. Transport chunks may divide an encoded character or event across reads. Supported chunk partitions stay within the existing reader's 1,048,576 UTF-16-code-unit input-buffer bound before line splitting. Blank lines and malformed JSON lines retain the existing reader behavior. Round-trip comparisons use JSON-domain values: strings, finite numbers, booleans, nulls, arrays, and objects; object-member order is immaterial and negative zero equals zero.
- **Accepted_Completion**: Receipt of a valid agent `done` event by Chat_Service after the existing answer/source checks, before the owner-gated persistence attempt. EOF, cancellation, and timeout are not completion.
- **Owned_Resource**: A timer, stream reader or iterator, abort listener, connection, or capacity slot acquired for one operation.
- **Capacity_Limit**: A positive finite integer that limits simultaneous operations. Active chat and title work have separate limits and no application waiting queue.
- **Limits_Profile**: The recorded app, Postgres, and Meilisearch CPU/RAM limits; Node heap limit; database connection cap and acquisition timeout; chat/title capacity and deadlines; ingestion byte target and search request limit. Timer values use integer milliseconds from 1 through 2,147,483,647; counts and byte sizes use integers from 1 through 9,007,199,254,740,991. CPU allocations use positive finite core counts within the declared host allocation. Batch_Target cannot exceed Request_Limit. Deployment memory includes a positive host reserve outside the three service limits.
- **Dataset_Loaders**: The walking graph, derived entrance map, raw building geometry, public entrance join, and complete course-index loader.
- **Cache_Generation**: One successful load of a named dataset and its permitted retention interval. Concurrent requests for one unfinished load share that load.
- **Catalog_Client**: The existing browser API instance used by the prerequisite tree and degree planner to retrieve public course-index data.
- **Tool_Shell**: Shared navigation, pane registration, workspace selection, loading frames, and tool rendering.
- **Inactive_Tool**: A tool implementation outside the current route and selected or intentionally retained workspace. Navigation metadata alone does not activate a tool.
- **Ingestion**: The existing sequential dataset indexing and atomic replacement-snapshot publication process.
- **Batch_Target**: The configured maximum serialized UTF-8 request bytes for an ordinary ingestion batch, including JSON array punctuation and separators.
- **Request_Limit**: The configured Meilisearch maximum request-body bytes. A single document above Batch_Target can use a one-document batch only within Request_Limit.
- **Deployment_Config**: The production Compose settings and runtime resource configuration for the selected single-host deployment.
- **Measurement_Runner**: Bounded production-build, artifact, request, and resource checks against an explicitly selected fixture target.
- **Measurement_Plan**: A recorded workload with target identity, revision, runtime/image, dataset, Limits_Profile, concurrency, duration, trial count, warmup, cooldown, cache state, provider mode, expected responses, and per-metric comparison tolerances fixed before measurement. Timings use integer milliseconds; bytes and request counts use integer values. Duration and concurrency are positive and finite; warmup and cooldown are nonnegative. A comparison includes at least three matched trial pairs. A repeatable regression exceeds the recorded tolerance in at least two thirds of those pairs.
- **Verification_Set**: Automated contract checks, regression tests, and matched production measurements required to accept an optimization.

## Requirements

### Requirement 1: Preserve application and data contracts

**User Story:** As a student, I want lower resource use without losing answers, saved work, or access to tools, so that optimization preserves the tasks I already perform.

#### Acceptance Criteria

1. THE Reodite SHALL preserve supported route identities and successful response contracts for Reference_Scenarios.
2. THE Chat_Service SHALL preserve successful event payloads and order, citation/source verification, tool-call budgets, and activity content for Reference_Scenarios.
3. THE Reodite SHALL preserve complete search coverage, full retrieved document content, source identities, content hashes, and dated provenance.
4. THE Reodite SHALL preserve authentication, account ownership, input bounds, private-response cache restrictions, and public-data field allowlists.
5. THE Tool_Shell SHALL preserve direct tool URLs, stored pane state, intentional mounted-state retention, keyboard access, reduced-motion behavior, and documented control geometry.
6. THE Reodite SHALL preserve the data submodule revision and existing untracked submodule content throughout the optimization work.

### Requirement 2: Package the runtime without broad data tracing

**User Story:** As an operator, I want a release containing only runtime files, so that builds and deployments avoid copying external datasets and local workspace content.

#### Acceptance Criteria

1. WHEN producing a Release_Artifact, THE Release_Builder SHALL include the standalone entrypoint, required runtime packages, static assets, and map worker.
2. WHEN producing a Release_Artifact, THE Release_Builder SHALL exclude external corpora, crawl caches, local environment files, application test files, specification files, and local agent-tooling files.
3. WHEN building the application with the supported production configuration, THE Release_Builder SHALL complete without whole-project filesystem-tracing diagnostics from the runtime dataset boundary.
4. WHEN starting a Release_Artifact with runtime credentials and a valid read-only dataset mount, THE Reodite SHALL serve the existing dataset-backed reference requests without requiring a checkout of application source or corpus files inside the image.
5. THE Deployment_Config SHALL preserve the non-root application runner and separation between build-time files and runtime secrets.
6. WHEN verifying packaging, THE Verification_Set SHALL inspect both the local standalone output and the Docker image independently.

### Requirement 3: Release stream work on completion, cancellation, or failure

**User Story:** As an operator, I want abandoned and stalled chats to release resources, so that finished requests do not retain timers, readers, or further model work.

#### Acceptance Criteria

1. WHEN a caller cancels before Accepted_Completion, THE Chat_Service SHALL stop initiating additional model turns and tool calls for that exchange.
2. WHEN Chat_Service cancels an exchange, THE Provider_Adapter SHALL receive the exchange cancellation through the provider's supported transport cancellation interface.
3. IF an explicit caller cancellation occurs, THEN THE Provider_Adapter SHALL terminate that request without retrying the cancellation as a transient failure.
4. WHEN a stream read settles, THE Stream_Transport SHALL retain zero watchdog timers owned by that read.
5. WHEN a Google stream read settles, THE Provider_Adapter SHALL retain zero watchdog timers owned by that read.
6. WHEN stream consumption ends through completion, cancellation, or failure, THE Stream_Transport SHALL release the owned reader lock and terminate unfinished consumption without replacing the original error with a cleanup error.
7. WHEN provider iteration ends through completion, cancellation, or failure, THE Provider_Adapter SHALL release owned listeners and timers and invoke supported cleanup for unfinished iteration.
8. IF no browser stream data arrives for 60,000 milliseconds or no Google stream data arrives for 15,000 milliseconds, THEN THE Reodite SHALL terminate the affected stream as a timeout rather than a successful partial answer.
9. WHILE response demand is paused, THE Chat_Service SHALL limit application-level production to at most one outstanding agent-iterator read and one queued complete event frame per exchange.
10. WHEN serializing a valid event, THE Stream_Transport SHALL print one compact JSON object followed by one line-feed character without truncating event fields.
11. WHEN reading a successful NDJSON sequence under supported chunk partitions, THE Stream_Transport SHALL produce the same callback order and final response as reading that sequence without chunk splits.
12. WHEN a valid JSON-domain event passes through NDJSON printing and parsing, THE Stream_Transport SHALL reproduce the event's field values.

### Requirement 4: Bound chat capacity and preserve completed writes

**User Story:** As an operator, I want explicit limits on active chat and title work, so that a shared host rejects excess demand without collecting an in-memory request queue.

#### Acceptance Criteria

1. WHEN admitting a chat exchange, THE Chat_Service SHALL enforce authentication, existing per-user rate limits, input validation, and session ownership before starting provider work.
2. WHILE the active-exchange Capacity_Limit is reached, THE Chat_Service SHALL reject additional exchanges with the existing error-response shape, HTTP 503, and a positive integer `Retry-After` delay in seconds, without queuing those exchanges.
3. IF an existing per-user rate limit rejects a request, THEN THE Chat_Service SHALL preserve HTTP 429 and the existing retry indication.
4. WHEN an admitted exchange reaches completion, cancellation, or failure, THE Chat_Service SHALL release its capacity slot exactly once after foreground cleanup.
5. WHEN the configured exchange deadline expires, THE Chat_Service SHALL initiate cancellation and prevent additional model turns and tool dispatch for that exchange.
6. IF an exchange ends before Accepted_Completion, THEN THE Chat_Service SHALL create zero successful exchange records and zero title requests for that incomplete exchange.
7. WHEN Accepted_Completion precedes a client disconnect, THE Chat_Service SHALL finish one owner-gated persistence attempt without automatically repeating a failed write.
8. WHEN saving the first exchange succeeds and title capacity is available, THE Chat_Service SHALL start at most one owner-scoped title request subject to the title deadline.
9. WHILE title Capacity_Limit is reached, THE Chat_Service SHALL preserve the fallback title without queuing another title request.
10. WHEN title work settles through completion, failure, or deadline cancellation, THE Chat_Service SHALL release the title operation's Owned_Resources.

### Requirement 5: Share concurrent dataset work

**User Story:** As an operator, I want callers to share an unfinished dataset load, so that traffic bursts do not repeat filesystem reads, graph construction, or catalog retrieval.

#### Acceptance Criteria

1. WHEN overlapping callers request the same unfinished Cache_Generation, THE Dataset_Loaders SHALL perform one underlying dataset load and return equivalent results to those callers.
2. WHEN a geographic dataset load succeeds, THE Dataset_Loaders SHALL start its 600,000-millisecond retention interval at successful completion.
3. WHEN requests overlap during an expired geographic generation's replacement, THE Dataset_Loaders SHALL share one replacement load without returning the expired generation as a new successful result.
4. IF a dataset load rejects, THEN THE Dataset_Loaders SHALL permit a subsequent request to start one new load rather than retain the rejected operation.
5. IF the derived entrance artifact is unavailable, THEN THE Dataset_Loaders SHALL preserve the existing centroid fallback.
6. IF another dataset load fails, THEN THE Dataset_Loaders SHALL preserve that caller's existing error behavior.
7. THE Dataset_Loaders SHALL preserve route geometry, distances, entrance selection, labeled estimates, and public geometry fields for Reference_Scenarios.
8. WHEN loading the server course catalog, THE Dataset_Loaders SHALL retrieve the complete projected catalog, preserve the existing course-code sort order, and retain the successful generation for the application process lifetime.
9. WHEN serving repeated requests for one server course-catalog generation, THE Dataset_Loaders SHALL reuse one serialized response body while preserving the route's existing rate limit and public cache lifetime.
10. THE Dataset_Loaders SHALL retain at most one completed generation and one pending replacement per named dataset, without adding entries keyed by arbitrary user queries.

### Requirement 6: Reuse browser catalog data and defer inactive tools

**User Story:** As a student, I want navigation and the selected workspace to load without unrelated tools, so that opening the application avoids unnecessary downloads and repeated catalog work.

#### Acceptance Criteria

1. WHEN overlapping callers in one browser API instance request the course index, THE Catalog_Client SHALL share one pending request and return equivalent complete catalog data.
2. WHEN a browser catalog request succeeds, THE Catalog_Client SHALL reuse that result for at most 3,600,000 milliseconds from completion.
3. IF a browser catalog request fails, THEN THE Catalog_Client SHALL allow the next request to retry.
4. WHEN serving a reused browser catalog result, THE Catalog_Client SHALL perform the existing current-token check before returning data.
5. WHEN creating a new browser API instance, THE Catalog_Client SHALL begin without a retained catalog generation from a previous instance.
6. THE Catalog_Client SHALL restrict the new reuse behavior to public course-index data rather than private profiles, plans, schedules, or sessions.
7. WHEN rendering navigation or pane defaults with no active workspace, THE Tool_Shell SHALL avoid requesting Inactive_Tool implementation chunks solely for that metadata.
8. WHEN activating a tool through navigation, a direct URL, or an AI widget, THE Tool_Shell SHALL load the selected implementation and preserve the existing state-update contract.
9. WHILE a selected tool implementation is loading, THE Tool_Shell SHALL retain usable navigation, a geometry-matched loading frame, and existing keyboard focus without exposing interactive placeholder controls.
10. IF a selected tool implementation fails to load, THEN THE Tool_Shell SHALL expose the existing recovery path without presenting the failure as an empty successful result.
11. WHEN a compact view or answer canvas changes visibility, THE Tool_Shell SHALL preserve the documented mounted-state, form, camera, and scroll behavior.

### Requirement 7: Bound ingestion requests without dropping data

**User Story:** As an operator, I want indexing requests bounded by document count and encoded size, so that large articles do not turn a count-limited batch into an unbounded request.

#### Acceptance Criteria

1. WHEN publishing ordinary batches, THE Ingestion SHALL limit each batch to at most 500 transformed documents and Batch_Target serialized UTF-8 bytes, including request-array overhead.
2. WHEN the next transformed document would exceed either ordinary-batch limit, THE Ingestion SHALL complete publication of the current nonempty batch before adding that document to the next batch.
3. IF one transformed document exceeds Batch_Target but its one-document request fits Request_Limit, THEN THE Ingestion SHALL publish that document alone with its content and hash intact.
4. IF a one-document request exceeds Request_Limit, THEN THE Ingestion SHALL fail that index publication before the snapshot swap and identify the affected index/document without truncating the document.
5. WHEN concatenating successfully submitted batches for a valid input sequence, THE Ingestion SHALL preserve the transformed document values and order without introducing omissions or duplicates.
6. THE Ingestion SHALL preserve sequential index processing and confirmation of required Meilisearch tasks before advancing publication.
7. IF validation, document loading, derivation, or task execution fails before a replacement-snapshot swap, THEN THE Ingestion SHALL leave the previous live snapshot active.
8. WHEN a replacement-snapshot swap succeeds, THE Ingestion SHALL preserve freshness reporting and removal of records absent from the new snapshot.
9. IF cleanup fails after a successful swap, THEN THE Ingestion SHALL report failure without rolling back the published snapshot.
10. THE Ingestion SHALL preserve the existing failure aggregation after attempting the remaining indexes.
11. WHEN publishing a replacement snapshot, THE Ingestion SHALL complete snapshot validation, required derivation, and required index tasks before atomically exposing the new generation under the existing live index name.

### Requirement 8: Make shared-host resource budgets explicit

**User Story:** As an operator, I want reproducible service budgets and bounded database connection acquisition, so that the application, database, and search engine fit within the selected host envelope.

#### Acceptance Criteria

1. WHEN resolving the production Deployment_Config, THE Deployment_Config SHALL expose effective CPU and memory limits for the app, Postgres, and Meilisearch independently of development configuration.
2. IF a supplied count, deadline, byte threshold, or service allocation violates Limits_Profile constraints, THEN THE Deployment_Config SHALL reject that configuration with an error identifying the invalid setting.
3. THE Deployment_Config SHALL constrain the sum of service memory limits and the declared host reserve to the recorded host memory budget.
4. THE Deployment_Config SHALL set the Node heap limit below the application memory limit and record the remaining memory allocation for non-heap use.
5. THE Deployment_Config SHALL record Postgres connection/work-memory settings and Meilisearch indexing memory/thread settings within the service budgets.
6. WHILE the application is running, THE Reodite SHALL limit database pool connections to the configured connection cap.
7. IF database connection acquisition exceeds the configured timeout, THEN THE Reodite SHALL return the existing operation failure without initiating an automatic duplicate mutation.
8. THE Deployment_Config SHALL preserve one application process, one shared database pool, a read-only application dataset mount, and loopback-bound database/search host ports.
9. THE Deployment_Config SHALL keep ingestion outside application startup and request handling, with one ingestion process per destination and storage for both snapshot generations.
10. WHEN accepting production tuning, THE Verification_Set SHALL verify the effective non-Swarm service limits against the recorded Limits_Profile and tested Meilisearch image identity.

### Requirement 9: Prove resource changes under matched workloads

**User Story:** As a maintainer, I want reproducible before-and-after evidence, so that lower resource use does not conceal broken behavior or displaced latency.

#### Acceptance Criteria

1. WHEN starting a measurement, THE Measurement_Runner SHALL require a recorded Measurement_Plan with a finite duration and concurrency.
2. IF a mutating measurement lacks an explicitly authorized isolated target, THEN THE Measurement_Runner SHALL refuse to run that scenario.
3. WHEN a measurement completes, THE Measurement_Runner SHALL report artifact bytes, readiness time, baseline/peak/post-load RSS, CPU use, p50/p95 latency, completed throughput, observed active-exchange counts, expected overload rejections, unexpected errors, and capacity recovery, marking unavailable metrics as unavailable.
4. THE Measurement_Runner SHALL distinguish fixed-latency fixture-provider results from separately authorized live-provider observations.
5. THE Measurement_Runner SHALL exclude credentials, bearer tokens, private messages, and resolved service secrets from committed reports and logs.
6. WHEN comparing an optimization, THE Verification_Set SHALL run at least three matched baseline/candidate trial pairs with recorded warmup and cooldown, using matching runtime, dataset, limits, workload, and cache-state records.
7. WHEN verifying stream lifecycle, THE Verification_Set SHALL exercise real HTTP disconnects and paused readers through the standalone image and intended reverse-proxy configuration, checking upstream cancellation, bounded agent-iterator production, and capacity recovery without additional consumer reads.
8. WHEN evaluating lazy tool loading, THE Verification_Set SHALL compare both initial route transfer/evaluation and selected-tool first-use latency while checking loading geometry and keyboard access.
9. WHEN evaluating serving during ingestion, THE Verification_Set SHALL report separate serving-only, ingestion-only, and combined runs under the same service budgets, including ingestion-process and service-container peak memory.
10. WHEN accepting an optimization slice, THE Verification_Set SHALL pass its relevant contract and regression tests, including a demonstrated failing-before/passing-after check for duplicate dataset loads and retained watchdogs.
11. WHEN accepting the completed implementation, THE Verification_Set SHALL pass the application tests, lint error checks, TypeScript checks, formatting checks, production build, and release-artifact smoke checks.
12. IF a matched comparison shows a repeatable latency, throughput, unexpected-error, or resource-recovery regression, THEN THE Verification_Set SHALL withhold a performance-improvement claim until the cause and proposed trade-off have received review.
13. WHEN verifying persistence and publication, THE Verification_Set SHALL exercise successful writes and injected failures against isolated real Postgres and Meilisearch services using fixture data.
14. THE Verification_Set SHALL include concurrent cold loads, geographic expiry bursts, repeated cancellation, and provider stalls among the recorded reference workloads.
15. IF a measurement needed to substantiate a performance claim is unavailable, THEN THE Verification_Set SHALL withhold that claim.
