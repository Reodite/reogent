# Reogent

Conversational AI for UBC students. Ask about courses, tuition, walking routes, parking, events, or study spaces. A streaming agent answers from indexed campus data and draws walking routes on an interactive map.

Built with Next.js 16 (App Router), React 19, and TypeScript.

## Stack

| Layer    | Choice                                                |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4                  |
| Map      | MapLibre GL + deck.gl                                 |
| Auth     | Username/password, JWT (HS256, 7-day expiry)          |
| AI       | Anthropic, OpenAI-compatible, or Google, via adapters |
| Database | Postgres (users, sessions, messages)                  |
| Search   | Meilisearch (campus datasets)                         |
| Testing  | Vitest, fast-check (property tests)                   |
| Lint     | Biome, Prettier                                       |

## Agent and tools

The agent runs a streaming tool-calling loop. Each user message can trigger up to 8 model turns. The model calls tools, receives results, and continues until it can respond. The client receives NDJSON events (`thinking`, `text`, `tool_start`, `tool_end`, `done`).

20 tools across 12 modules:

| Module     | Tools                                                          | Data source                                           |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| courses    | `search_courses`, `get_course`                                 | Course catalog + section schedules                    |
| tuition    | `get_tuition`                                                  | Tuition rates by program/cohort                       |
| buildings  | `walking_distance`, `find_building`                            | Building centroids + Dijkstra on a pedestrian network |
| admissions | `search_programs`, `get_admission_requirements`                | you.ubc.ca program data                               |
| costs      | `get_cost_estimate`, `get_living_costs`, `search_student_fees` | UBC financial estimates                               |
| calendar   | `get_key_dates`                                                | Academic calendar dates                               |
| places     | `find_places`                                                  | Points of interest (cafes, libraries, banks)          |
| parking    | `find_parking`                                                 | Parking lots with rates and accessibility             |
| spaces     | `search_study_spaces`, `find_free_rooms`, `get_room_schedule`  | Classrooms + library rooms                            |
| events     | `search_events`                                                | events.ubc.ca                                         |
| pages      | `search_ubc_pages`                                             | UBC web pages                                         |
| grades     | `search_grades`, `get_grades`                                  | UBC pair grade distributions                          |

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
    ├── modules/              12 data modules (tool definitions + dataset access)
    ├── llm/                  LLM adapters (openai, anthropic, google)
    ├── sessions/             Postgres session store
    ├── db/                   Postgres schema + migration
    ├── data.ts               Filesystem store for raw datasets
    └── search.ts             Meilisearch client

scripts/
└── ingest.ts                 Index datasets into Meilisearch
```

## Data

`ubc-unified-data` is a git submodule holding scraped UBC datasets: courses, tuition, building and walking GeoJSON, study spaces, events, and grade distributions (`data/grades/`, collected from [ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data) by the submodule's `grades` collector).

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

The server opens at http://localhost:3000 and applies the Postgres schema on startup.

### Environment variables

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| `LLM_API_TYPE`      | `openai`, `anthropic`, or `google` (default openai) |
| `LLM_BASE_URL`      | Base URL for OpenAI-compatible endpoints            |
| `LLM_MODEL`         | Model identifier                                    |
| `LLM_API_KEY`       | Provider API key                                    |
| `DATABASE_URL`      | Postgres connection string                          |
| `POSTGRES_PASSWORD` | Postgres password (docker compose)                  |
| `MEILI_URL`         | Meilisearch base URL                                |
| `MEILI_MASTER_KEY`  | Meilisearch master key                              |
| `MEILI_ENV`         | Meilisearch environment (docker compose)            |
| `AUTH_ENABLED`      | Set `false` in non-production to bypass auth        |
| `JWT_SECRET`        | HMAC secret for signing tokens                      |
| `DATA_PATH`         | Root of the raw dataset files                       |
| `PORT`              | Dev-server port (docker compose)                    |

## Scripts

| Command          | Action                          |
| ---------------- | ------------------------------- |
| `npm run dev`    | Start dev server                |
| `npm run build`  | Production build                |
| `npm run lint`   | Biome lint                      |
| `npm test`       | Vitest (unit tests)             |
| `npm run format` | Prettier format                 |
| `npm run ingest` | Index datasets into Meilisearch |

## API endpoints

| Method | Path                   | Purpose                                      |
| ------ | ---------------------- | -------------------------------------------- |
| POST   | `/api/chat`            | Stream agent response (NDJSON)               |
| GET    | `/api/sessions`        | List user sessions                           |
| GET    | `/api/sessions/:id`    | Session messages                             |
| PATCH  | `/api/sessions/:id`    | Rename a session                             |
| DELETE | `/api/sessions/:id`    | Delete a session                             |
| GET    | `/api/route?from=&to=` | Walking-route polyline                       |
| GET    | `/api/building/:code`  | Building details (rooms, POIs, availability) |
| GET    | `/api/geo/:name`       | GeoJSON layer                                |
| POST   | `/api/auth/login`      | Sign in, returns JWT                         |
| POST   | `/api/auth/register`   | Create account, returns JWT                  |
| GET    | `/api/preview?url=`    | Resolve og:image for card links              |

## Example query

```
How long is the walk from the Buchanan building to ICICS,
and what Computer Science courses have no prerequisites?
```

This triggers `walking_distance` and `search_courses` in a single agent turn.

## License

Built for UBC CIC Hackathon 2026.
