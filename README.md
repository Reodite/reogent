# Reodite

Reodite helps UBC students find campus information in a chat with an interactive map.

Ask about courses, tuition, events, parking, study spaces, or walking routes between buildings.

## Try Reodite

Open a Reodite deployment and start a conversation. If you do not have access to one, follow the local setup below.

Ask in everyday language. For example:

> How long is the walk from Buchanan to ICICS, and which Computer Science courses have no prerequisites?

Reodite can answer both parts in one conversation. Some answers include a map or another interactive view.

## Run Reodite on your computer

Requirements: Node.js 24 or newer, Docker, and an LLM provider. Reodite supports OpenAI-compatible services, Anthropic, and Google; configure the provider in the [configuration reference](#configuration-reference).

1. Clone the repository:

   ```bash
   git clone https://github.com/Reodite/reogent.git
   cd reogent
   ```

2. Install dependencies and fetch the campus data:

   ```bash
   npm install
   git submodule update --init
   ```

3. Create `.env` from the sample:

   ```bash
   cp .env.example .env
   ```

   Set the values in the [configuration reference](#configuration-reference). The sample file is [`.env.example`](.env.example).

4. Start Postgres and Meilisearch, then validate and index the campus data:

   ```bash
   docker compose up -d postgres meilisearch
   npm run validate:documents
   npm run ingest
   ```

5. Start Reodite:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). The server applies the database schema at startup.

## Configuration reference

Set these environment variables in `.env`. Keep secrets out of version control.

| Variable                   | What it controls                                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_TYPE`             | Provider: `openai`, `anthropic`, or `google`. Defaults to `openai`.                                                                                                                                                  |
| `LLM_MODEL`                | Model name. Defaults to `llama3.1`, `claude-sonnet-4-20250514`, or `gemini-2.0-flash`, depending on provider.                                                                                                        |
| `LLM_API_KEY`              | Provider API key. Google accepts comma-separated keys and rotates between them.                                                                                                                                      |
| `LLM_BASE_URL`             | Optional endpoint for OpenAI-compatible services or an Anthropic-compatible proxy.                                                                                                                                   |
| `DATABASE_URL`             | Postgres URL for host-run commands. The example uses `localhost:5432`; change this port with `POSTGRES_PORT`. Compose sets the container address. Its password must match `POSTGRES_PASSWORD`.                       |
| `POSTGRES_PASSWORD`        | Postgres password. Generate a unique value with `openssl rand -hex 32` and use it in `DATABASE_URL`. To change it for an existing database, update the password inside Postgres; editing `.env` alone is not enough. |
| `POSTGRES_PORT`            | Optional loopback host port for Postgres in Compose. Defaults to `5432`; update the port in `DATABASE_URL` too when changing it for host-run commands.                                                               |
| `MEILI_URL`                | Meilisearch address. The example uses `http://localhost:7700`; change this port with `MEILISEARCH_PORT`. Compose sets the container address.                                                                         |
| `MEILISEARCH_PORT`         | Optional loopback host port for Meilisearch in Compose. Defaults to `7700`; update `MEILI_URL` too when changing it for host-run commands.                                                                           |
| `MEILI_MASTER_KEY`         | Meilisearch admin key for ingestion. Generate a unique value with `openssl rand -hex 32`. Compose keeps it out of the app container.                                                                                 |
| `MEILI_API_KEY`            | Read-only key used by the app in production. Local development falls back to `MEILI_MASTER_KEY`.                                                                                                                     |
| `MEILI_ENV`                | Meilisearch environment for Compose. Defaults to `production`.                                                                                                                                                       |
| `DB_POOL_MAX`              | Maximum Postgres connections per app process. Defaults to `10`.                                                                                                                                                      |
| `DB_POOL_TIMEOUT_MS`       | Postgres connection timeout in milliseconds. Defaults to `10000`.                                                                                                                                                    |
| `DATA_PATH`                | Campus data folder. Use `./ubc-unified-data/data` in this repository; the default is `./data`.                                                                                                                       |
| `JWT_SECRET`               | Session-signing secret. Generate a unique value with `openssl rand -hex 32`; production requires at least 32 bytes.                                                                                                  |
| `AUTH_ENABLED`             | Defaults to `true`. Set to `false` to bypass sign-in outside production; production always enforces auth.                                                                                                            |
| `USE_OAUTH`                | Defaults to Google sign-in. Set to `false` for username and password sign-in. Google credentials are listed under deployment.                                                                                        |
| `GOOGLE_CLIENT_ID`         | Google OAuth client ID.                                                                                                                                                                                              |
| `GOOGLE_CLIENT_SECRET`     | Google OAuth client secret.                                                                                                                                                                                          |
| `APP_URL`                  | Public app origin used to build the Google callback URL.                                                                                                                                                             |
| `PORT`                     | Host port exposed by Docker Compose. Defaults to `3000`.                                                                                                                                                             |
| `TRUSTED_CLIENT_IP_HEADER` | Header set by a trusted reverse proxy for rate limiting. Configure only if the proxy overwrites it with one client IP and blocks direct app access.                                                                  |
| `RATE_LIMIT_PREREQ`        | Requests per minute allowed for prerequisite lookups. Defaults to `10`.                                                                                                                                              |

`NEXT_PUBLIC_REOGENT_VERSION` comes from `package.json`; do not set it yourself.

The framework sets `NODE_ENV` and `NEXT_RUNTIME`.

## Run the app in Docker

The Compose development profile runs Node.js in a container and connects to Postgres and Meilisearch by service name.

If your LLM runs outside Docker, set `LLM_BASE_URL` to an address reachable from the app container. Inside the container, `localhost` refers to the container itself.

Create `.env` using the configuration reference, then run:

```bash
docker compose --profile dev up
```

The app is available at [http://localhost:3000](http://localhost:3000).

## Deploying

Set these values in `.env` before deployment:

| Variable                   | Required value              | Notes                                                                                |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`         | OAuth client ID.            | Required for Google sign-in.                                                         |
| `GOOGLE_CLIENT_SECRET`     | OAuth client secret.        | Required for Google sign-in.                                                         |
| `APP_URL`                  | Public HTTPS origin.        | Register `/api/auth/google/callback` for this origin in Google Cloud Console.        |
| `MEILI_API_KEY`            | Read-only Meilisearch key.  | Create after Meilisearch starts. Production requires this key.                       |
| `TRUSTED_CLIENT_IP_HEADER` | Proxy header name, if used. | Use only if the proxy overwrites it with one client IP and blocks direct app access. |

1. Start Postgres and Meilisearch. Keep the app stopped:

```bash
docker compose up -d postgres meilisearch
```

2. Create the read-only `MEILI_API_KEY`. Run this command from a shell where `MEILI_MASTER_KEY` is set:

```bash
curl -s -X POST http://localhost:7700/keys \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data '{"name":"reodite-app","actions":["search","documents.get"],"indexes":["*"],"expiresAt":null}'
```

Add the returned `key` to `.env` as `MEILI_API_KEY`.

3. Validate and index the campus data:

```bash
npm run validate:documents
npm run ingest
```

4. Read [`SECURITY.md`](SECURITY.md) and configure the HTTPS reverse proxy before exposing the app.

Compose binds app, Postgres, and Meilisearch to loopback, so run the proxy on the same host. Configure TLS, HSTS, firewall rules, request and concurrency limits, and distributed rate limiting. Without `TRUSTED_CLIENT_IP_HEADER`, anonymous callers share one rate-limit bucket.

5. Build and start the app:

```bash
docker compose up -d --build
```

## Backups and maintenance

Use the Compose operations profile for these tasks:

| Task                   | Command                                        | Result                                     |
| ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| Rebuild search indexes | `docker compose --profile ops run --rm ingest` | Reads campus data and updates Meilisearch. |
| Back up Postgres       | `docker compose --profile ops run --rm backup` | Writes a dump under `./backups`.           |

Copy backups off the server. Protect them like the live database because they contain accounts and conversations.

To restore a dump, use `pg_restore` with the target database credentials.

Before proposing a change, run:

```bash
npm test
npm run lint
npm run format:check
```

Routes live in `app/`. Shared UI lives in `src/components/`; server logic lives in `src/server/`.

Read [`PRODUCT.md`](PRODUCT.md) for product direction and [`DESIGN.md`](DESIGN.md) for interface guidance. The [`ubc-unified-data`](https://github.com/reodite/ubc-unified-data) submodule contains campus data and collection tools.

## License

Reodite's code is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE). Third-party dependencies, fonts, and data in the `ubc-unified-data` submodule may have separate terms.
