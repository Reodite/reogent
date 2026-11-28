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

| Variable                                          | What it controls                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_TYPE`                                    | Provider: `openai`, `anthropic`, or `google`. Defaults to `openai`.                                                                                       |
| `LLM_MODEL`                                       | Model name. Defaults to `llama3.1`, `claude-sonnet-4-20250514`, or `gemini-2.0-flash`, depending on provider.                                             |
| `LLM_API_KEY`                                     | Provider API key. Google accepts comma-separated keys and rotates between them.                                                                           |
| `LLM_BASE_URL`                                    | Optional endpoint for OpenAI-compatible services or an Anthropic-compatible proxy.                                                                        |
| `USE_EXTERNAL_MONGODB`                            | Set to `true` with the external Compose override to use hosted MongoDB; base Compose always uses authenticated local Mongo.                               |
| `MONGODB_URI`                                     | Hosted Mongo connection URI. Use a replica-set-capable deployment because the app uses transactions.                                                      |
| `MONGODB_ROOT_USERNAME` / `MONGODB_ROOT_PASSWORD` | Bootstrap administrator credentials for local Compose Mongo. Generate a unique password and keep both values private.                                     |
| `MONGODB_APP_USERNAME` / `MONGODB_APP_PASSWORD`   | Local application credentials. The app receives `readWrite` on the `reodite` database only. Generate a unique password and keep it private.               |
| `MONGODB_TEST_USERNAME` / `MONGODB_TEST_PASSWORD` | Integration-test credentials. The test user receives `readWrite` only on `reodite_test`. Generate a unique password and keep it private.                  |
| `MONGODB_PORT`                                    | Optional loopback host port for the local Compose MongoDB. Defaults to `27017`; host-run commands use the local replica-set primary with app credentials. |
| `MEILI_URL`                                       | Meilisearch address. The example uses `http://localhost:7700`; change this port with `MEILISEARCH_PORT`. Compose sets the container address.              |
| `MEILISEARCH_PORT`                                | Optional loopback host port for Meilisearch in Compose. Defaults to `7700`; update `MEILI_URL` too when changing it for host-run commands.                |
| `MEILI_MASTER_KEY`                                | Meilisearch admin key for ingestion. Generate a unique value with `openssl rand -hex 32`. Compose keeps it out of the app container.                      |
| `MEILI_API_KEY`                                   | Read-only key used by the app in production. Local development falls back to `MEILI_MASTER_KEY`.                                                          |
| `MEILI_ENV`                                       | Meilisearch environment for Compose. Defaults to `production`.                                                                                            |
| `MONGODB_MAX_POOL_SIZE`                           | Maximum MongoDB connections per app process. Defaults to `10`.                                                                                            |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS`             | MongoDB server-selection timeout in milliseconds. Defaults to `10000`.                                                                                    |
| `DATA_PATH`                                       | Campus data folder. Use `./ubc-unified-data/data` in this repository; the default is `./data`.                                                            |
| `JWT_SECRET`                                      | Session-signing secret. Generate a unique value with `openssl rand -hex 32`; production requires at least 32 bytes.                                       |
| `AUTH_ENABLED`                                    | Defaults to `true`. Set to `false` to bypass sign-in outside production; production always enforces auth.                                                 |
| `USE_OAUTH`                                       | Defaults to Google sign-in. Set to `false` for username and password sign-in. Google credentials are listed under deployment.                             |
| `GOOGLE_CLIENT_ID`                                | Google OAuth client ID.                                                                                                                                   |
| `GOOGLE_CLIENT_SECRET`                            | Google OAuth client secret.                                                                                                                               |
| `APP_URL`                                         | Public app origin used to build the Google callback URL.                                                                                                  |
| `PORT`                                            | Host port exposed by Docker Compose. Defaults to `3000`.                                                                                                  |
| `TRUSTED_CLIENT_IP_HEADER`                        | Header set by a trusted reverse proxy for rate limiting. Configure only if the proxy overwrites it with one client IP and blocks direct app access.       |
| `RATE_LIMIT_PREREQ`                               | Requests per minute allowed for prerequisite lookups. Defaults to `10`.                                                                                   |

`NEXT_PUBLIC_REOGENT_VERSION` comes from `package.json`; do not set it yourself.

The framework sets `NODE_ENV` and `NEXT_RUNTIME`.

## Run the app in Docker

The Compose development profile runs Node.js in a container and connects to MongoDB and Meilisearch by service name. Local MongoDB uses authentication and a single-node replica set so transactions work. Create `.env` from `.env.example`; generate unique `MONGODB_ROOT_PASSWORD`, `MONGODB_APP_PASSWORD`, and `MONGODB_TEST_PASSWORD` values with `openssl rand -hex 32`. The app user receives `readWrite` only on `reodite`, and the integration-test user receives `readWrite` only on `reodite_test`.

If your LLM runs outside Docker, set `LLM_BASE_URL` to an address reachable from the app container. Inside the container, `localhost` refers to the container itself.

Compose reads `.env` for interpolation when passed with `--env-file`; the `env_file` setting alone only populates container environments. The keyfile is generated inside the Mongo data volume on first startup and persists across restarts.

```bash
docker compose --env-file .env up -d mongo meilisearch
docker compose --env-file .env --profile dev up
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

1. Configure a managed replica-set URI in `.env` with `USE_EXTERNAL_MONGODB=true` and `MONGODB_URI` for hosted production. Include the external override on every hosted Compose command. Keep the app stopped while you start Meilisearch:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.external.yml up -d meilisearch
```

For local MongoDB, omit `docker-compose.external.yml` and include `mongo` in the service list. The external override requires `MONGODB_URI`, sets external mode, removes the local Mongo dependency, and removes the local backup service.

Existing local volumes created before Mongo authentication was enabled need a one-time in-place migration. Back up the database first. With the old no-auth Mongo container still running, connect with `docker exec -it reogent-mongo-1 mongosh` and enter the following in the shell, replacing the placeholders with values from `.env`:

```javascript
use admin
db.createUser({ user: "<MONGODB_ROOT_USERNAME>", pwd: "<MONGODB_ROOT_PASSWORD>", roles: [{ role: "root", db: "admin" }] })
use reodite
db.createUser({ user: "<MONGODB_APP_USERNAME>", pwd: "<MONGODB_APP_PASSWORD>", roles: [{ role: "readWrite", db: "reodite" }] })
```

Create the test user too if you run Mongo integration tests:

```javascript
db.createUser({
  user: "<MONGODB_TEST_USERNAME>",
  pwd: "<MONGODB_TEST_PASSWORD>",
  roles: [{ role: "readWrite", db: "reodite_test" }],
});
```

Do not delete the Mongo volume. Recreate only the Mongo container after adding those users so the new keyfile wrapper and `--auth` settings take effect. The init script creates users only for a new empty volume; changing `.env` does not rotate users on an existing volume.

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

| Task                   | Command                                                                                                               | Result                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Rebuild search indexes | `docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml --profile ops run --rm ingest` | Reads campus data and updates Meilisearch.     |
| Back up local MongoDB  | `docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml --profile ops run --rm backup` | Writes a compressed archive under `./backups`. |

Copy backups off the server. Protect them like the live database because they contain accounts and conversations.

To restore a local archive, use `mongorestore --gzip --archive=<file> --drop` against the target replica-set URI with an authorized account. Use your MongoDB provider's backup tools for an external deployment; the external override removes the local backup service.

The default test suite mocks persistence. Run the opt-in replica-set integration tests with `npm run test:mongodb`; they require the local Mongo app credentials in `.env` and exercise transactions and index behavior against authenticated local Compose MongoDB.

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
