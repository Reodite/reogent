# Reogent

A conversational AI for UBC students. Ask about courses, tuition, walking routes, parking, events, or study spaces. The agent queries indexed university datasets and renders walking routes on an interactive campus map.

Built with Next.js 16, React 19, Amazon Bedrock (Claude), and deployed serverlessly via CDK.

## Preview

|                                                                                                                       |                                                                                                                       |                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ![Screenshot 1](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171441.png) | ![Screenshot 2](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171502.png) | ![Screenshot 3](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171540.png) |
| ![Screenshot 4](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171552.png) | ![Screenshot 5](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171644.png) | ![Screenshot 6](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171649.png) |
| ![Screenshot 7](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171655.png) | ![Screenshot 8](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171700.png) | ![Screenshot 9](https://github.com/ChakornK/reogent-archive/releases/download/video/Screenshot_2026-08-06_171705.png) |

[Video demo](https://github.com/ChakornK/reogent-archive/releases/download/video/2026-08-06.17-18-48.mp4)

## Architecture

```
Browser                     AWS
  │                          │
  │  Next.js 16 (React 19)  │  CloudFront + Lambda (cdk-nextjs-standalone)
  │  MapLibre GL + deck.gl   │  Cognito (Google IdP)
  │                          │  Bedrock (Claude, Converse API, streaming)
  │  ◄── NDJSON stream ──►  │  OpenSearch 2.17 (16 indices)
  │                          │  DynamoDB (chat sessions)
  │                          │  S3 (data assets, GeoJSON layers)
```

| Layer    | Stack                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Frontend | Next.js 16, React 19, MapLibre GL, deck.gl                                               |
| Auth     | Amazon Cognito with Google Identity Provider                                             |
| AI       | Amazon Bedrock (Claude via Converse API), streaming tool-calling loop, 8-iteration limit |
| Search   | Amazon OpenSearch for structured campus data (15 indices)                                |
| Storage  | DynamoDB (session persistence), S3 (raw datasets + derived GeoJSON)                      |
| Infra    | CDK with `cdk-nextjs-standalone` (OpenNext) on CloudFront + Lambda                       |

## Agent and Tools

The agent runs a streaming tool-calling loop over Bedrock's Converse API with extended thinking. Each user message can trigger up to 8 model turns. The model calls tools, receives results, and continues until it has enough information to respond.

16 tools across 11 modules:

| Module     | Tools                                                          | Data Source                                         |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------- |
| courses    | `search_courses`, `get_course`                                 | Course catalogue + section schedules                |
| tuition    | `get_tuition`                                                  | Tuition rates by program/cohort                     |
| buildings  | `walking_distance`, `find_building`                            | Building centroids + Dijkstra on pedestrian network |
| admissions | `search_programs`, `get_admission_requirements`                | you.ubc.ca program data                             |
| costs      | `get_cost_estimate`, `get_living_costs`, `search_student_fees` | UBC financial estimates                             |
| calendar   | `get_key_dates`                                                | Academic calendar dates                             |
| places     | `find_places`                                                  | Points of interest (cafes, libraries, banks)        |
| parking    | `find_parking`                                                 | Parking lots with rates and accessibility           |
| spaces     | `search_study_spaces`, `find_free_rooms`, `get_room_schedule`  | Classrooms + library rooms                          |
| events     | `search_events`                                                | events.ubc.ca                                       |
| pages      | `search_ubc_pages`                                             | Full-text across UBC web pages                      |

Walking routes use Dijkstra shortest-path on a pedestrian network graph derived from GeoJSON. The graph loads lazily from S3 with a 10-minute TTL cache.

## Project Structure

```
app/
├── page.tsx                    # Landing page (cinematic product reveal)
├── layout.tsx                  # Root layout
├── chat/
│   ├── layout.tsx              # App shell (sidebar + panels)
│   ├── page.tsx                # New-chat redirect
│   └── [session_id]/page.tsx   # Per-session chat
└── api/
    ├── chat/route.ts           # POST — streaming agent endpoint
    ├── sessions/route.ts       # GET/POST sessions
    ├── sessions/[id]/route.ts  # GET/DELETE single session
    ├── route/route.ts          # GET — walking route polyline
    ├── profile/route.ts        # GET — user profile
    └── geo/[name]/route.ts     # GET — GeoJSON layers from S3

src/
├── server/
│   ├── agent/                  # Tool-calling loop (streaming + non-streaming)
│   ├── modules/                # 11 data modules (tool definitions + OpenSearch queries)
│   ├── sessions/               # DynamoDB session store
│   ├── bedrock.ts              # Bedrock client wrapper
│   ├── routing.ts              # Dijkstra shortest-path
│   ├── search.ts               # SigV4-signed OpenSearch client
│   └── s3.ts                   # S3 reader
├── components/
│   ├── chat/                   # Chat panel, input, messages, tool renderers
│   ├── map/                    # MapLibre + deck.gl campus map
│   ├── shell/                  # App shell, sidebar, user menu
│   ├── landing/                # Landing page components
│   └── auth/                   # Auth provider
└── lib/                        # Client utilities (API client, formatting, geo)

infra/
├── bin/app.ts                  # CDK app entry
└── lib/campus-ai-stack.ts      # Single stack: Cognito, DynamoDB, S3, OpenSearch, Next.js

scripts/
├── sync-data.mjs              # Upload Unified-UBC-Data/ to S3
├── ingest.ts                  # Index all datasets into OpenSearch
└── smoke.ts                   # Smoke tests against deployed stack
```

## Data

The `Unified-UBC-Data` git submodule contains scraped/aggregated UBC datasets:

| Directory            | Content                                                     |
| -------------------- | ----------------------------------------------------------- |
| `academic-calendar/` | Courses, subjects, pages, dates                             |
| `admissions/`        | Programs, interests, requirements                           |
| `campus-services/`   | Student services, recreation, food, news, holidays          |
| `courses/`           | Section schedules per term                                  |
| `events/`            | Campus events                                               |
| `finances/`          | Tuition, living costs, student fees, program cost estimates |
| `geospatial/`        | Buildings, POI, parking, walking routes (GeoJSON)           |
| `learning-spaces/`   | Room data                                                   |
| `room-bookings/`     | Library room availability                                   |
| `reports/`           | Published document metadata                                 |

## Prerequisites

- Node.js 24
- AWS CLI configured with permissions for CDK deploy
- Google OAuth 2.0 credentials

## Setup

### 1. Google OAuth

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. APIs & Services > OAuth consent screen. Configure (External type works for dev).
3. APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID.
4. Application type: **Web application**.
5. Authorized redirect URI: `https://{CognitoDomain}/oauth2/idpresponse` (you'll get the Cognito domain from CDK output).
6. Save the Client ID and Client Secret.
7. After deploy, add the CloudFront URL as an authorized JavaScript origin.

### 2. Install

```bash
npm install
git submodule update --init
```

### 3. Configure

Copy `.env.example` to `.env` and fill in the deploy inputs:

| Variable                | Required | Description                                                    |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | Yes      | OAuth 2.0 Client ID                                            |
| `GOOGLE_CLIENT_SECRET`  | Yes      | OAuth 2.0 Client Secret                                        |
| `INGEST_PRINCIPAL_ARN`  | Yes      | IAM principal ARN for running ingestion                        |
| `CALLBACK_URL`          | Yes      | OAuth callback (use `http://localhost:3000/` for first deploy) |
| `COGNITO_DOMAIN_PREFIX` | Yes      | Globally unique Cognito hosted UI prefix                       |
| `BEDROCK_MODEL_ID`      | Yes      | e.g. `anthropic.claude-sonnet-4-20250514`                      |
| `SKIP_BUILD`            | No       | Set `true` to skip Next.js build during synth                  |

### 4. Deploy

```bash
cd infra
npx cdk deploy
```

After deploy, copy these stack outputs back into `.env`:

| Variable               | Stack Output         | Used By                       |
| ---------------------- | -------------------- | ----------------------------- |
| `COGNITO_USER_POOL_ID` | `UserPoolId`         | Local dev, token verification |
| `COGNITO_CLIENT_ID`    | `UserPoolClientId`   | Local dev, token verification |
| `COGNITO_DOMAIN`       | `CognitoDomain`      | OAuth flow                    |
| `OPENSEARCH_ENDPOINT`  | `OpenSearchEndpoint` | Ingest script                 |
| `TABLE_NAME`           | `TableName`          | Local dev                     |
| `DATA_BUCKET`          | `DataBucketName`     | Ingest, sync-data             |
| `STACK_URL`            | `CloudFrontUrl`      | Smoke tests                   |

Then update `CALLBACK_URL` to the CloudFront URL and redeploy.

Also set the `NEXT_PUBLIC_` client-side variables (see `.env.example` for the full list).

### 5. Ingest Data

```bash
npm run sync-data    # Upload Unified-UBC-Data/ to S3
npm run ingest       # Index into OpenSearch
```

Both are idempotent. Re-running produces no duplicates.

## Local Development

```bash
npm run dev
```

Opens at http://localhost:3000.

## Scripts

| Command             | Action                     |
| ------------------- | -------------------------- |
| `npm run dev`       | Start dev server           |
| `npm run build`     | Production build           |
| `npm run lint`      | Biome lint                 |
| `npm run test`      | Vitest (unit tests)        |
| `npm run format`    | Prettier format            |
| `npm run sync-data` | Upload data to S3          |
| `npm run ingest`    | Index data into OpenSearch |

## API Endpoints

| Method | Path                     | Purpose                                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------------------ |
| POST   | `/api/chat`              | Stream agent response (NDJSON: `thinking`, `text`, `tool_start`, `tool_end`, `done`) |
| GET    | `/api/sessions`          | List user sessions                                                                   |
| POST   | `/api/sessions`          | Create session                                                                       |
| GET    | `/api/sessions/:id`      | Get session with messages                                                            |
| DELETE | `/api/sessions/:id`      | Delete session                                                                       |
| GET    | `/api/route?from=X&to=Y` | Walking route polyline                                                               |
| GET    | `/api/profile`           | Current user profile                                                                 |
| GET    | `/api/geo/:name`         | GeoJSON layer from S3                                                                |

## Example Query

```
How long is the walk from the Buchanan building to ICICS,
and what Computer Science courses have no prerequisites?
```

This triggers `walking_distance` and `search_courses` in a single agent turn.

## Tech Stack

| Category    | Choice                                                      |
| ----------- | ----------------------------------------------------------- |
| Framework   | Next.js 16 (App Router)                                     |
| UI          | React 19, Tailwind CSS 4                                    |
| Map         | MapLibre GL + deck.gl                                       |
| Fonts       | Aspekta (sans), Commit Mono (mono)                          |
| Icons       | Mingcute                                                    |
| AI          | Amazon Bedrock (Converse API, streaming, extended thinking) |
| Auth        | Amazon Cognito + Google IdP via `react-oidc-context`        |
| Database    | DynamoDB (single-table, PAY_PER_REQUEST)                    |
| Search      | Amazon OpenSearch 2.17                                      |
| Storage     | S3                                                          |
| Infra       | AWS CDK, `cdk-nextjs-standalone` (OpenNext)                 |
| Testing     | Vitest, fast-check (property tests)                         |
| Lint/Format | Biome, Prettier                                             |

## License

Built for UBC CIC Hackathon 2026.
