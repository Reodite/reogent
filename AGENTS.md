<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reodite

Campus assistant for UBC students. Next.js 16, React 19, TypeScript, Postgres, Meilisearch, MapLibre, and deck.gl. Provider adapters live in `src/server/llm/`; `LLM_API_TYPE` selects OpenAI, Anthropic, or Google. Dataset collection belongs to the `ubc-unified-data` submodule.

## Commands

- `npm run dev`: development server. Let the operator run watchers in a terminal.
- `npm test`: Vitest, one run.
- `npm run lint`: Biome.
- `npx tsc --noEmit --incremental false`: TypeScript checks.
- `npm run format` / `npm run format:check`: Prettier.
- `npm run build`: production build.
- `npm run ingest`: re-index data into the configured Meilisearch service. Confirm the destination before mutating indexes.

See `README.md` for setup and configuration, `PRODUCT.md` for product constraints, `DESIGN.md` for UI contracts, and `SECURITY.md` for deployment controls and security limitations.

## Ownership

- `app/`: routes; `src/components/`: UI; `src/lib/`: browser helpers; `src/server/`: agent, data, services, and persistence; `src/shared/`: cross-layer contracts.
- Keep shared modules independent of application layers. Reuse shared contracts rather than importing route entrypoints into components or components into client algorithms.
- Colocate Vitest tests as `*.test.ts` or `*.test.tsx`.
- Do not commit `.env*` or `.impeccable/critique/`. Preserve existing submodule and user changes.
- Keep one owner for each documentation topic. Link to it instead of copying its details. Separate current behavior from active plans; remove obsolete plans after preserving any lasting contract.

## Implementation

Trace the affected path and its callers before editing. First consider deletion, then nearby helpers, the standard library, native platform features, and installed dependencies. Add the smallest remaining implementation.

- Avoid speculative scaffolding, single-implementation interfaces, single-product factories, and configuration for fixed values.
- Fix shared causes rather than adding the same guard to sibling callers. Prefer the standard-library option that handles edge cases.
- Keep validation at trust boundaries, data-loss prevention, security, accessibility, and explicitly requested behavior.
- Tests guard meaningful behavior changes: interactions, state, errors, data/security contracts, and accessibility semantics. Reuse existing coverage; add only an uncovered regression or behavior check. Do not assert visual styles, classes, CSS/layout geometry, source arrangement, or test fixtures against themselves. Remove empty, tautological, and duplicate checks. Requirement labels and quotas do not justify tests.
- Nontrivial logic needs a runnable check, not a separate test for each branch or function. Preserve useful parser, algorithm, persistence, and resource-cleanup coverage.
- Keep changes limited to the files needed for the behavior. Remove unused code only after checking imports, framework conventions, scripts, tests, and tool consumers.

## UI contracts

- Minimum touch target: 32px. Preserve larger documented sizes; this is not a blanket resize.
- Back buttons: 44px square, 20px arrow, ghost treatment without a resting border or shadow, destination-specific accessible names, and visible keyboard focus.
- Ordinary actions, fields, and segmented-control frames: 8px radius. Peer workspace panels and canvases: 16px. Derive close inset corners from the enclosing radius minus the inset. Preserve large-action, floating-overlay, pill, and avatar roles.
- Follow `DESIGN.md` and the applicable `.impeccable/surfaces/` brief. Refresh `.impeccable/design.json` when changing its source guidance.

## Skills

Use `kiro-sdd` for requested specs and `impeccable` for interface work. If a required skill is missing, ask the operator to install it:

- `npx skills add https://github.com/chakornk/kiro-sdd-skill --skill kiro-sdd`
- `npx skills add https://github.com/pbakaus/impeccable --skill impeccable`

## Writing

- Explain current behavior, constraints, edge cases, and failure handling. Keep useful comments; remove history narration, task logs, decorative dividers, and stale benchmark counts. Retain numeric constants that belong to the logic.
- Use JSDoc for exported contracts and line comments for implementation rationale. Re-read changed comments to check accuracy and preserve important details.
- Write direct, specific prose in active voice. Cut filler, emphasis crutches, adverbs, rhetorical setups, slogans, and repeated summaries. Use the reader's perspective where useful; vary sentence length. Avoid em dashes outside generated content.
- Keep documentation concise. Do not replace a small change with a framework or a large specification.

## Verification

Run the command that proves a claim before making the claim. Read its output and exit code; report warnings and limitations rather than calling partial evidence success.

- Tests: `npm test`, zero failures. Lint: `npm run lint`, zero errors. Formatting: `npm run format:check`. Type checking and builds require their own commands.
- Fixes: reproduce the reported symptom. Regression tests require a failing-before/passing-after check.
- Completion: check the requested behavior and affected contracts, inspect delegated changes, and repair failures caused by the work. A clean startup or an agent's summary is insufficient.

## Commits

Commit each verified unit separately. Use one line, no scope or body: `<type>: <description>`.

Allowed types: `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `feat`, `fix`.
