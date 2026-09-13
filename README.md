# Reodite

Conversational AI for UBC students. Ask about courses, tuition, walking routes, parking, events, or study spaces. A streaming agent answers from indexed campus data and draws walking routes on an interactive map.

Built with Next.js 16 (App Router), React 19, and TypeScript.

## Stack

| Layer    | Choice                                                |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4                  |
| Map      | MapLibre GL + deck.gl                                 |
| Auth     | Username/password, JWT (HS256, 7-day expiry)          |
| AI       | Anthropic, OpenAI-compatible, or Google, via adapters |
| Database | Postgres (users, sessions, messages, Pulse votes)     |
| Search   | Meilisearch (campus datasets)                         |
| Testing  | Vitest, fast-check (property tests)                   |
| Lint     | Biome, Prettier                                       |

## Responsive UI

Below 640px, Chat, Tools, Unity, and Settings use flat, edge-to-edge pages above persistent AI/Tools/Unity bottom tabs. Mode links restore each area's last routed screen. Route headers contain a flat menu button; the current mode's destinations open in an edge-attached drawer with touch-sized rows. Header content and command groups keep 16px side insets; the mobile menu's interaction surface extends to 8px edge clearance. Bottom-tab feedback sits 8px inside each full-size hit region, and phone text fields use 16px text. At wider sizes, the shell keeps its 12px gutters, raised panels, and sidebar mode controls.

Shared layout lives in `src/components/ui/workspace.tsx`, `src/components/chat/chat-frame.tsx`, and `app/globals.css`. `WorkspaceHostProvider` supplies header navigation to loaded, pending, and recovery frames. Keep navigation outside pending-only inert regions. `src/components/shell/mode-toggle.tsx` owns both mode presentations, and `use-mobile-viewport.ts` sizes the phone shell and overlays to the reported visible area without constraining pinch zoom. The bottom bar owns the page's bottom safe area. The 55rem workspace container threshold still controls rail/canvas switching.

Shared optical contracts live in `src/components/ui/workspace.tsx`: a 28px title anchor, 16px plain panel insets, and a 2px `frame` canvas surround for timetables. Keep theme groups intrinsic-width. Follow the measured concentric-contour recipes in `DESIGN.md`; independent cards and controls keep their own geometry.

Shared motion lives in `src/components/ui/use-overlay-presence.ts`, `src/components/ui/disclosure.tsx`, and the CSS arrival utilities. Keep `AnimatePresence` outside conditional overlay components, and let the shared primitives release focus and disable exiting controls. Data replacement stays immediate; avoid retaining obsolete search, group, or route content for a fade. Reduced-motion paths cover both entrances and exits.

Development indicators stay disabled so framework chrome does not cover the mobile tabs; Next.js still surfaces compile and runtime errors.

See `DESIGN.md`, `PRODUCT.md`, and `.impeccable/surfaces/` for design contracts. Run `npm test` for shared UI and layout regressions, then check rendered phone and desktop views for overflow and focus placement.

## Agent and tools

The agent runs a streaming tool-calling loop. Each user message can trigger up to 8 model turns. The model calls tools, receives results, and continues until it can respond. The client receives NDJSON events (`thinking`, `text`, `tool_start`, `tool_end`, `done`).

The module registry defines data access and presentation tools:

| Module          | Tools                                           | Data source                                                        |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| courses         | `find_courses`, `get_course`                    | Course catalog and section schedules                               |
| tuition, costs  | `get_costs`                                     | Tuition, cost estimates, student fees and housing fee observations |
| buildings       | `walking_distance`, `find_building`             | Building coordinates and pedestrian routes                         |
| admissions      | `find_programs`, `get_admission_requirements`   | Undergraduate programs and requirements                            |
| calendar        | `get_key_dates`                                 | Academic calendar dates                                            |
| places, parking | `find_places`                                   | Campus POIs and parking facts                                      |
| spaces          | `find_study_spaces`                             | Study-area and classroom descriptions                              |
| events          | `find_events`                                   | Campus events                                                      |
| pages           | `search_ubc_pages`                              | Legacy page excerpts and document metadata                         |
| documents       | `get_document`                                  | Complete indexed Markdown documents and provenance                 |
| undergraduate   | `search_student_resources`, `get_library_hours` | Housing, libraries, support and policy source/fact records         |
| grades          | Through `get_course` and grade widgets          | Grade distributions                                                |
| people          | `find_person`                                   | Faculty/staff directory profiles                                   |
| food            | `find_food`                                     | Food outlets                                                       |
| prereq-tree     | `get_prereq_tree`                               | Course prerequisite graph                                          |
| widgets         | `show_widget`                                   | Presentation of previously retrieved entities                      |

Walking routes use Dijkstra shortest-path on a pedestrian network derived from GeoJSON.

## Project structure

```
app/                          Route handlers + pages
├── api/                      /api/* endpoints
│   ├── chat/route.ts         POST streaming agent response
│   ├── sessions/route.ts     GET sessions
│   ├── sessions/[id]/route.ts GET/DELETE/PATCH one session
│   ├── route/route.ts        GET walking-route polyline
│   ├── building/[code]/route.ts GET building details
│   ├── geo/[name]/route.ts   GET GeoJSON layers
│   ├── auth/login|register   POST sign-in / sign-up
│   └── preview/route.ts      GET og:image resolution for card links
└── chat/                     App-shell chat workspace

src/
├── components/               UI (auth, chat, map, shell, landing)
├── lib/                      Client utils (API client, formatting, geo)
└── server/
    ├── agent/                Streaming tool-calling loop
    ├── modules/              Dataset adapters and tool definitions
    ├── llm/                  LLM adapters (openai, anthropic, google)
    ├── sessions/             Postgres session store
    ├── db/                   Postgres schema + migration
    ├── data.ts               Filesystem store for raw datasets
    └── search.ts             Shared Meilisearch client

scripts/
└── ingest.ts                 Index datasets into Meilisearch
```

## Data

`ubc-unified-data` is a git submodule holding scraped UBC datasets: courses, tuition, building and walking GeoJSON, study spaces, events, and grade distributions (`data/grades/`, collected from [ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data) by the submodule's `grades` collector).

The undergraduate tables contain factual labels, source links, housing fee observations and dated library hours. They do not contain full page bodies. Housing `amount_cents` values retain their exact integer or null value; consult the linked conditions before using a rate. Library `booking_lid` strings belong to a separate namespace from `hours_id`. Hours describe a schedule in `America/Vancouver`, including `closes_next_day`; an absent date remains unknown. See [UNDERGRADUATE-SOURCES.md](ubc-unified-data/UNDERGRADUATE-SOURCES.md) for table contracts.

Room booking availability is outside the dataset and tool scope. Study-space descriptions and scheduled library hours do not establish live vacancy.

### Documents

The data submodule includes the Markdown corpus described in [DOCUMENTS.md](ubc-unified-data/DOCUMENTS.md). `npm run ingest` reads `DATA_PATH/documents/_catalog.json` and its declared article arrays into the `documents` index alongside the other campus datasets. The loader rejects incomplete catalogs, table count/hash mismatches and colliding sanitized IDs. Documents contain article bodies; structured tables contain facts and links. Both can use JSON and CSV exports.

`search_ubc_pages` searches documents and legacy pages through the shared Meilisearch client. It returns article metadata and bounded legacy excerpts, preferring normalized articles for matching canonical URLs or source-record joins. `get_document` retrieves a complete indexed Markdown document using its `documents:<subcategory>:<identity>` original ID and verifies its identity and content hash. Both tools use the same search configuration in development and production; only ingestion reads the corpus files.

Documents retain their source URLs, publisher and retrieval timestamps, source-record joins and conversion warnings. The UI renders safe Markdown without raw HTML or remote image embeds and displays one Documents category with source/topic subcategories. Use the source's scope and dates when answering questions about requirements or availability. Faculty guidance includes `lfs-advising` and `kinesiology-advising`; see [FACULTY-GUIDANCE.md](ubc-unified-data/FACULTY-GUIDANCE.md) for coverage and image, PDF and form limitations.

Datasets and crawl caches stay outside application images and standalone output. Mount `DATA_PATH` for filesystem-backed tools and ingestion.

The document namespace changes the catalog path, index, ID prefix and retrieval tool. Update the data submodule and run normal ingestion before using this version. After the `documents` snapshot publishes and records freshness, ingestion deletes the obsolete `prose` index. A validation or publication failure preserves the old index; a retirement failure reports failure and leaves the new snapshot available for a retry. Coordinate this refresh with application rollout: an older application still queries `prose`. Saved citations and activity keep their source details and display the Documents label; the current agent exposes only `get_document`.

### Snapshot replacement

`student_resources`, `housing_fees`, `library_hours` and `documents` replace their complete snapshots. Ingestion loads and validates a temporary index, waits for its tasks, then swaps it into place. This removes dated records absent from the next library-hours snapshot. A pre-swap failure leaves the previous index active; cleanup errors report failure without rolling back an already published snapshot. Other indexes retain upsert behavior.

Run one ingestion process per destination and allow storage for both generations during replacement. Ingestion requires a writable `DATA_PATH` for derived artifacts; the application can use a read-only data mount. Source `retrieved_at` timestamps remain distinct from index-build times and publisher modification dates.

## Setup

Requirements: Node.js 24, Docker.

```bash
npm install
git submodule update --init
cp .env.example .env
docker compose up -d postgres meilisearch
npm run ingest
npm run dev
```

The server opens at http://localhost:3000 and applies the Postgres schema on startup. The sample environment points host processes at `localhost`; Docker Compose overrides those service URLs with container hostnames.

`npm run ingest` loads the root `.env` when present and preserves variables you set in the shell or Docker. Set `MEILI_MASTER_KEY` to the key used by the Meilisearch service. Ingestion attempts the remaining indexes after a failure and exits nonzero if any index fails.

### Environment variables

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| `LLM_API_TYPE`      | `openai`, `anthropic`, or `google` (default openai) |
| `LLM_BASE_URL`      | Base URL for OpenAI-compatible endpoints            |
| `LLM_MODEL`         | Model identifier                                    |
| `LLM_API_KEY`       | Provider API key                                    |
| `DATABASE_URL`      | Postgres URL (`localhost:5432` on host)             |
| `POSTGRES_PASSWORD` | Postgres password (docker compose)                  |
| `MEILI_URL`         | Meilisearch URL (`localhost:7700` on host)          |
| `MEILI_MASTER_KEY`  | Meilisearch master key                              |
| `MEILI_ENV`         | Meilisearch environment (docker compose)            |
| `AUTH_ENABLED`      | Set `false` in non-production to bypass auth        |
| `JWT_SECRET`        | HMAC secret for signing tokens                      |
| `DATA_PATH`         | Raw data root (`./ubc-unified-data/data` on host)   |
| `PORT`              | Dev-server port (docker compose)                    |

## Scripts

| Command                 | Action                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start dev server                                               |
| `npm run build`         | Production build                                               |
| `npm run lint`          | Biome lint                                                     |
| `npm test`              | Vitest (unit tests)                                            |
| `npm run format`        | Prettier format                                                |
| `npm run ingest`        | Index campus datasets and documents into Meilisearch           |
| `npm run pulse:publish` | Publish a Pulse question round ([guide](data/pulse/README.md)) |

## API endpoints

| Method | Path                   | Purpose                                    |
| ------ | ---------------------- | ------------------------------------------ |
| POST   | `/api/chat`            | Stream agent response (NDJSON)             |
| GET    | `/api/sessions`        | List user sessions                         |
| GET    | `/api/sessions/:id`    | Session messages                           |
| PATCH  | `/api/sessions/:id`    | Rename a session                           |
| DELETE | `/api/sessions/:id`    | Delete a session                           |
| GET    | `/api/route?from=&to=` | Walking-route polyline                     |
| GET    | `/api/building/:code`  | Building details (rooms, POIs, entrances)  |
| GET    | `/api/geo/:name`       | GeoJSON layer                              |
| GET    | `/api/pulse`           | Active Pulse round with the caller's votes |
| POST   | `/api/pulse/vote`      | Record an agree/disagree vote              |
| GET    | `/api/pulse/history`   | Locked Pulse rounds with final tallies     |
| POST   | `/api/auth/login`      | Sign in, returns JWT                       |
| POST   | `/api/auth/register`   | Create account, returns JWT                |
| GET    | `/api/preview?url=`    | Resolve og:image for card links            |

## Example query

```
How long is the walk from the Buchanan building to ICICS,
and what Computer Science courses have no prerequisites?
```

This triggers `walking_distance` and `find_courses` in a single agent turn.

## License

Built for UBC CIC Hackathon 2026.
