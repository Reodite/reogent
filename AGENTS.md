<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Reodite

Conversational AI for UBC students. Ask about courses, tuition, walking routes, parking, events, or study spaces; answers render on an interactive campus map.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- LLM layer: `src/server/llm/` (Anthropic, OpenAI, Google; selectable via `LLM_API_TYPE`)
- Postgres + Meilisearch, run via `docker-compose.yml`
- Data from git submodule `ubc-unified-data/` (grades raw data under `data/grades/raw/`, collected by its `grades` collector)
- Map: MapLibre GL + deck.gl

## Commands

- `npm run dev`: dev server
- `npm run lint`: Biome
- `npm test`: Vitest (run once; `--passWithNoTests`)
- `npm run format` / `npm run format:check`: Prettier
- `npm run ingest`: re-index datasets into Meilisearch
- Never run long-lived watchers; run them manually in a terminal.

## Recommended skills

If a recommended skill is missing when needed, ask the operator to install it before continuing.

- `kiro-sdd`: spec-driven development (requirements, design, tasks).
  ```
  npx skills add https://github.com/chakornk/kiro-sdd-skill --skill kiro-sdd
  ```
- `impeccable`: UI/UX design review and surface polish.
  ```
  npx skills add https://github.com/pbakaus/impeccable --skill impeccable
  ```

## Conventions

- Routes in `app/`; shared UI in `src/components/`; client helpers in `src/lib/`; server logic (agent, modules, LLM, DB) in `src/server/`; cross-cutting types in `src/shared/`
- Colocate tests as `*.test.ts` next to the code under test (Vitest)
- Follow Biome lint and Prettier formatting (`npm run lint`, `npm run format:check`)
- Docs: `README.md` (overview), `DESIGN.md` (visual design), `PRODUCT.md` (product spec)
- Do not commit `.env*` (ignored) or `impeccable` critique state (`.impeccable/critique/`)

## Shortest path

The ladder runs after you understand the problem, not before. Read the task and the code it touches, trace the flow end to end, then climb. Stop at the first rung that holds.

1. Does this need to exist at all? Speculative need: skip it, say so in one line. (YAGNI)
2. Already in this codebase? A helper, util, type, or pattern a few files over: reuse it. Re-implementing what lives nearby is the most common slop.
3. Stdlib does it: use it.
4. Native platform feature covers it (`<input type="date">` over a picker lib, CSS over JS, DB constraint over app code): use it.
5. Already-installed dependency solves it: use it. Never add a new one for what a few lines can do.
6. Can it be one line: one line.
7. Only then: the minimum code that works.

Rules:

- No unrequested abstractions. No interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate, no scaffolding "for later". Later can scaffold for itself.
- Deletion over addition. Boring over clever. Clever is what someone decodes at 3am.
- Fewest files possible. Shortest working diff wins, once you know what the change has to touch.
- Bug fix targets the root cause. A report names a symptom. Grep every caller of the function you're about to touch. One guard in the shared function beats a guard in every caller. Patching only the path the ticket names leaves every sibling caller broken.
- Two stdlib options, same size: take the one correct on edge cases. Lazy means less code, not the flimsier algorithm.

Never lazy away:

- Input validation at trust boundaries.
- Error handling that prevents data loss.
- Security measures.
- Accessibility basics.
- Anything explicitly requested.

Lazy code without a check is unfinished. Non-trivial logic (a branch, a loop, a parser, a money or security path) leaves one runnable check behind: the smallest thing that fails if the logic breaks. Trivial one-liners need no test. YAGNI applies to tests too.

## Commit granularity

After completing each unit of work, create a git commit. One commit per unit keeps the history bisectable. Each unit can be located, reverted, or inspected on its own.

**Format:** `<type>: <description>` (one line, no scope, no description body).

**Allowed types:**
- `build:` - Changes to build system or dependencies
- `chore:` - Routine maintenance tasks
- `ci:` - CI/CD configuration changes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code refactoring without functional changes
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `feat:` - New features
- `fix:` - Bug fixes

**Examples:**
- `feat: add user authentication`
- `fix: resolve null pointer exception`
- `refactor: simplify error handling`
- `docs: update API documentation`
- `test: add unit tests for login service`

## Comment rules

When modifying any file, apply these rules to all new or changed comments:

1. Describe behavior, not history. Comments explain what the code currently does. Avoid documenting past decisions, previous values, or the reasoning that led to the current implementation.
2. Preserve important details. Edge cases, preconditions, return values, error handling behavior, and side effects must stay. Condense wording without losing information.
3. State limitations plainly. Phrases like "best-effort cleanup" or "silently ignores errors" are acceptable because they describe actual behavior.
4. Remove decorative formatting. No `---`, `===`, ASCII art, or section dividers.
5. No specific benchmark numbers. Replace "tests 62k+ items" with "tests a large set." Remove hardcoded counts that a human maintainer would not know, unless the number is part of the logic itself.
6. Use active voice and direct language. Write "Validates the field" not "Performs validation on the field." Write "Discards partial files on mismatch" not "In order to ensure correctness, partial files are discarded."
7. Keep JSDoc comments (`/** ... */`) for exported interfaces, types, and functions; line comments (`//`) for implementation. JSDoc describes what a function/type/module does for consumers. Line comments explain why a specific line of logic exists.
8. Review after editing. Re-read each file after making changes to verify no details were lost and no comments became misleading.
9. Leave good comments alone. Not every comment needs rewriting. If a comment is already concise, accurate, and natural, skip it.
10. Match the codebase tone. Comments should read like a high-quality production codebase: clear, brief, technically precise.

## Prose rules

Apply when writing prose: commits, comments, docs, prompts, chat output.

1. Cut filler. No throat-clearing openers, no emphasis crutches, no adverbs.
2. Break formulaic structures. No binary contrasts, negative listings, dramatic fragmentation, rhetorical setups, false agency.
3. Active voice. Human subject doing something. No passive constructions. No inanimate objects performing human actions.
4. Be specific. No vague declaratives. Name the thing. No lazy extremes (`every`, `always`, `never`) doing vague work.
5. Put the reader in the room. No narrator-from-a-distance. `You` beats `People`. Specifics beat abstractions.
6. Vary rhythm. Mix sentence lengths. Two items beat three. End paragraphs differently. No em dashes.
7. Trust readers. State facts directly. Skip softening, justification, hand-holding.
8. Cut quotables. If it sounds like a pull-quote, rewrite it.

Quick checks before delivering prose:

- Adverbs? Cut them.
- Passive voice? Find the actor, make them the subject.
- Inanimate thing doing a human verb? Name the person.
- Sentence starts with a Wh- word? Restructure it.
- `here's what/this/that` throat-clearing? Cut to the point.
- `not X, it's Y` contrasts? State Y directly.
- Three consecutive sentences match length? Break one.
- Paragraph ends with a punchy one-liner? Vary it.
- Em-dash anywhere? Remove it.
- Vague declarative? Name the specific implication.
- Narrator-from-a-distance? Put the reader in the scene.
- Meta-joiners (`The rest of this...`)? Delete. Let the prose move.

## Verification

Evidence before claims, always.

Before claiming any state (complete, fixed, passing) or expressing satisfaction, follow this gate:

1. Identify the command that proves the claim.
2. Run it fresh and complete.
3. Read the full output. Check the exit code. Count failures.
4. State the claim with that evidence, or state the actual state with that evidence.

No exceptions. `Should work now`, `I'm confident`, `just this once`, `linter passed` (linter is not a compiler), `agent said success`, `I'm tired` are rationalizations. Treat `should`, `probably`, `seems to`, and any positive wording before verification output is on screen as stop signs.

Common claims and their required proof:

- Tests pass → `npm test` exit 0 with 0 failures.
- Lint clean → `npm run lint` exit 0 with 0 errors.
- Format clean → `npm run format:check` exit 0.
- Bug fixed → the original symptom verified to pass.
- Regression test works → red-green cycle (test passes with the fix, fails without it).
- Task complete → line-by-line checklist against the spec, and verification commands green.
