# Reodite

Reodite helps UBC students find campus information through chat and an interactive map.

Ask about courses, tuition, events, parking, study spaces, or walking between buildings.

## Try Reodite

If you have access to a Reodite deployment, open it and start a conversation.

Ask a question in everyday language. For example:

> How long is the walk from Buchanan to ICICS, and which Computer Science courses have no prerequisites?

Reodite can answer both parts in one conversation.

Some answers include a map or another interactive view.

## Run Reodite on your computer

You need Node.js 24 or newer, Docker, and an LLM provider. Reodite supports OpenAI-compatible services, Anthropic, and Google; see the configuration table below to choose one.

1. Clone the repository and enter its folder:

   ```bash
   git clone https://github.com/Reodite/reogent.git
   cd reogent
   ```

2. Install dependencies and download the campus data:

   ```bash
   npm install
   git submodule update --init
   ```

3. Create your local settings file:

   ```bash
   cp .env.example .env
   ```

   Set the values listed in the [configuration reference](#configuration-reference). The sample values are in [`.env.example`](.env.example).

4. Start the services and prepare the campus data:

   ```bash
   docker compose up -d postgres meilisearch
   ```

   Validate and index the data:

   ```bash
   npm run validate:documents
   npm run ingest
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and ask a question.

   The server applies the database schema when it starts.

## Configuration reference

This table lists the app's configurable environment variables.

Keep secrets in `.env`. Do not commit that file.

| Variable                   | What it controls                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_TYPE`             | Provider: `openai`, `anthropic`, or `google`. Defaults to `openai`.                                                                                                                                                   |
| `LLM_MODEL`                | Model name. Defaults to `llama3.1`, `claude-sonnet-4-20250514`, or `gemini-2.0-flash`, depending on provider.                                                                                                         |
| `LLM_API_KEY`              | Provider API key. Google accepts comma-separated keys and rotates between them.                                                                                                                                       |
| `LLM_BASE_URL`             | Optional endpoint for OpenAI-compatible services or an Anthropic-compatible proxy.                                                                                                                                    |
| `DATABASE_URL`             | Postgres connection URL. Use `localhost:5432` for host-run commands. Its password must match `POSTGRES_PASSWORD`; Compose uses its Postgres service address inside containers.                                        |
| `POSTGRES_PASSWORD`        | Postgres password. Generate a unique value with `openssl rand -hex 32`; use it in `DATABASE_URL` too. To change it for an existing database, update the password inside Postgres; editing `.env` alone is not enough. |
| `MEILI_URL`                | Meilisearch address. Use `http://localhost:7700` for host-run commands; Compose uses its service address inside containers.                                                                                           |
| `MEILI_MASTER_KEY`         | Meilisearch admin key for ingestion. Generate a unique value with `openssl rand -hex 32`; Compose removes it from the app container.                                                                                  |
| `MEILI_API_KEY`            | Read-only key used by the app in production. Local development can fall back to `MEILI_MASTER_KEY`.                                                                                                                   |
| `MEILI_ENV`                | Meilisearch environment for Compose. Defaults to `production`.                                                                                                                                                        |
| `DATA_PATH`                | Folder containing campus data. Set to `./ubc-unified-data/data` for this repository; defaults to `./data`.                                                                                                            |
| `JWT_SECRET`               | Session-signing secret. Generate a unique value with `openssl rand -hex 32`; production requires at least 32 bytes.                                                                                                   |
| `AUTH_ENABLED`             | Set to `false` to bypass sign-in outside production.                                                                                                                                                                  |
| `USE_OAUTH`                | Unset or `true`: Google sign-in. `false`: username and password sign-in. Google OAuth credentials are listed under deployment.                                                                                        |
| `GOOGLE_CLIENT_ID`         | Google OAuth client ID.                                                                                                                                                                                               |
| `GOOGLE_CLIENT_SECRET`     | Google OAuth client secret.                                                                                                                                                                                           |
| `APP_URL`                  | Public app origin used to build the Google callback URL.                                                                                                                                                              |
| `PORT`                     | Host port exposed by Docker Compose. Defaults to `3000`.                                                                                                                                                              |
| `TRUSTED_CLIENT_IP_HEADER` | Optional header name set by a trusted reverse proxy for rate limiting.                                                                                                                                                |
| `RATE_LIMIT_PREREQ`        | Requests per minute allowed for prerequisite lookups. Defaults to `10`.                                                                                                                                               |

`NEXT_PUBLIC_REOGENT_VERSION` comes from `package.json`. You do not need to set it.

The framework sets `NODE_ENV` and `NEXT_RUNTIME`.

## Run the app in Docker

The Compose development profile runs Node.js in a container and connects to Postgres and Meilisearch by their service names.

If your LLM runs outside Docker, set `LLM_BASE_URL` to an address reachable from the app container. Inside the container, `localhost` refers to the container itself.

Create `.env` as described above, then run:

```bash
docker compose --profile dev up
```

The app is available at [http://localhost:3000](http://localhost:3000).

## Deploying

Configure these deployment values before starting the app:

| Variable                   | Required value              | Notes                                                                                                  |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`         | OAuth client ID.            | Required for default Google sign-in.                                                                   |
| `GOOGLE_CLIENT_SECRET`     | OAuth client secret.        | Required for default Google sign-in.                                                                   |
| `APP_URL`                  | Public HTTPS origin.        | Register its `/api/auth/google/callback` URL in Google Cloud Console.                                  |
| `MEILI_API_KEY`            | Read-only Meilisearch key.  | Create after Meilisearch starts, then set the returned key here. Production will not start without it. |
| `TRUSTED_CLIENT_IP_HEADER` | Proxy header name, if used. | Set only when the proxy overwrites it with one validated client IP and blocks direct app access.       |

Start Postgres and Meilisearch without starting the app:

```bash
docker compose up -d postgres meilisearch
```

Then create `MEILI_API_KEY` from a shell where `MEILI_MASTER_KEY` is set:

```bash
curl -s -X POST http://localhost:7700/keys \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data '{"name":"reodite-app","actions":["search","documents.get"],"indexes":["*"],"expiresAt":null}'
```

Copy the returned `key` into `.env` as `MEILI_API_KEY`.

Before starting the app, validate and index the campus data:

```bash
npm run validate:documents
npm run ingest
```

Put the app behind an HTTPS reverse proxy with TLS, HSTS, firewall rules, request and concurrency limits, and distributed rate limiting.

Compose binds app, Postgres, and Meilisearch ports to loopback. Run the proxy on the same host.

Without `TRUSTED_CLIENT_IP_HEADER`, anonymous callers share one rate-limit bucket. Read [`SECURITY.md`](SECURITY.md) before deployment.

## Backups and maintenance

The Compose operations profile supports these tasks:

| Task                   | Command                                        | Result                                     |
| ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| Rebuild search indexes | `docker compose --profile ops run --rm ingest` | Reads campus data and updates Meilisearch. |
| Back up Postgres       | `docker compose --profile ops run --rm backup` | Writes a dump under `./backups`.           |

Copy backups off the server and protect them like the live database. They contain accounts and conversations.

To restore a dump, use `pg_restore` with the target database credentials.

Run these checks before proposing a change:

```bash
npm test
npm run lint
npm run format:check
```

The app lives in `app/`, `src/components/`, and `src/server/`.

See [`PRODUCT.md`](PRODUCT.md) for product direction and [`DESIGN.md`](DESIGN.md) for interface guidance. Campus data and its collection tools live in the [`ubc-unified-data`](https://github.com/reodite/ubc-unified-data) submodule.

## License

Built for UBC CIC Hackathon 2026.
