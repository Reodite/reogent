# Implementation Plan: Reoditetools Port

## Overview

This plan implements five features ported from the donor `reoditetools` (UBCLLM) repository into reogent's existing server-driven Next.js 16 / React 19 spine: Course Lookup, Prerequisite Tree, Sidebar persistence + version badge, Citations surfacing, and Calendar widget. The implementation language is TypeScript throughout (the design document uses TypeScript interfaces exclusively). The plan is sequenced so that each task builds on the verbatim-copied donor pure-function foundation (`src/shared/prereq-ast/`, `src/shared/course-code.ts`, `src/shared/calendar/date-math.ts`) and ends with wiring those pieces into reogent's registry-shaped shell, agent loop, NDJSON stream, Postgres schema, and REST routes — no orphaned code.

Property-based test sub-tasks are annotated with their property number from `design.md` §Correctness Properties and the requirement clause they validate. They are postfixed with `*` per kiro-sdd convention (optional, skippable for faster MVP). Unit, snapshot, integration, and example tests are also postfixed with `*`. The three Open Questions deferred at the bottom of `design.md` are scheduled in Phase 0 — they gate later phases by file or contract decisions.

## Tasks

- [x] 0. Resolve Open Questions deferred from design.md
  - [x] 0.1 Confirm migration approach for `messages.citations JSONB` (no additive-down tooling exists)
    - Doc-only reach: reogent's schema lives in a single `SCHEMA` template literal at `src/server/db/migrate.ts:3` with `CREATE TABLE IF NOT EXISTS` blocks. There is no migration tooling to wire — additive-up + additive-down is not configurable; the system applies the entire `SCHEMA` idempotently on each boot. A "rollback" therefore means dropping the dev database with `docker-compose down -v && up`. Confirm this approach is acceptable: the column is server-only, history rows tolerate `null`, and a malformed boot is recoverable without data loss. (If the user later wants per-step migrations, that's a separate infrastructure task outside this port.)
    - _Requirements: REQ-12.5_
  - [x] 0.2 Confirm `/api/calendar` unauthenticated OPSEC acceptable
    - Doc-only reach: calendar data is public UBC content; route ships `Cache-Control: public, max-age=300`
    - _Requirements: REQ-16.1_
  - [x] 0.3 Confirm React Flow `[data-theme="dark"]` styling approach
    - Doc-only Decision: pigment React Flow CSS variables per `DESIGN.md` tokens. The decision lands as a comment block at the top of `prereq-tree-pane.tsx` when Task 8.6 creates that file (no forward-reference to a file that doesn't exist; this task records the decision, the comment is written by 8.6).
    - _Requirements: REQ-20_

- [x] 1. Set up project structure and install dependencies
  - [x] 1.1 Create directory scaffold
    - Create `src/shared/{course-code,prereq-ast,calendar,citations}/`, `src/server/{prereq,citations}/`, `src/components/{shell,course-lookup,prereq-tree,chat/citations,calendar}/`, and the route folders `app/api/{courses,prereq-tree,calendar}/`. No `src/components/shell/sidebar/` subdirectory — sidebar collapse + version-badge inline into the existing `src/components/shell/session-sidebar.tsx` (Task 10.1).
    - _Requirements: REQ-19_
  - [x] 1.2 Install `reactflow@^11`
    - Add to `package.json`; verify React 19 peer compatibility via `npm ls reactflow` (peer range is `react: >=17`)
    - _Requirements: REQ-9_
  - [x] 1.3 Copy donor `reoditetools/web/src/lib/prereqAst.ts` verbatim into `src/shared/prereq-ast/index.ts`; author `src/shared/prereq-ast/walk.ts` companion
    - Donor file has zero imports and exports `{ Expr, parsePrereq, displayExpr, isSatisfied, missingPrereqs }` only. The donor does NOT export `walkCodeLeaves` or `MAX_DEPTH`; author `walk.ts` with `MAX_DEPTH = 15` and `walkCodeLeaves(expr): { parent: Expr | null; leaf: Extract<Expr, { kind: 'code' }> }[]` as a structural recursion over the donor's lowercase-kind AST (`'and'`, `'or'`, `'code'`, `'literal'`, `'flattened'`, `'soft'`; `Or.ui: 'dropdown' | 'stacked'`; `Flattened.text`/`subExpr`). Re-export `walkCodeLeaves` and `MAX_DEPTH` from `index.ts` alongside the donor API so callers import from one module.
    - _Requirements: REQ-5, REQ-6, REQ-7_

- [x] 2. Implement Course Code Canonicalization (`src/shared/course-code.ts`)
  - [x] 2.1 Implement `CODE_RE`, `canonicalize`, `extractCourseCodes`, `isOkanagan`
    - `canonicalize(input: string): CanonicalResult` where `CanonicalResult = { kind: 'code'; raw: string } | { kind: 'subject'; raw: string } | { kind: 'rejected'; raw: string } | null`. `extractCourseCodes(s: string): string[]` returns canonical-codes array (empty on `null`/rejection). `isOkanagan(s: string): boolean` returns true iff `s` carries an `_O` campus suffix. `CODE_RE = /\b([A-Za-z]{2,4})\s*([0-9]{3}[A-Za-z]?)\b/g`; `'AANB_V 500' → { kind: 'code', raw: 'AANB 500' }`; `'_O' codes → { kind: 'rejected', raw: ... }`; bare subject → `{ kind: 'subject', raw: ... }`; bare random text → `null`. The type `CanonicalResult` is exported.
    - _Requirements: REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4_
  - [x] 2.2 Property test — Round-trip with subject subset
    - **Property 1: Canonical form invariant**
    - **Validates: Requirements REQ-1.1, REQ-1.2**
  - [x]* 2.3 Property test — Okanagan rejection invariant
    - **Property 2: No `_O` code emits `{ kind: "code" }`**
    - **Validates: Requirements REQ-1.3**
  - [x]* 2.4 Property test — Subject-prefix shape
    - **Property 3: Bare subjects produce `{ kind: "subject" }`**
    - **Validates: Requirements REQ-1.4**
  - [x]* 2.5 Property test — Canonicalization idempotence
    - **Property 4: `canonicalize(canonicalize(s).raw) === canonicalize(s)`**
    - **Validates: Requirements REQ-1.1**
  - [x] 2.6 Example test — `_V` suffix strip, multi-space, mixed case
    - _Requirements: REQ-1.1, REQ-1.2_

- [x] 3. Checkpoint - Course canonicalization tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Verify ported Prerequisite AST parser and lock its properties (`src/shared/prereq-ast/`)
  - [x] 4.1 Baseline the verbatim copy with a fixture corpus
    - Port `__fixtures__/prereq-strings.json` (CPSC 110, MATH 200, AANB 500, KIN 320 mid-clause, multi-`recommended` tails); write a snapshot test asserting parser outputs against the fixture set so donor drift surfaces
    - _Requirements: REQ-5, REQ-6_
  - [x] 4.2 Property test — No-throw
    - **Property 5: For all `string` (incl. random bytes, unbalanced parens, embedded NULs, `none.`): `parsePrereq(s)` returns `null` or `Expr`, never throws**
    - **Validates: Requirements REQ-5.1, REQ-5.2, REQ-5.3**
    - Generator: `fc.string({ minLength: 0, maxLength: 2000 })` + adversarial constants; run count 1000
  - [x]* 4.3 Property test — Okanagan stripping
    - **Property 6: `walkCodeLeaves(parsePrereq(s))` yields no `_O` codes**
    - **Validates: Requirements REQ-5.4**
  - [x]* 4.4 Property test — Soft-tail only at top level
    - **Property 7: mid-clause `recommended` inside unbalanced parens does NOT produce a top-level `Soft` wrapper**
    - **Validates: Requirements REQ-5.6**
  - [x]* 4.5 Property test — Round-trip code set
    - **Property 9: Code-leaf set of `parsePrereq(displayExpr(e))` equals that of `e`**
    - **Validates: Requirements REQ-6.6**
  - [x]* 4.6 Property test — displayExpr non-empty
    - **Property 8: `displayExpr(e)` non-empty (sentinel for empty-text nodes)**
    - **Validates: Requirements REQ-6.1, REQ-6.5**
  - [x]* 4.7 Property test — Soft-flattening
    - **Property 10: `displayExpr(Soft(child)) === displayExpr(child)`**
    - **Validates: Requirements REQ-6.4**
  - [x] 4.8 Example test — KIN 320 mid-clause recommended, AANB 500 `_V` strip
    - _Requirements: REQ-5.6, REQ-1.2_
  - [x] 4.9 Property test — Soft-tail positive split (top-level clear cases)
    - **Property 38: when a Prerequisite String ends with a top-level `recommended` tail (e.g. "X is recommended"), `parsePrereq(s)` produces a `Soft`-rooted expression for that tail**
    - **Validates: Requirements REQ-5.5**
    - Generator: `arbRecommendedTail` from design.md §Domain 2.
  - [x]* 4.10 Property test — Code node canonical form output
    - **Property 39: `displayExpr(parsePrereq(s))` is in canonical `<subject> <number>` form (subject uppercase, single space, no `_V`, no trailing whitespace)**
    - **Validates: Requirements REQ-6.2**
    - Generator: `arbExpr` from design.md §Domain 3 feeding `parsePrereq` outputs.
  - [x]* 4.11 Property test — And/Or separator presence
    - **Property 40: `displayExpr(e)` contains `' + '` between operands whose AST parent is `kind: 'and'` and `' / '` between operands whose parent is `kind: 'or'` (donor's joiners at `prereqAst.ts:1368,1370`)**
    - **Validates: Requirements REQ-6.3**
    - Generator: `arbExpr` from design.md §Domain 3.

- [ ] 5. Checkpoint - Prerequisite AST parser tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Prerequisite Tree server BFS (`src/server/prereq/`)
  - [ ] 6.1 Implement `build-graph.ts` with `PrereqNode`, `PrereqEdge`, `PrereqGraph`, `buildPrereqGraph`
    - Use `walkCodeLeaves(parsePrereq(root.prerequisite))` as BFS seed; first-seen-wins visited set; depth-capped at `MAX_DEPTH = 15`; coreq column adjacent to root with coreq-of-coreq not walked; selectionKey computed server-side for each disjunction
    - _Requirements: REQ-7.1, REQ-7.2, REQ-7.3, REQ-7.4, REQ-7.5, REQ-8.1_
  - [ ] 6.2 Implement `app/api/prereq-tree/route.ts` REST façade (`GET /api/prereq-tree?root=CPSC+320`)
    - Auth-gated by `requireUser(request)` from `@/src/server/auth` (no central middleware exists per route — each route imports `requireUser` directly). Rate-limit `RATE_LIMIT_PREREQ` (default 10 req/min/IP) wired via the in-route map (no middleware exists).
    - _Requirements: REQ-4.1, REQ-4.3, REQ-7_
  - [ ] 6.3 Implement `src/server/prereq/agent-tool.ts` (`get_prereq_tree` agent tool façade)
    - Append a `prereqModule` to the `modules` array in `src/server/modules/index.ts` (becomes module #13); tool name `get_prereq_tree`; returns `PrereqGraph`. Aggregation via the existing `modules.flatMap((m) => m.tools)` pipeline at `src/server/agent/stream.ts:27` (no slot numbering).
    - _Requirements: REQ-4.1, REQ-7_
  - [ ]\* 6.4 Property test — Cycle-safety invariant
    - **Property 11: Each code appears at most once in `PrereqGraph.nodes`**
    - **Validates: Requirements REQ-7.1**
  - [ ]\* 6.5 Property test — Depth cap
    - **Property 12: No node has BFS depth greater than `depthCap`**
    - **Validates: Requirements REQ-7.2**
  - [ ]\* 6.6 Property test — No coreq-of-coreq
    - **Property 13: Edges contain no coreq-of-coreq-of-coreq chain**
    - **Validates: Requirements REQ-7.4**
  - [ ]\* 6.7 Property test — Coreq depth invariant
    - **Property 14: Every `kind: 'coreq'` node has BFS depth exactly `1` (pure graph-side invariant, `arbCourseDataset` generator)**
    - **Validates: Requirements REQ-7.3**
  - [ ]\* 6.8 Example test — Coreq column adjacency (`hasCoreqs === true`)
    - Render the graph for a root with a non-empty `corequisite`; assert the coreq nodes sit in the column between root (depth 0) and the first prereq column. This is the rendering-side example of Property 14 (whose pure graph invariant — coreq nodes at BFS depth 1 — is covered by the property test in 6.7).
  - [ ]\* 6.9 Integration test — Server BFS against mocked `get_course`
    - Mock Meilisearch `get_course` to return fixtures with known cycles + depth chains; assert graph shape
    - _Requirements: REQ-7.1, REQ-7.2, REQ-7.4_
  - [ ]\* 6.10 Example test — Empty no-prereqs state
    - _Requirements: REQ-10.3_
  - [ ]\* 6.11 Example test — Root not-found state
    - _Requirements: REQ-10.4_

- [ ] 7. Checkpoint - Prerequisite Tree server tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Prerequisite Tree client components (`src/components/prereq-tree/`)
  - [ ] 8.1 Implement `selection-key.ts` encode/decode (`${ownerCode}::${path}`)
    - _Requirements: REQ-8.1_
  - [ ] 8.2 Implement `CourseNode` with `known`/`unknown`/`root`/`note` variants
    - Apply neumorphic raised-surface treatment; recessed on press
    - _Requirements: REQ-9.4, REQ-20.1_
  - [ ] 8.3 Implement `DropdownDisjunctionNode` (REQ-9.1 — `one of A, B, C` variant) and `StackedDisjunctionNode` (REQ-9.2 — `Either (a) … or (b) …` variant)
    - Dropdown menu scales with canvas zoom; wheel events go to the menu, not the canvas, while open; outside-pointerdown + Escape dismiss
    - _Requirements: REQ-9.1, REQ-9.2, REQ-20.6_
  - [ ] 8.4 Implement `DisjunctionDetailStrip` rendering the selected course's title or "(not in calendar)" sentinel
    - _Requirements: REQ-9.3_
  - [ ] 8.5 Implement `OptionalEdge` (dashed bezier + "optional" toggle pill) and `HardEdge`
    - _Requirements: REQ-10.1, REQ-10.2_
  - [ ] 8.6 Implement `prereq-tree-pane.tsx` rendering states: empty no-prereqs, not-found, "Loading course index…"
    - Wire root-input box for switching root course without leaving the pane
    - Append the `[data-pane="prereq-tree"] .react-flow__*` CSS scoping (edge stroke, dasharray for optional, attribution hidden, node inherits font) to `app/globals.css` per UI/UX §B. Node variant classes (`bg-primary-container` root, `bg-surface` known, `bg-error-container` unknown, `bg-surface-container-low text-muted` note, `bg-secondary-container` coreq) applied per `data-variant`. `data-node-id`, `data-edge-variant="optional"`, `data-toggle="soft-toggle"` attributes carry the property-oracle contract.
    - _Requirements: REQ-4.3, REQ-10.3, REQ-10.4, REQ-10.5_
  - [ ]\* 8.7 Property test — Sibling isolation
    - **Property 15: Toggling path `p` modifies only the `${owner}::${p}` selection key**
    - **Validates: Requirements REQ-8.3**
  - [ ]\* 8.8 Property test — Root-switch survival
    - **Property 16: Every Selection Key Map entry survives a root switch with the same value**
    - **Validates: Requirements REQ-8.4**
  - [ ]\* 8.9 Property test — Default index 0
    - **Property 17: Disjunctions with absent Selection Keys default to child index 0**
    - **Validates: Requirements REQ-8.2**
  - [ ]\* 8.10 Example test — Dropdown-absorption (selected option routes edges into the dropdown group node)
    - _Requirements: REQ-8.5_
  - [ ]\* 8.11 Example test — Course → Course Lookup one-click navigation
    - _Requirements: REQ-4.2, REQ-9.5_
  - [ ]\* 8.12 Snapshot test — CourseNode variants (root/known/unknown/note), DropdownDisjunctionNode, StackedDisjunctionNode
    - _Requirements: REQ-9.4_
  - [ ]\* 8.13 Example test — Menu inherits canvas zoom (dropdown scales with current zoom; closes on zoom change)
    - _Requirements: REQ-9.1, REQ-9.2_
  - [ ]\* 8.14 Property test — Soft-toggle effect on top-level `Soft` blocks
    - **Property 36: When the optional toggle for a `Soft`-wrapped subtree is enabled (`M[p] === 1`, mirroring `activeChannel.state.softToggles[path]` per §C, root = `''`) the subtree's outgoing edges render; when disabled (`M[p] === 0`) they hide. The label is invariant under the toggle (Property 10).**
    - **Validates: Requirements REQ-10.2**
    - Generator: `arbSoftSelection` from design.md §Domain 5; render the same `(tree, path)` at both `M[p] = 0` and `M[p] = 1`, assert the child-subtree edge count differs.
  - [ ]\* 8.15 Example test — Prereq Tree root-input switch re-roots the tree (REQ-4.3 nav direction)
    - Enter a new code in the tree's root input; assert the tree re-fetches and re-roots with the new code as root.
    - _Requirements: REQ-4.3_

- [ ] 9. Checkpoint - Prerequisite Tree client tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement Sidebar collapse persistence + version badge (inline into `src/components/shell/session-sidebar.tsx`)
  - [ ] 10.1 Add `useSidebarCollapsed()` hook + `<VersionBadge />` JSX inline in `src/components/shell/session-sidebar.tsx`
    - `useSyncExternalStore` for pre-paint hydration against `localStorage["reogent.sidebar.collapsed"] = "0" | "1"`; SSR returns default expanded; client effect reconciles within a microtask to satisfy "re-render on first paint". `<VersionBadge />` reads `process.env.__REOGENT_VERSION__` (injected via `next.config` build-time from `package.json`) and renders `text-[0.625rem]` mono in sidebar footer bottom-left. Both inline rather than split files: existing sidebar file already owns the layout and consumes `useChatShell()`. Ponytail: one file edit instead of three new files (`collapse-persist.ts`, `version-badge.tsx`, `next.config` wiring is a separate 10.2 line).
    - _Requirements: REQ-11.1, REQ-11.2, REQ-11.3_
  - [ ] 10.2 Wire `next.config` injection of `__REOGENT_VERSION__`
    - Build-time `process.env.__REOGENT_VERSION__` from `package.json` `version` field. One-line addition in `next.config.ts`.
    - _Requirements: REQ-11.3_
  - [ ]\* 10.3 Example test — Sidebar collapsed-state round-trips across reload
    - Write `localStorage["reogent.sidebar.collapsed"] = "1"`, reload, assert collapsed; toggle to `"0"`, reload, assert expanded. Merges old 10.4 + 10.5 into one round-trip smoke.
    - _Requirements: REQ-11.1, REQ-11.2_
  - [ ]\* 10.4 Smoke test — `AUTH_ENABLED=false` path unchanged
    - _Requirements: REQ-11.4_

- [ ] 11. Implement Pane Host + Registry (`src/components/shell/`)
  - [ ] 11.1 Implement `pane-registry.ts` with `PaneId`, `PaneState`, `PaneEntry`, `PANE_REGISTRY`, `PANE_BY_ID`
    - First four entries: `map` (existing, `preemptableByAgentMap: false`, `icon = map`), `course-lookup` (`icon = search`), `prereq-tree` (`{ root: "", selections: {} }`, `icon = tree`), `calendar` (`{ cursor: <this-month>, kinds: ["academic","holiday"] }`, `icon = calendar`). Each `PaneEntry.icon` is `(props) => <Icon name={...} {...props} />` referencing the `src/components/icons.tsx` `ICON_MAP`. Add two entries to `ICON_MAP`: `calendar: "calendar-2-line"`, `tree: "tree-line"` (both confirmed in `@iconify-json/mingcute`). The `search` and `map` glyphs already exist.
    - _Requirements: REQ-19.5_
  - [ ] 11.2 Implement `pane-host.tsx` rendering the active channel's `PaneEntry.Component`
    - At `activeChannel === null`, render the 3.75rem right-side rail containing `<ToolsStrip orientation="rail" />` (chat takes the remaining width). At non-null, expand to 50% with the pane's header + body inside a `<section data-pane={entry.id} className="neu-panel rounded-2xl flex flex-col h-full overflow-hidden">` frame per UI/UX §Shell. Width animates via the existing spring (stiffness 300, damping 30); reduced-motion instant. Map pane (`entry.id === "map"`) skips the frame header — `MapPanel` owns its chrome. Mobile (`<640px`): the rail is `hidden`; user-tool panes render via `<PaneBottomSheet>` (80vh bottom sheet) per UI/UX §Shell.
    - _Requirements: REQ-19.1, REQ-19.2_
  - [ ] 11.3 Implement `pane-preempt.tsx` ("Back to <tool>" pill)
    - Captures previous user channel into `sessionStorage["reogent.pane.previousUserChannel"]`; offers one-click restore. SessionStorage semantics: dies on tab close, no cross-tab sync, no expiry sweep. **Provenance gate**: the pill renders only when `previousUserChannel !== null` — i.e., a user tool must have been opened before the agent emitted map data. If the agent is the first to set `activeChannel`, `previousUserChannel` is `null` and no pill appears.
    - _Requirements: REQ-19.3_
  - [ ] 11.4 Migrate `chat-shell-context.tsx` from `mapOpen: boolean` + `highlight: MapHighlight | null` to `activeChannel: { id; state } | null` + `previousUserChannel`
    - `MapHighlight` lives at `src/lib/walking.ts:43`; current shell API surface: `setMapOpen(open: boolean)` at `chat-shell-context.tsx:23`, `setHighlight(highlight: MapHighlight | null)` at line 18 (interface, `:106` impl), and `mobileMapOpen`/`setMobileMapOpen` bottom-sheet state (lines 59, 111-113, 139). Re-route every existing call site:
      - `setHighlight` writes: `src/components/chat/tool-renderers.tsx:167,196,226`; `src/components/chat/chat-panel.tsx:249,280,440` — each `setHighlight(payload)` becomes `setActiveChannel("map", { highlight: payload })` (or `setActiveChannel(null)` for the `setHighlight(null)` clear at chat-panel.tsx:249).
      - `mapOpen` reads/writes: `src/components/shell/app-shell.tsx:83` (read), `:194` (the `animate={{ width: mapOpen ? "50%" : "3.75rem" }}` layout — becomes `activeChannel?.id === "map"`), and `src/components/map/map-panel.tsx:224-256` (surface/tab layer visibility, collapse/expand buttons).
      - `mobileMapOpen` bottom-sheet: `app-shell.tsx:83,111,139,144,155` and `map-panel.tsx:272-398` — map to `activeChannel?.id === "map"` with a separate `mobileMapOpen` boolean retained for the bottom-sheet presentation (the sheet is a responsive presentation concern, not a pane-selection concern).
    - Map is non-preemptable so `pane-preempt` does not appear for it.
    - Add `data-pane="chat"` to the chat panel root element (the `{children}` wrapper at `app-shell.tsx:190` `#main-content` or `chat-panel.tsx` root) so Property 32's `document.querySelector('[data-pane="chat"]')` oracle resolves. Every pane surface root carries `data-pane={entry.id}` via the `pane-host.tsx` frame (task 11.2).
    - _Requirements: REQ-19.1, REQ-19.2, REQ-19.3_
  - [ ]\* 11.5 Property test — Chat-never-hidden
    - **Property 30: For all `activeChannel` states, the Chat panel remains visible**
    - **Validates: Requirements REQ-19.1, REQ-19.2**
  - [ ]\* 11.6 Property test — Map-precedence-non-preemption
    - **Property 31: Agent map data over a user tool switches pane to `map` and previous user channel is recoverable**
    - **Validates: Requirements REQ-19.3**
  - [ ]\* 11.7 Integration test — Agent emits map data while Course Lookup is open → Back-to pill offered
    - _Requirements: REQ-19.3_

- [ ] 12. Checkpoint - Sidebar + Pane Host tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement Course Lookup (`src/components/course-lookup/` + `app/api/courses/`)
  - [ ] 13.1 Implement `course-detail-card.tsx` rendering code / title / credits / description / prerequisite / corequisite / terms / sections
    - Omit null/empty fields rather than render placeholders; render "Prereq Tree" affordance when `prerequisite` non-null (sets `activeChannel = { id: "prereq-tree", state: { root: code } }`). The affordance `<button>` carries `data-action="open-prereq-tree"` and `data-code={record.code}` (per UI/UX §A + the data-attribute contract). Surface tokens: `bg-surface-container-low` card, `.neu-raised` for the affordance button, `border-border-subtle` for section-row hairlines, `text-primary` for interactive text — all from `DESIGN.md` Whisper-Neumorphic palette.
    - _Requirements: REQ-2.1, REQ-2.2, REQ-2.3, REQ-4.1_
  - [ ] 13.2 Implement `section-row.tsx` rendering term / days / HH:MM 24h / instructor
    - _Requirements: REQ-2.4_
  - [ ] 13.3 Implement `course-lookup-pane.tsx` with ambiguous-input handling
    - Exact → prefix → substring fallback chain; "Did you mean" chips (up to 8) re-execute lookup on click. Empty-state message inline in this file (one-line variant lookup: "no results for `<applied filters>`" or "no course matching `<code>`") — no separate `empty-state.tsx` component (Ponytail: one line of JSX, one file).
    - _Requirements: REQ-3.1, REQ-3.4, REQ-3.5, REQ-3.6_
  - [ ] 13.4 Implement `app/api/courses/route.ts` (`?q=...&subject=...&level=eq|plus|minus&digit=N`)
    - Meilisearch prefix/subject/level-operator search; cap subject listing at 200 with "Showing first 200 of N" footer
    - _Requirements: REQ-3.1, REQ-3.2, REQ-3.3_
  - [ ] 13.5 Create `app/api/courses/[code]/route.ts` exact-lookup REST route
    - New route (does not exist today); today only the agent `get_course` tool reaches the courses module (`src/server/modules/courses.ts`). Calls `requireUser(request)` from `@/src/server/auth`. Canonicalizes input via `src/shared/course-code.ts`; calls reogent's existing `findByCode` at `src/server/modules/courses.ts:144-157` (which already canonicalizes inline; do not refactor it during this port — defer to a follow-up PR). Returns 200 with the Course Record (omit null fields per REQ-2.2), 404 on miss (REQ-1), 400 on rejected `_O` code (REQ-1.3). JSON response.
    - _Requirements: REQ-1.1, REQ-1.2, REQ-1.3, REQ-2.2_
  - [ ]\* 13.6 Snapshot test — Course Detail Card render with sections
    - _Requirements: REQ-2.1_
  - [ ]\* 13.7 Example test — Null-field omission (universal property)
    - _Requirements: REQ-2.2_
  - [ ]\* 13.8 Example test — Subject cap 200 + footer notice
    - _Requirements: REQ-3.2_
  - [ ]\* 13.9 Example test — Did-you-mean 8-chip cap + click re-lookup
    - _Requirements: REQ-3.5, REQ-3.6_
  - [ ]\* 13.10 Property test — Level-operator relation
    - **Property 37: for `<subject> <op><digit>`, `=` returns courses whose `number`'s first digit equals `digit`; `+` returns courses whose first digit ≥ `digit`; `-` returns courses whose first digit ≤ `digit`. First digit computed as `Number(String(number).charAt(0))`.**
    - **Validates: Requirements REQ-3.1, REQ-3.2, REQ-3.3**
    - Generator: `arbLevelQuery` from design.md §Domain 1 (`subject × op ∈ {=, +, -} × digit ∈ 1..5`); assert every returned row's first digit satisfies the operator relation.
  - [ ]\* 13.11 Example test — "Prereq Tree" affordance on Course Detail Card opens the tree with the record's code as root (REQ-4.1 nav direction)
    - Render a Course Record with non-null `prerequisite`; click the "Prereq Tree" affordance; assert `activeChannel` becomes `{ id: "prereq-tree", state: { root: <that code> } }`.
    - _Requirements: REQ-4.1_

- [ ] 14. Checkpoint - Course Lookup tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement Citations server (`src/server/citations/`)
  - [ ] 15.1 Implement `src/shared/citations/citation.ts` types (`Citation`, `CitationSeed`, `CitationKind`)
    - `CitationKind` is `"course" | "program" | "event" | "calendar" | "page" | "generic" | (string & {})` — open-string-enum
    - _Requirements: REQ-12.1, REQ-12.3_
  - [ ] 15.2 Implement `src/server/citations/extractors.ts` with `CITATION_EXTRACTORS: Record<string, CitationExtractor>`
    - One entry per existing tool returning a URL-bearing payload (`search_courses`, `get_course`, `search_programs`, `search_events`, `get_key_dates`, `search_ubc_pages`); each extractor maps `(result, input) → CitationSeed[]`
    - _Requirements: REQ-12.2, REQ-15.3_
  - [ ] 15.3 Implement `src/server/citations/allocator.ts` (`allocateCitations`)
    - 1-indexed `index` assignment; dedupe by `source_url + label`; no gaps, no duplicates
    - _Requirements: REQ-12.1, REQ-12.2_
  - [ ] 15.4 Implement `src/server/citations/stamp-used.ts` (`stampUsed`)
    - Apply `/\[(\d+)\]/g` over final assistant text; mark `used: true` for matching indices; runs on `done`, not mid-stream
    - _Requirements: REQ-12.2_
  - [ ] 15.5 Extend agent loop in `src/server/agent/` to emit NDJSON `citations` event after each `tool_end` and a final stamped array on `done`
    - Live stream carries `used: false`; the `done` event carries the stamped array
    - _Requirements: REQ-12.2_
  - [ ] 15.6 Extend system prompt in `src/server/agent/loop.ts` with the `[N]` citation contract
    - Append to the `SYSTEM_PROMPT` template const at `src/server/agent/loop.ts:3-24` (the builder at `systemPrompt(now)`, lines 27-39, prepends the date — the citation paragraph goes in `SYSTEM_PROMPT` so it travels through every provider).
    - Contract paragraph is provider-agnostic — text only, lives in the system prompt, identical across Anthropic/OpenAI/Google.
    - Append the turn's current `citations` array (index + label) so the model can attribute.
    - _Requirements: REQ-15.1, REQ-15.2, REQ-15.3, REQ-15.4_
  - [ ]\* 15.7 Property test — Index-1 continuity
    - **Property 18: `index` values form exactly `1..length` with no gaps or duplicates**
    - **Validates: Requirements REQ-12.1, REQ-12.2**
  - [ ]\* 15.8 Property test — Source-url honesty
    - **Property 19: `source_url` undefined or empty is omitted (not `""`)**
    - **Validates: Requirements REQ-12.3**
  - [ ]\* 15.9 Property test — Used-only-after-stamp
    - **Property 20: Live `citations` events carry `used: false`; only `done` carries stamped `used` bits**
    - **Validates: Requirements REQ-12.2**
  - [ ]\* 15.10 Integration test — Per-provider system-prompt parity smoke (Anthropic, OpenAI, Google)
    - _Requirements: REQ-15.4_
  - [ ]\* 15.11 Property test — Citations array shape robustness
    - **Property 41: For all assistant messages, `citations` may be `null`, `undefined`, a non-array, or a `Citation[]` (including `[]`); the renderer emits no chips and no panel for null/undefined, falls back to `[]` for non-array types, and renders every element of the array branch (schema-conformant, Property-18 stamped).**
    - **Validates: Requirements REQ-12.4**
    - Generator: `arbCitationArray` from design.md §Domain 6.
  - [ ]\* 15.12 Example test — System prompt includes the citation contract paragraph verbatim
    - Snapshot against the `SYSTEM_PROMPT` const at `src/server/agent/loop.ts:3-24` (test reads the module's exported const and asserts the paragraph is present) so future edits surface as a snapshot diff.
    - _Requirements: REQ-15.1, REQ-15.4_

- [ ] 16. Citations Postgres migration + history rehydration
  - [ ] 16.1 Extend the `SCHEMA` template const in `src/server/db/migrate.ts:3` with `citations JSONB` on the `messages` block
    - The table is created with `CREATE TABLE IF NOT EXISTS` for a fresh Postgres instance; this is the only edit needed — existing dev databases are dropped and recreated by `docker-compose down -v && up`. There is no additive migration tool to wire. The new column is nullable so legacy rows (in already-migrated dev databases) tolerate `null`; the client treats `null` and `[]` identically.
    - _Requirements: REQ-12.5_
  - [ ] 16.2 Extend `appendExchange` write path to accept citations on the assistant half
    - _Requirements: REQ-12.5_
  - [ ]\* 16.3 Integration test — History rehydration round-trip
    - Drive the persisted-message path (JSONB column → history reload); assert the reloaded `citations` render identically to the live stream (byte-equality oracle per Property 21).
  - [ ]\* 16.4 Property test — History rehydration byte-equality
    - **Property 21: `JSON.stringify(JSON.parse(rawRow.citations))` byte-equals `JSON.stringify(messages.citations)` for all persisted assistant messages (no `?? []` normalization; `'null' === 'null'` for the null branch)**
    - **Validates: Requirements REQ-12.5**
    - Generator: `arbPersistedMessage` from design.md §Domain 6.

- [ ] 17. Implement Citations client (`src/components/chat/citations/`)
  - [ ] 17.1 Implement `citation-chip.tsx` (anchored / span literal / literal `[N]`)
    - When `citations[N-1].source_url` present → `<a target="_blank" rel="noopener noreferrer">`; when absent → non-clickable `<span>` with `label` tooltip; when `N` out of `1..citations.length` → literal string `[N]`
    - _Requirements: REQ-13.1, REQ-13.2, REQ-13.3_
  - [ ] 17.2 Implement `chip-injector.ts` recursive leaf-string walker
    - Walk the markdown AST; inject `<CitationChip>` at every leaf string child of paragraph/list-item/strong/em/table-cell/heading/blockquote/link
    - _Requirements: REQ-13.4_
  - [ ] 17.3 Implement `sources-panel.tsx` "Sources used" / "Other retrieved context" split
    - Defaults to collapsed with height transition; "Other retrieved context" rows render at reduced opacity (`text-primary/60`); "Sources used (M)" summary header when used-list empty and other-list non-empty; scrolls into view on expand. Surface tokens: `bg-surface-container-low` panel, `text-on-surface-variant` section headers, transition uses `cubic-bezier(0.16, 1, 0.3, 1)` (DESIGN.md motion). `data-sources-panel` on root; used rows carry `data-citation-row` + `data-used="true"`, other rows `data-used="false"`.
    - _Requirements: REQ-14.1, REQ-14.2, REQ-14.3, REQ-14.4, REQ-14.5_
  - [ ] 17.4 Extend `chatStream` (the `ChatApi.chat` impl at `src/lib/api.ts:94`) NDJSON consumer with `onCitations` callback
    - Add `onCitations?: (citations: Citation[]) => void` to the `callbacks` parameter at `src/lib/api.ts:97-104` (sibling to existing `onDelta`, `onTextClear`, `onThinking`, `onToolStart`, `onToolEnd`, `onTurnStart`). Wire it inside the NDJSON loop at the same offset as `onDelta` (line 158) and `onToolStart` (line 164). Store the array on the in-flight `ChatResponse`; re-render chips as the array fills.
    - _Requirements: REQ-12.2_
  - [ ]\* 17.5 Property test — Out-of-range literal invariant
    - **Property 22: `[k]` outside `1..N` renders as the literal string `[k]`**
    - **Validates: Requirements REQ-13.3**
  - [ ]\* 17.6 Property test — Recursive-leaf injection
    - **Property 23: (23a) In-range `[N]` becomes chips at every leaf string of the listed markdown elements; (23b) the injector's chip sequence is invariant under markdown re-rendering**
    - **Validates: Requirements REQ-13.4**
  - [ ]\* 17.7 Property test — No empty-href anchor + label tooltip
    - **Property 24: If `source_url` is absent, the chip DOM contains no `<a>` and the chip exposes the citation's `label` as tooltip (`title` or `aria-label`)**
    - **Validates: Requirements REQ-13.2**
  - [ ]\* 17.8 Example test — Two-list rendering edge cases
    - _Requirements: REQ-14.1, REQ-14.2_
  - [ ]\* 17.9 Example test — Collapsed-by-default + scroll-into-view on expand
    - _Requirements: REQ-14.3, REQ-14.4_
  - [ ]\* 17.10 Integration test — Sources-panel renders against live stream's `citations` array as it fills
    - Drive `chatStream` (the `ChatApi.chat` impl at `src/lib/api.ts:94`) callbacks (`onCitations` at `src/lib/api.ts:97-104`) with a synthetic NDJSON feed carrying `tool_end` events whose results match `CITATION_EXTRACTORS` shapes; assert the panel's "Sources used" / "Other retrieved context" lists update within one animation frame.
    - Fixture lives at `__fixtures__/agent-turns.json` (see 17.13).
    - _Requirements: REQ-14.1, REQ-14.2, REQ-14.3, REQ-14.4, REQ-14.5_
  - [ ] 17.11 Wire `chip-injector` + `sources-panel` into the existing assistant message renderer at `src/components/chat/message.tsx`
    - The existing renderer is at `src/components/chat/message.tsx` (read it first). After parsing the assistant turn's markdown, run `chip-injector` on every paragraph/list-item/strong/em/table-cell/heading/blockquote/link leaf that contains a `[N]` marker where `N ∈ 1..citations.length`. Mount `<CitationChip>` for in-range markers; leave the literal `[N]` for out-of-range. Append `<SourcesPanel citations={citations} />` as the last child of the assistant message's container `<div>`. No URL state — the chip array lives on the rendered message component from the stream callback's `onCitations` prop.
    - _Requirements: REQ-13.1, REQ-13.4, REQ-14.1_
  - [ ] 17.12 Wire `onCitations` callback through chat-shell-context to the active assistant message state
    - In `src/components/chat/chat-shell-context.tsx` (existing context at `:1`), expose a `citations: Citation[]` slot on the active assistant message state. `chatStream`'s new `onCitations` callback (from task 17.4) pushes into this slot, the renderer reads it, and the sources-panel re-renders are gated on this slot's identity. No new context provider — single consumer.
    - _Requirements: REQ-12.2, REQ-13.1_
  - [ ] 17.13 Fixture — `__fixtures__/agent-turns.json` for synthetic NDJSON stream in 17.10
    - 3-5 turn fixtures covering: turn with one `get_course` tool call + citations; turn with `get_key_dates` tool call + calendar citations (cite by `source_url` from KeyDateDoc); turn with zero citations (no chips emitted); turn with 8+ citations (overflow scroll test). Shape: `{ turns: [{ providers: { anthropic: NDJSONString, openai: NDJSONString, google: NDJSONString } }] }`.
    - _Requirements: REQ-14.1_

- [ ] 18. Checkpoint - Citations server + client tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Implement Calendar server (REST route + donor date-math)
  - [ ] 19.1 Selectively extract donor `reoditetools/web/src/lib/calendar.ts` helpers into `src/shared/calendar/date-math.ts`
    - Donor exports 14 names total: 10 pure date helpers (`parseISODate`, `toISODate`, `startOfMonth`, `addMonths`, `isSameDay`, `buildMonthGrid`, `formatMonthHeading`, `formatMonthBadge`, `formatFullDate`), 1 browser-only caller (`loadCalendar` — uses Vite's `import.meta.env.BASE_URL` at donor `calendar.ts:27`, not portable to Next.js), 3 corpus types (`CalendarItem`, `CalendarPayload`, `CalendarCategory` — structurally incompatible with reogent's `CalendarEvent`), and 1 single-day-bound helper (`itemCoversDate(item: CalendarItem, date: Date)` — its `endDate` branch is dead under `CalendarEvent`'s single-day shape; inline the one-line `isSameDay(parseISODate(event.date), d)` check directly in the calendar-pane render). Selectively port the 10 pure helpers; drop the other 4 explicitly. Ponytail comment: the donor file imports Vite-specific `import.meta.env.BASE_URL` inside `loadCalendar`; a verbatim file-level copy would land Vite-importing code into a Next.js repo, so selective function-by-function port is the smallest safe path.
    - _Requirements: REQ-16_
  - [ ] 19.2 Implement `src/shared/calendar/event.ts` types (`CalendarEvent`, `CalendarEventKind`)
    - `CalendarEvent` carries `{ kind: CalendarEventKind; date: string (ISO); label: string; source_url: string | null; tags: string[] }`. `CalendarEventKind = "academic" | "holiday" | (string & {})` — open-string-enum.
    - _Requirements: REQ-16.1_
  - [ ] 19.3 Implement `app/api/calendar/route.ts` (`GET /api/calendar?from=&to=&kinds=`) with the canonicalization inlined
    - Unauthenticated; `Cache-Control: public, max-age=300`. The route reads `KeyDateDoc[]` from the existing `calendar` module (`src/server/modules/calendar.ts:4`) and inlines a ~30-line projection to `CalendarEvent[]` (kind tagging, `source_url` propagation, `tags` sub-kind extraction). No separate `src/server/calendar/list-events.ts` file — single consumer (the REST route). The agent tool `get_key_dates` continues to return `{ dates: KeyDateDoc[] }` unchanged; the citation extractor for `get_key_dates` adapts the existing `KeyDateDoc[]` shape (already carries `source_url` at `src/server/modules/calendar.ts:12`).
    - _Requirements: REQ-16.1_
  - [ ] 19.4 Example test — `GET /api/calendar?from=&to=&kinds=academic` returns the projected `CalendarEvent[]` shape (snapshot a representative year)
    - Fixture lives at `__fixtures__/calendar-events.json` (see 19.5).
    - _Requirements: REQ-16.1_
  - [ ] 19.5 Fixture — `__fixtures__/calendar-events.json` for 19.4 snapshot + Calendar-pane render tests (Phase 20)
    - One representative academic year (~30-50 events) of `KeyDateDoc[]` input + the projected `CalendarEvent[]` output the route should produce. Includes academic + holiday kinds; multi-event day; empty-month case; multi-tag case (`["reading-week", "exam"]`). Drives 19.4, 20.5, 20.6, 20.7, 20.8.
    - _Requirements: REQ-16.1_

- [ ] 20. Implement Calendar client (`src/components/calendar/`)
  - [ ] 20.1 Implement `use-calendar-events.ts` SWR-style hook keyed on `[cursor, kinds]`
    - Focus revalidation; falls back to last-good on network error; silent revalidation. Ponytail comment: the route is a thin wrapper over data that updates at most weekly, so this hook is a small per-component cache rather than a global store — avoid lifting it to a context provider unless a second consumer appears.
    - _Requirements: REQ-16_
  - [ ] 20.2 Implement `calendar-pane.tsx` month grid + prev/next/today nav
    - Today cell gets `ring-2 ring-primary/40` independent of event markers; next-month disabled beyond 24-month horizon. Append to `app/globals.css` per UI/UX §D: in `:root` + `[data-theme="dark"]` add `--event-academic`, `--on-event-academic`, `--event-academic-container`, `--event-holiday`, `--on-event-holiday`, `--event-holiday-container` (aliasing `--secondary` / `--tertiary` families); in the `@theme inline` block add the six matching `--color-event-academic*` / `--color-event-holiday*` entries so utilities `bg-event-academic`, `text-event-academic`, `bg-event-academic-container`, `bg-event-holiday`, `text-event-holiday`, `bg-event-holiday-container` resolve. Day numbers use `text-muted` `font-mono`; grid cells use `bg-surface-container-low` with `neu-inset`. Property 26's `getComputedStyle` oracle requires the calendar stylesheet loaded into the test harness.
    - _Requirements: REQ-17.1, REQ-17.2, REQ-17.3, REQ-17.4, REQ-17.5_
  - [ ] 20.3 Implement day-cell markers + popover/tooltip
    - Two distinct `kind`-driven styles (academic vs holiday); one popover per day; multi-event days indicate count and enumerate; "Open source" link when `source_url` present
    - _Requirements: REQ-16.2, REQ-16.3, REQ-16.4_
  - [ ] 20.4 Implement upcoming-events list (N=10) + mobile stacking (<640px vertical, ≥640px side-by-side)
    - Mobile controls meet 44×44px tap target; reduced-motion month-change collapses to ≤0.01ms
    - _Requirements: REQ-18.1, REQ-18.2, REQ-18.3, REQ-18.4, REQ-18.5_
  - [ ]\* 20.5 Property test — Empty-month correctness
    - **Property 25: Empty month → no markers, no error state, no missing-data notice**
    - **Validates: Requirements REQ-16.5**
  - [ ]\* 20.6 Property test — Kind-driven style distinctness
    - **Property 26: Two events on one day with different kinds render two distinct markers**
    - **Validates: Requirements REQ-16.2**
  - [ ]\* 20.7 Property test — Multi-event count
    - **Property 27: Days with `k > 1` events indicate `k`**
    - **Validates: Requirements REQ-16.4**
  - [ ]\* 20.8 Property test — Today-independence
    - **Property 28: Today's cell receives `today` style independent of event markers**
    - **Validates: Requirements REQ-17.4**
  - [ ]\* 20.9 Property test — Horizon-disable
    - **Property 29: Cursors beyond `futureHorizonMonths` disable next-month affordance**
    - **Validates: Requirements REQ-17.5**
  - [ ]\* 20.10 Example test — Prev/next jumps; today jump via month-header click
    - _Requirements: REQ-17.1, REQ-17.2, REQ-17.3_
  - [ ]\* 20.11 Snapshot test — Mobile responsive snapshots at 375px + 1024px
    - _Requirements: REQ-18.1, REQ-18.2_
  - [ ]\* 20.12 Example test — Reduced-motion collapse ≤0.01ms
    - _Requirements: REQ-18.5_
  - [ ]\* 20.13 Example test — Multi-event-day popover enumerates each event
    - Render a day with three events (mix academic + holiday); open the popover; assert each event's label + `source_url` link (or absence) renders in a distinct row. (REQ-16.4's popover-enumeration aspect — complementary to 20.7's count-only property.)
    - _Requirements: REQ-16.3, REQ-16.4_
  - [ ]\* 20.14 Property test — Popover enumeration
    - **Property 27b: For all days with `k > 1` events, the expanded popover lists exactly `k` rows, each with the event's `label` and a `source_url` anchor when present**
    - **Validates: Requirements REQ-16.4**

- [ ] 21. Checkpoint - Calendar tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Wire discovery surfaces + agent-grounded answer precedence
  - [ ] 22.1 Implement `ToolsStrip` component (icon-only neumorphic raised buttons reading `PANE_REGISTRY`) in `src/components/shell/tools-strip.tsx`; mount it inside `pane-host.tsx`'s 3.75rem collapsed rail (desktop, `sm:`+) and inside the sidebar drawer footer (mobile `<1024px`, `lg:hidden`)
    - Vertical column of `PaneEntry.icon`-only `neu-raised` buttons (`size-9 rounded-xl`, `data-tool-id={entry.id}`, `aria-label={entry.label}`, `aria-pressed={active}`); tooltip = `entry.label`; click calls `setActiveChannel(entry.id, entry.defaultState)`. Active state: `bg-accent-subtle text-primary`. Rail nav class = `w-[3.75rem] flex flex-col items-center gap-1.5 py-3 px-0.5` (the `hidden sm:flex` visibility lives on the pane-host aside, task 11.2). Drawer footer nav class = `lg:hidden grid grid-cols-3 gap-1.5 pt-2 mt-2 border-t border-border-subtle/60 px-2 pb-2`.
    - _Requirements: REQ-19.5_
  - [ ] 22.2 Implement chat composer "+" menu listing `PaneEntry.label` rows
    - Prereq Tree row shows an inline code input before committing
    - _Requirements: REQ-4.3, REQ-19.5_
  - [ ] 22.3 Wire Course tool-renderer cards to "Prereq Tree" affordance
    - Clicking sets `activeChannel = { id: "prereq-tree", state: { root: code } }` directly via `setActiveChannel` (no URL serialization layer; no `toSearchParams`)
    - _Requirements: REQ-4.2_
  - [ ]\* 22.4 Integration test — Tool-grounded calendar answer takes priority over the Widget's static rendering
    - Agent emits a calendar-deadline claim while the Calendar Widget is open; assert the claim renders in Chat text within a `[data-pane="chat"]` ancestor and the chat rect does not sit behind the widget rect (Property 32's oracle, applied to the calendar case).
  - [ ]\* 22.5 Property test — Tool-grounded answer priority (universal)
    - **Property 32: For any agent turn emitting tool-grounded claim text `c` while pane `p` is open, the claim renders in Chat, the chat rect has non-zero size, and the chat rect does not overlap or sit behind pane `p`'s rect**
    - **Validates: Requirements REQ-19.4**
    - Generator: `arbToolGroundedTurnWithOpenPane` from design.md §Domain 9.
  - [ ]\* 22.6 Example test — Tool-result-card routes its course code into the Prereq Tree with one click (REQ-4.2 second leg; 13.11 covers card→tree, 22.3 is impl)
    - Render an Agent tool-call result card for `get_course` returning a record with a Prereq Tree affordance; click it; assert the Prereq Tree pane opens rooted at the tool card's code.
    - _Requirements: REQ-4.2_

- [ ] 23. UX / Accessibility pass across all ported controls
  - [ ] 23.1 Apply neumorphic raised-surface + recessed-on-press treatment across all ported interactive controls (chips, dropdowns, radios, day cells, navigation arrows)
    - _Requirements: REQ-20.1_
  - [ ] 23.2 Implement `prefers-reduced-motion: reduce` collapse across all ported animations
    - All registered transitions collapse ≤0.01ms; reveals render at final state on first paint
    - _Requirements: REQ-20.2_
  - [ ] 23.3 Verify keyboard tab order + focus rings (`ring-primary/40 ring-2` with ring-offset)
    - _Requirements: REQ-20.3_
  - [ ] 23.4 Add `sr-only` live region announcements for status changes (citation panel expand, calendar month change, prereq selection flip, citation chip click)
    - _Requirements: REQ-20.4_
  - [ ] 23.5 Contrast audit on "Other retrieved context" panel + "note" variant Prereq Tree node
    - All text ≥4.5:1 body, ≥3:1 large text against its rendered surface
    - _Requirements: REQ-20.5_
  - [ ] 23.6 Implement Prereq Tree dropdown menu wheel-event + outside-pointerdown + Escape dismiss
    - _Requirements: REQ-20.6_
  - [ ]\* 23.7 Property test sweep — Accessibility invariants (reduced-motion + focus-ring + live-region)
    - **Property 33: For all `prefers-reduced-motion: reduce` environments, registered transitions collapse ≤0.01ms**
    - **Property 34: Keyboard focus applies `ring-primary/40 ring-2` on every ported interactive control**
    - **Property 35: Status changes update an `sr-only` live region within one animation frame**
    - **Validates: Requirements REQ-20.2, REQ-20.3, REQ-20.4**
    - One file (`__tests__/a11y-properties.test.ts`), three property bodies in the same sweep. Shared fixtures: `prefers-reduced-motion: reduce` via matchMedia mock; `ring-primary/40 ring-2` assertion via computed-style read; live-region toggle via MutationObserver tick.
  - [ ]\* 23.8 Example test — Contrast audit on "Other retrieved context" panel + "note" variant Prereq Tree node
    - Assert computed color contrast against the rendered Whisper-Neumorphic surface token (`DESIGN.md` neumorphic `recessed`/`raised` palette) is ≥4.5:1 for body text and ≥3:1 for large text.
    - _Requirements: REQ-20.5_
  - [ ]\* 23.9 Example test — Prereq Tree dropdown Escape dismiss + outside-pointerdown dismiss
    - _Requirements: REQ-20.6_
  - [ ]\* 23.10 Example test — Raised-to-recessed interactive controls (pressed state)
    - Assert every ported chip/dropdown/radio/day-cell/nav-arrow renders the recessed variant on `:active` or pressed (touch-equivalent) state.
    - _Requirements: REQ-20.1_

- [ ] 24. Final checkpoint - All tests, lint, and format clean
  - Run `npm test` (Vitest once), `npm run lint` (Biome), `npm run format:check` (Prettier); fix any failures; ask user if blockers arise
  - Ensure all tasks marked complete have no hanging or orphaned code; every component is wired through to a registry, route, or consumer

## Notes

- Tasks marked with `*` are optional sub-tasks (property tests, example tests, snapshot tests, smoke tests) and can be skipped for faster MVP per kiro-sdd convention.
- Each task references specific requirement sub-clauses (e.g. `REQ-7.4`) for traceability.
- Checkpoints ensure incremental validation — failing tests at a checkpoint block the next wave.
- Property tests validate universal correctness properties defined in `design.md` §Correctness Properties (Properties 1–41 plus Property 27b across Domains 1–10).
- Unit, snapshot, integration, and example tests validate specific examples, edge cases, and end-to-end flows.
- The implementation language is TypeScript (Next.js 16 App Router, React 19) — the design document uses TS interfaces exclusively, so no language selection question applies.
- Tasks MUST execute in dependency-graph wave order; tasks that touch the same file live in different waves.
- Phase 0 Open Questions are doc-only reach decisions that gate migrations (Task 16.1) and the unauthenticated calendar route (Task 19.4) — they MUST complete before any later wave consuming the relevant file or route. Rate limit on `/api/prereq-tree` is set up in Task 6.2 (per-IP cap); reduced-opacity styling for the "Other retrieved context" rows is set in Task 17.3.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.6", "4.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "4.2", "4.8"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.6"] },
    { "id": 5, "tasks": ["4.5", "4.7", "4.9", "4.10", "4.11", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 9, "tasks": ["8.7", "8.8", "8.9", "8.10", "8.11", "8.12", "8.13", "8.14", "8.15"] },
    { "id": 10, "tasks": ["10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4", "11.1"] },
    { "id": 12, "tasks": ["11.2", "11.3"] },
    { "id": 13, "tasks": ["11.4"] },
    { "id": 14, "tasks": ["11.5", "11.6", "11.7"] },
    { "id": 15, "tasks": ["13.1", "13.2", "13.5"] },
    { "id": 16, "tasks": ["13.3", "13.4"] },
    { "id": 17, "tasks": ["13.6", "13.7", "13.8", "13.9", "13.10", "13.11"] },
    { "id": 18, "tasks": ["15.1", "15.2", "15.3", "15.4"] },
    { "id": 19, "tasks": ["15.5", "15.6"] },
    { "id": 20, "tasks": ["15.7", "15.8", "15.9", "15.10", "15.11", "15.12", "16.1", "16.4"] },
    { "id": 21, "tasks": ["16.2", "17.1", "17.2", "17.3", "17.4", "17.13"] },
    { "id": 22, "tasks": ["16.3", "17.11", "22.3"] },
    { "id": 23, "tasks": ["17.5", "17.6", "17.7", "17.8", "17.9", "17.10", "17.12"] },
    { "id": 24, "tasks": ["19.1", "19.2", "19.5"] },
    { "id": 25, "tasks": ["19.3"] },
    { "id": 26, "tasks": ["19.4", "20.1", "20.2", "20.3", "20.4"] },
    { "id": 27, "tasks": ["20.5", "20.6", "20.7", "20.8", "20.9", "20.10", "20.11", "20.12", "20.13", "20.14"] },
    { "id": 28, "tasks": ["22.1", "22.2"] },
    { "id": 29, "tasks": ["22.4", "22.5", "22.6"] },
    { "id": 30, "tasks": ["23.1", "23.2", "23.3", "23.4", "23.5", "23.6"] },
    { "id": 31, "tasks": ["23.7", "23.8", "23.9", "23.10"] }
  ]
}
```
