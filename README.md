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

4. Start MongoDB and Meilisearch, then validate and index the campus data:

   ```bash
   docker compose up -d mongo meilisearch
   npm run validate:documents
   npm run ingest
   ```

5. Start Reodite:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). The server connects to MongoDB and creates required indexes at startup.

## Configuration reference

Set these environment variables in `.env`. Keep secrets out of version control.

| Variable                              | What it controls                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_TYPE`                        | Provider: `openai`, `anthropic`, or `google`. Defaults to `openai`.                                                                                         |
| `LLM_MODEL`                           | Model name. Defaults to `llama3.1`, `claude-sonnet-4-20250514`, or `gemini-2.0-flash`, depending on provider.                                               |
| `LLM_API_KEY`                         | Provider API key. Google accepts comma-separated keys and rotates between them.                                                                             |
| `LLM_BASE_URL`                        | Optional endpoint for OpenAI-compatible services or an Anthropic-compatible proxy.                                                                          |
| `USE_EXTERNAL_MONGODB`                | Set to `true` to use hosted MongoDB; defaults to `false`, which uses the local Compose service.                                                             |
| `MONGODB_URI`                         | MongoDB connection URI used when `USE_EXTERNAL_MONGODB=true`. Use a replica-set-capable deployment because the app uses transactions.                       |
| `MONGODB_PORT`                        | Optional loopback host port for the local Compose MongoDB. Defaults to `27017`; host-run commands use a direct connection to the local replica-set primary. |
| `MEILI_URL`                           | Meilisearch address. The example uses `http://localhost:7700`; change this port with `MEILISEARCH_PORT`. Compose sets the container address.                |
| `MEILISEARCH_PORT`                    | Optional loopback host port for Meilisearch in Compose. Defaults to `7700`; update `MEILI_URL` too when changing it for host-run commands.                  |
| `MEILI_MASTER_KEY`                    | Meilisearch admin key for ingestion. Generate a unique value with `openssl rand -hex 32`. Compose keeps it out of the app container.                        |
| `MEILI_API_KEY`                       | Read-only key used by the app in production. Local development falls back to `MEILI_MASTER_KEY`.                                                            |
| `MEILI_ENV`                           | Meilisearch environment for Compose. Defaults to `production`.                                                                                              |
| `MONGODB_MAX_POOL_SIZE`               | Maximum MongoDB connections per app process. Defaults to `10`.                                                                                              |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | MongoDB server-selection timeout in milliseconds. Defaults to `10000`.                                                                                      |
| `DATA_PATH`                           | Campus data folder. Use `./ubc-unified-data/data` in this repository; the default is `./data`.                                                              |
| `JWT_SECRET`                          | Session-signing secret. Generate a unique value with `openssl rand -hex 32`; production requires at least 32 bytes.                                         |
| `AUTH_ENABLED`                        | Defaults to `true`. Set to `false` to bypass sign-in outside production; production always enforces auth.                                                   |
| `USE_OAUTH`                           | Defaults to Google sign-in. Set to `false` for username and password sign-in. Google credentials are listed under deployment.                               |
| `GOOGLE_CLIENT_ID`                    | Google OAuth client ID.                                                                                                                                     |
| `GOOGLE_CLIENT_SECRET`                | Google OAuth client secret.                                                                                                                                 |
| `APP_URL`                             | Public app origin used to build the Google callback URL.                                                                                                    |
| `PORT`                                | Host port exposed by Docker Compose. Defaults to `3000`.                                                                                                    |
| `TRUSTED_CLIENT_IP_HEADER`            | Header set by a trusted reverse proxy for rate limiting. Configure only if the proxy overwrites it with one client IP and blocks direct app access.         |
| `RATE_LIMIT_PREREQ`                   | Requests per minute allowed for prerequisite lookups. Defaults to `10`.                                                                                     |

`NEXT_PUBLIC_REOGENT_VERSION` comes from `package.json`; do not set it yourself.

The framework sets `NODE_ENV` and `NEXT_RUNTIME`.

## Run the app in Docker

The Compose development profile runs Node.js in a container and connects to MongoDB and Meilisearch by service name. Local MongoDB runs as a single-node replica set so transactions work.

If your LLM runs outside Docker, set `LLM_BASE_URL` to an address reachable from the app container. Inside the container, `localhost` refers to the container itself.

Create `.env` using the configuration reference. With `USE_EXTERNAL_MONGODB=false`, local Compose starts MongoDB by default:

```bash
docker compose up -d mongo meilisearch
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

1. Configure a managed replica-set URI in `.env` with `USE_EXTERNAL_MONGODB=true` and `MONGODB_URI` for hosted production, or leave the flag false for the Compose replica set. Keep the app stopped while you start Meilisearch:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.external.yml up -d meilisearch
```

For local MongoDB, omit `docker-compose.external.yml` and include `mongo` in the service list. For hosted MongoDB, start only the app and search service so Compose does not launch the unused local database:

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

Compose binds app, MongoDB, and Meilisearch to loopback, so run the proxy on the same host. Configure TLS, HSTS, firewall rules, request and concurrency limits, and distributed rate limiting. Without `TRUSTED_CLIENT_IP_HEADER`, anonymous callers share one rate-limit bucket.

5. Build and start the app:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.external.yml up -d --build app meilisearch
```

## Backups and maintenance

Use the Compose operations profile for these tasks:

| Task                   | Command                                                                                               | Result                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Rebuild search indexes | `docker compose -f docker-compose.yml -f docker-compose.production.yml --profile ops run --rm ingest` | Reads campus data and updates Meilisearch.     |
| Back up local MongoDB  | `docker compose -f docker-compose.yml -f docker-compose.production.yml --profile ops run --rm backup` | Writes a compressed archive under `./backups`. |

Copy backups off the server. Protect them like the live database because they contain accounts and conversations.

To restore a local archive, use `mongorestore --gzip --archive=<file> --drop` against the target replica-set URI. Use your MongoDB provider's backup tools for an external deployment.

The default test suite mocks persistence. Run the opt-in replica-set integration tests with `npm run test:mongodb`; they exercise transactions and index behavior against the local Compose MongoDB.

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
