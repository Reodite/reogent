# Reodite

Campus assistant for UBC students: ask questions against indexed university data or use the map, course, prerequisite, planning, calendar, and sharing tools directly.

Next.js 16 App Router, React 19, TypeScript, Postgres, Meilisearch, MapLibre GL, and deck.gl. The agent supports OpenAI-compatible, Anthropic, and Google APIs.

`/` remains the public landing page for signed-in users and guests; the Reodite logo returns there. Start chat at `/app` or open a saved conversation at `/app/chat/:id`. Tools and Unity live under `/app/tools` and `/app/pulse`; Settings, Account, and About use `/app/settings`, `/app/account`, and `/app/about`. Existing workspace links redirect to their `/app` equivalents. Guests use Tools, including course browsing, and the utility pages. Signed-in accounts complete or skip `/onboarding` once before entering the app. See [PRODUCT.md](PRODUCT.md) for profile, usage, and sound behavior.

## Setup

Use Node.js 24 and Docker.

```bash
npm install
git submodule update --init
cp .env.example .env
# Configure credentials before starting services.
docker compose up -d postgres meilisearch
npm run validate:documents
npm run ingest
npm run dev
```

The development server uses `http://localhost:3000`. Database schema initialization runs at server startup. Run watchers in your terminal.

Generate separate secrets for Postgres, Meilisearch, and JWT signing, for example with `openssl rand -hex 32`. Set the same Postgres credential in `DATABASE_URL`. Compose refuses missing database/search secrets and binds their host ports to loopback. Changing `.env` does not rotate an existing Postgres user's password. Follow [SECURITY.md](SECURITY.md) before exposing the app.

### Configuration

| Variable                                   | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `LLM_API_TYPE`                             | `openai` (default), `anthropic`, or `google`                               |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Provider endpoint, model, and credential                                   |
| `DATABASE_URL`, `POSTGRES_PASSWORD`        | Application database URL and Compose database credential                   |
| `MEILI_URL`, `MEILI_MASTER_KEY`            | Search endpoint and credential                                             |
| `MEILI_ENV`                                | Search environment; Compose defaults to production                         |
| `JWT_SECRET`                               | JWT signing secret; production requires at least 32 bytes                  |
| `AUTH_ENABLED`                             | `false` permits the development bypass outside production                  |
| `DATA_PATH`                                | Dataset root; host setup uses `./ubc-unified-data/data`                    |
| `PORT`                                     | Compose app/development host port (default `3000`)                         |
| `POSTGRES_PORT`                            | Compose Postgres host port (default `5432`)                                |
| `MEILI_PORT`                               | Compose Meilisearch host port (default `7700`)                             |
| `TRUSTED_CLIENT_IP_HEADER`                 | Optional proxy-overwritten single-IP header; see the security requirements |

`POSTGRES_PORT` and `MEILI_PORT` change only host mappings, bound to `127.0.0.1`. Host processes use loopback service URLs; match the ports in `DATABASE_URL` and `MEILI_URL` to those mappings for host-run commands. Compose uses container hostnames and fixed internal ports (`postgres:5432` and `meilisearch:7700`). The development container also binds to loopback; keep development servers off public networks. `npm run ingest` loads an optional root `.env` and preserves inherited environment variables.

### Request resources

| Variable               | Default  | Purpose                                           |
| ---------------------- | -------- | ------------------------------------------------- |
| `CHAT_MAX_CONCURRENT`  | `8`      | Admitted exchanges per server process             |
| `CHAT_TIMEOUT_MS`      | `180000` | Deadline before agent completion, in milliseconds |
| `TITLE_MAX_CONCURRENT` | `2`      | Concurrent background title operations            |
| `TITLE_TIMEOUT_MS`     | `15000`  | Title-generation deadline, in milliseconds        |
| `DB_POOL_MAX`          | `10`     | Connections in the shared process-local pool      |
| `DB_POOL_TIMEOUT_MS`   | `5000`   | Connection acquisition timeout, in milliseconds   |

Counts must be positive safe integers. Timer durations must fit 1–2,147,483,647 milliseconds. Excess chats receive 503 with `Retry-After`; per-user rate limits still return 429. Full title capacity leaves the existing fallback title unchanged.

You'll receive `done` after the required save succeeds. Disconnecting after agent completion does not discard that save attempt. Cancellation stops provider requests and new tool dispatch; tool and database operations that cannot abort can retain a slot until they settle.

Database acquisition has a deadline; queries retain their existing behavior without automatic mutation retries. Keep the pool limit below Postgres's connection limit, allowing for administration and other clients.

The browser and Google idle limits remain 60 and 15 seconds. Application read watchdogs clear when reads settle. The Google SDK retains its internal unref'd 20-second attempt timer until it fires; its API exposes no timer disposer.

## Commands

| Command                                            | Purpose                                                       |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                      | Development server                                            |
| `npm run build` / `npm start`                      | Production build / server                                     |
| `npm test`                                         | Vitest, one run                                               |
| `npm run lint`                                     | Biome                                                         |
| `npx tsc --noEmit --incremental false`             | TypeScript checks                                             |
| `npm run format` / `npm run format:check`          | Prettier                                                      |
| `npm run colors:generate` / `npm run colors:check` | Generate or verify theme color pairs                          |
| `npm run validate:documents`                       | Offline validation of published prose and host documents      |
| `npm run ingest`                                   | Index data into the configured Meilisearch destination        |
| `npm run pulse:publish -- <seed.json>`             | Publish a Pulse round; [operator guide](data/pulse/README.md) |

## Code ownership

| Path                                     | Responsibility                                     |
| ---------------------------------------- | -------------------------------------------------- |
| `app/`                                   | Pages, layouts, and HTTP route handlers            |
| `src/components/`                        | Feature UI and shared visual primitives            |
| `src/lib/`                               | Browser API client, parsers, and calculations      |
| `src/shared/`                            | Cross-layer contracts and data models              |
| `src/server/agent/`                      | Streaming tool-calling loop                        |
| `src/server/llm/`                        | Provider adapters                                  |
| `src/server/modules/`                    | Dataset transforms and tool definitions            |
| `src/server/db/`, `src/server/sessions/` | Schema initialization and conversation persistence |
| `scripts/`                               | Ingestion, validation, and maintenance commands    |

`src/components/ui/` owns shared controls and workspace frames. Feature stores own persistence and undo/redo; reusable calculations belong in `src/lib/`. Biome prevents client helpers from importing routes/components, shared modules from depending on application layers, and components from importing route entrypoints.

The chat endpoint streams NDJSON. The [agent event union](src/server/agent/stream.ts) and [client reader](src/lib/api.ts) define its events, including source updates, retracted drafts, completion, and errors. The [module registry](src/server/modules/index.ts) defines available tools. Consult `app/api/` for route contracts instead of maintaining a second endpoint inventory here.

## Data and ingestion

Raw datasets live in the `ubc-unified-data` git submodule. They include catalog/section data, fees, programs, geospatial data, services, events, and historical grades. The `grades` collector uses [UBC PAIR grade data](https://github.com/DonneyF/ubc-pair-grade-data).

Datasets and crawl caches stay outside application images and standalone output. Mount `DATA_PATH` read-only for the application; ingestion requires a writable data root for derived artifacts. After changing the submodule pin or index schema, validate and ingest into the intended search service before serving the new agent version.

### Published prose

Ingestion reads both publication formats:

- `prose/_catalog.json`: source-based article tables; [producer contract](ubc-unified-data/PROSE.md).
- `official-hosts.json`: Markdown roots that can span several category directories per host; [producer contract](ubc-unified-data/HOST-DOCUMENTS.md).

`npm run validate:documents` checks the complete published inventory offline. Missing files, count mismatches, invalid identities, or hash mismatches stop publication. Preserve original URLs, nullable dates, extraction warnings, and source-record references. Coverage means the published collections, not all UBC websites.

`search_ubc_pages` uses one relevance-ranked request across the `documents` and legacy `pages` indexes. Default search has no audience, topic, or date cutoff. Optional filters narrow scope; `next_offset` continues pagination. A hostname query without keyword matches can return a labeled host inventory; continue that inventory with the returned empty `query` and offset.

Search returns metadata and excerpts. The agent must read relevant full articles with `get_document` and the complete `original_id` before presenting procedures or eligibility. It retracts an unverified draft for one full-read attempt, then returns an error if verification still fails. Full retrieval uses Meilisearch and needs no corpus mount. Bounded overlapping search sections keep long articles searchable while retrieval preserves the complete Markdown and hash.

Use a Meilisearch release compatible with the installed SDK; integration checks use v1.54.2 from the project's `v1` image. Older versions can reject snapshot swaps even if search works. Missing indexes and authentication failures are errors, not permission to serve a smaller corpus.

### Structured facts

Undergraduate tables hold factual labels, links, housing-fee observations, and dated library hours rather than full page bodies. Keep `amount_cents` as its exact integer or null value. `booking_lid` and `hours_id` identify separate systems. Library schedules use `America/Vancouver` wall time and `closes_next_day`; missing dates mean unknown hours, not closure. See [the producer's source contracts](ubc-unified-data/UNDERGRADUATE-SOURCES.md).

Degree-planner files combine raw, derived, and curated data. Follow [the maintenance guide](scripts/degree-data/README.md) before regenerating them. Study-space descriptions, parking facts, and library schedules do not establish live availability.

### Batch limits

Ingestion confirms each request before submitting the next. Ordinary batches contain at most 500 documents and `INGEST_BATCH_BYTES` bytes of UTF-8 JSON, including brackets and commas. The default target is 8,388,608 bytes (8 MiB). A larger document travels alone, without truncation, up to `INGEST_MAX_REQUEST_BYTES` (default 100,000,000 bytes, matching Meilisearch). A document above that ceiling fails before a replacement swap.

Both limits must be positive safe integers, with the batch target at or below the request ceiling. Match the ceiling to Meilisearch and any intervening proxy; increase their payload allowances together when needed.

### Snapshot publication

`documents`, `student_resources`, `housing_fees`, and `library_hours` replace complete snapshots. Ingestion loads a temporary index, waits for validation/tasks, derives required artifacts, and swaps the replacement into the live name. A pre-swap failure preserves the previous snapshot. Post-swap cleanup failure reports an error without undoing publication. Other indexes retain upsert behavior.

Run one ingestion process per destination and allow disk space for both generations. Ingestion attempts remaining indexes after failure and exits nonzero if any index fails. Source retrieval/modification dates remain distinct from index-build freshness.

## Announcements

Unity lists Announcements first. `/app/pulse/announcements` shows newest-first cards linking to `/app/pulse/announcements/:slug`.

Copy [the example](content/announcements/welcome-to-announcements.md) into a new `content/announcements/<slug>.md`. Use a lowercase, hyphenated filename and keep it after publication so shared links remain valid. Put JSON metadata between `---` lines, followed by a non-empty Markdown body. Require non-empty `title`, `date`, `summary`, and `author` strings; `date` must be a real `YYYY-MM-DD` date. Use `##` for body sections because the page supplies the main title. GFM tables, links, images, lists, and fenced code work; raw HTML does not render.

Sort order is date descending, then filename ascending. Invalid files fail with their filename. Dates control ordering, not scheduled publication: keep drafts and private information outside this folder. Preview the feed and detail page, run `npm test` and `npm run build`, then deploy. Announcements ship with the app and need no database migration or ingestion.

## Production

The Dockerfile builds a standalone Node application and runs it as a non-root user. Compose mounts datasets without write access for the app. Build before deployment rather than competing with the live database/search engine for resources.

Use `npm run build`: its postbuild step removes environment files that Next copies into standalone output outside trace exclusions. Supply secrets at runtime. The runner needs `.next/standalone`, `.next/static`, and `public`, including both MapLibre worker modules; the Dockerfile copies these assets. Tests, specs, local tooling, and mounted datasets stay outside the release. Inspect local artifact sizes with `du -sb .next/standalone .next/static public`.

Use the production-only resource override; leave it out of development commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build app
```

| Service     | CPU cap | RAM cap   | Internal limits                                 |
| ----------- | ------- | --------- | ----------------------------------------------- |
| App         | 1       | 1,024 MiB | 640 MiB Node old-space; 10 database connections |
| Postgres    | 1       | 512 MiB   | 40 connections; 128 MB shared buffers           |
| Meilisearch | 1       | 2,048 MiB | 768 MiB indexing memory; 1 indexing thread      |

Tune the variables in [`docker-compose.production.yml`](docker-compose.production.yml) for your host. Reserve RAM for the OS, Docker, native allocations, and separate ingestion; these defaults do not establish host capacity. Keep indexing memory below search-container memory. The production override also aligns Meilisearch's HTTP payload ceiling with `INGEST_MAX_REQUEST_BYTES`.

`APP_MEMORY_MB` and `NODE_HEAP_MB` use positive integer MiB budgets. Set both when configuring memory. Compose supplies Node's `--max-old-space-size`; outside Compose, set it through `NODE_OPTIONS`. Startup exits on invalid budgets, including a declared old-space budget or actual V8 heap limit at or above app memory. Leave headroom for V8's young generation and memory outside the heap. Development without these variables remains unconstrained.

Place the app behind an HTTPS reverse proxy with unbuffered chat streaming, request and connection limits, and the controls in [SECURITY.md](SECURITY.md). Apply the same settings to the search endpoint used by ingestion and the app. Read-only app credentials and ingestion/admin credentials have different privileges.

## Documentation

- [PRODUCT.md](PRODUCT.md): audiences, supported workflows, and limitations.
- [DESIGN.md](DESIGN.md): tokens and shared UI contracts; surface briefs own feature details.
- [SECURITY.md](SECURITY.md): deployment controls, security limitations, and account-data recovery.
- [AGENTS.md](AGENTS.md): contributor rules and verification/commit conventions.
- [Production-efficiency checklist](.kiro/specs/production-efficiency/tasks.md): implementation and verification results.

Built for UBC CIC Hackathon 2026.
