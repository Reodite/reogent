# Security

This document describes application controls and deployment responsibilities. It is not a security certification. The data submodule, live accounts, production credentials, and external services remain outside the repository's fixture-based review.

## Application controls

- **Account ownership:** Check session ownership before model execution; use owner-gated exchange writes and title updates. Planner/schedule state and drafts stay account-scoped, including delayed saves and account switches. Schedule invitations require explicit sharing confirmation.
- **Request handling:** Count streamed body bytes before parsing, enforce route-specific limits and upload deadlines, and validate JSON media types. Rate-limit state has a finite key count; authentication and invitation endpoints add account-level limits.
- **Authentication:** Restrict JWT algorithms and lifetime claims. Production signing requires a secret of at least 32 bytes. New passwords require at least 12 characters and at most 72 UTF-8 bytes. Private JSON and chat responses use `Cache-Control: no-store`.
- **Outbound previews:** Validate public addresses, allowed ports, redirects, and oEmbed requests. Pin HTTPS connections to validated addresses while retaining hostname/TLS checks. Bound streamed bodies and total request time; revalidate cached image destinations.
- **Tools and rendering:** Validate exact building IDs before passing them to SDK URL paths. Enforce model-turn and tool-call limits in code. Treat retrieved prose and model output as untrusted content; model instructions do not grant authorization.
- **Spreadsheet imports:** Validate ZIP structure, skip unrelated entries, bound compressed/decompressed data and cell text, and reject XML DTD/entity declarations.

## Deployment requirements

- Generate separate database, search, and JWT secrets. Rotate exposed/sample credentials. Editing `.env` does not rotate an existing Postgres database user's password.
- Put production traffic behind HTTPS. Configure TLS, HSTS, firewall rules, request/header bounds, connection deadlines, and distributed abuse/concurrency limits at the proxy. Keep chat streaming unbuffered.
- Bind database/search host ports and development servers to loopback. Run the app without root and keep secrets and corpora outside its image.
- Set `TRUSTED_CLIENT_IP_HEADER` only if the proxy overwrites it with one validated IP and clients cannot bypass the proxy. Caller-supplied forwarding chains are untrusted. Without that setting, anonymous requests share a bucket.
- Give the application a search key restricted to the reads/indexes it needs; use separate ingestion/admin credentials. Protect database backups and persistent volumes as user data.
- Set provider spending limits and account/storage quotas before public access. Keep tool capabilities read-only and validate their parameters independently of the model.

## Limitations

- The application limiter is process-local and resets on restart. Per-request tool budgets do not prevent abuse across many accounts. Provider work does not yet share an end-to-end cancellation/deadline contract with disconnected clients.
- Logout clears browser authentication but does not revoke a copied JWT. Tokens can remain valid for seven days. Targeted invalidation still needs server-side revocation/password-reset support.
- Legacy bcrypt hashes cannot authenticate a password suffix beyond 72 bytes. Affected accounts need credential resets; login retains existing-hash compatibility.
- Browser tokens and caches use localStorage, not encrypted storage. Ownership checks prevent account mixing but do not protect against same-origin script compromise. Failed storage deletion can leave durable values after in-memory logout.
- The CSP restricts framing, objects, foreign form submissions, and base URLs; it is not a strict script-source policy.
- OS DNS lookups cannot be cancelled; late results cannot start requests after the deadline. Preview image redirects do not pin the browser's subsequent DNS lookup.
- XLSX parsing remains synchronous. Finite input/output ceilings do not prove resource safety on every browser/device.

## Account-data recovery

The planner backs up unowned or malformed legacy cache bytes under `reodite-planner.unowned-backup` and excludes them from rendering/upload. If backup fails or a different backup exists, it retains the original `reodite-planner` value. Confirm the original owner before manual recovery; do not adopt the data into the next signed-in account.

Draft keys use `reodite.chat-draft:<encoded-user-id>`. The app does not restore the old unowned `reodite.chat-draft` key. Guest drafts remain in memory.

## Verification scope

The 2026-09-30 review recorded passing tests, TypeScript checks, lint error checks, formatting, dependency audit, an isolated production build, and built-server HTTP checks. Warnings remained. These are historical results; rerun the checks for a release. Git history retains the detailed audit output.

The review used fixture accounts, real JWT cryptography and Meilisearch SDK request construction, mocked SQL/native HTTPS boundaries, synthetic XLSX archives, and React providers with mocked APIs. The isolated build excluded environment files and the data submodule; its database endpoint was unavailable. HTTP checks covered public assets/headers, private-route authentication, request limits, rejected preview URLs, and forwarding-header spoofing.

Those checks did not verify concurrent live Postgres behavior, live Meilisearch disclosure, live TLS transport, browser visuals, provider calls, credential rotation, production penetration resistance, or deployment. Docker access was unavailable during that review. A clean dependency audit reports known advisories only; it does not establish absence of defects.
