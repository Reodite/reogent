<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Reogent

Conversational AI for UBC students. Ask about courses, tuition, walking routes, parking, events, or study spaces; answers render on an interactive campus map.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- LLM layer: `src/server/llm/` (Anthropic, OpenAI, Google; selectable via `LLM_API_TYPE`)
- Postgres + Meilisearch, run via `docker-compose.yml`
- Data from git submodule `ubc-unified-data/` (grades raw data under `data/grades/raw/`, synced by `scripts/sync-grades.sh` inside the submodule)
- Map: MapLibre GL + deck.gl

## Commands

- `npm run dev` — dev server
- `npm run lint` — Biome
- `npm test` — Vitest (run once; `--passWithNoTests`)
- `npm run format` / `npm run format:check` — Prettier
- `npm run ingest` — re-index datasets into Meilisearch
- `npm run prep-grades` — regenerate grade fixtures
- Never run long-lived watchers; run them manually in a terminal.

## Conventions

- Routes in `app/`; shared UI in `src/components/`; client helpers in `src/lib/`; server logic (agent, modules, LLM, DB) in `src/server/`; cross-cutting types in `src/shared/`
- Colocate tests as `*.test.ts` next to the code under test (Vitest)
- Follow Biome lint and Prettier formatting (`npm run lint`, `npm run format:check`)
- Docs: `README.md` (overview), `DESIGN.md` (visual design), `PRODUCT.md` (product spec)
- Do not commit `.env*` (ignored) or `impeccable` critique state (`.impeccable/critique/`)
