# Design Document: Reoditetools Port

## Overview

This design ports five user-facing features from the sibling `reoditetools` (UBCLLM) repository into reogent without touching reogent's architectural spine: Next.js 16 App Router, React 19, TypeScript, JWT auth, the server-side streaming tool-calling agent (up to 8 iterations, NDJSON `thinking`/`text`/`text_clear`/`tool_start`/`tool_end`/`turn_start`/`done`/`error` events; the `done` event carries `{ message, tool_calls, warning?, follow_ups? }`), the 12-module data layer aggregated as `modules.flatMap((m) => m.tools).map((t) => t.spec)` at `src/server/agent/stream.ts:27` (20 tool specs today; no "slot" registry, just iterating the `modules` array at `src/server/modules/index.ts`), Postgres `users`+`sessions`+`messages` schema created by a single `SCHEMA` const in `src/server/db/migrate.ts:3` (no migration files, no down-paths), Meilisearch, MapLibre GL + deck.gl map, the three-zone Sidebar + Chat + Visual Pane layout, and the multi-provider LLM adapter. Per-route auth: each `/api/*` route calls `requireUser(request)` from `@/src/server/auth`. The donor's browser-local inference stack, RAG pipeline, Python scrapers, Vite SPA, CI Pages action, Degree Planner, and Easter Eggs are explicitly out of scope (see `requirements.md` §Excluded).

### Features

1. **Course Lookup** — a one-shot Course Detail Card opened from a chat-side tool result, chat composer, or sidebar entry; case-insensitive canonicalization, ambiguous-input handling, prefix scan, "did you mean" chips.
2. **Prerequisite Tree** — an interactive React Flow graph rendered from the donor's recursive-descent Prerequisite AST parser, with selectable disjunctions, transitive BFS expansion, dashed optional edges, and empty / not-found / loading states.
3. **Sidebar enhancements** — collapse-state persistence across reloads plus a version badge in the footer.
4. **Citations** — a structured `citations` array on `ChatResponse` + `ChatMessage`, `[N]` marker chips rendered inline, "Sources used" vs "Other retrieved context" split panel, system-prompt contract enforced across LLM providers.
5. **Calendar widget** — a read-only month-grid fed by reogent's existing `calendar` module, with prev/next/today navigation, mobile stacking, and an upcoming-events list.

### Design Pillars

- **Reuse over rebuild — selectively.** Only ONE donor file is verbatim-portable: `prereqAst.ts` (1462 lines, zero imports). The 10 pure date-math functions in donor `lib/calendar.ts` are extractable selectively (drop `loadCalendar`, `CalendarItem`/`CalendarPayload`/`CalendarCategory`, `itemCoversDate` — see §F). Three other "patterns from the donor" are reimplemented, NOT verbatim ports: (a) course-code canonicalization — donor has no exported `canonicalize`/`extractCourseCodes`/`isOkanagan`/`CODE_RE`; its `extractCourseCodes` lives inside the RAG retriever (`retrieve.ts`, an excluded-file tree) and its `CODE_RE` is internal to `prereqAst.ts`. Reogent authors `src/shared/course-code.ts` from scratch matching the donor's regex shape; (b) BFS expansion — donor does this as inline UI logic in `components/PrereqTree.tsx`, no donor module exports a `buildPrereqGraph` function. Reogent authors `src/server/prereq/build-graph.ts` from scratch; (c) `[N]` citation-marker parser — donor's chip-injector is an inline `/\[(\d+)\]/g` regex inside `components/ChatMessage.tsx`. Reogent authors `src/server/citations/chip-injector.ts` from scratch using the same regex pattern, not a function import.
- **One canonical function per data domain, two thin façades.** Course canonicalization, prereq-tree BFS, and calendar listing each live in one place in `src/shared/`, fronted by an agent-tool façade and a REST-route façade. No parallel implementations.
- **Registry over boolean.** The visual pane's `mapOpen: boolean` flag in `chat-shell-context.tsx` becomes a `PANE_REGISTRY` of typed entries. Course Lookup, Prereq Tree, and Calendar register one entry each; the shell stays untouched when the next tool arrives.
- **Chat-first, agent-trigger precedence preserved.** Per REQ-19, Chat is always visible. Map data from an agent turn still owns the pane via the `preemptableByAgentMap` registry hook; user tools (Course Lookup, Prereq Tree, Calendar) are preemptable — when the agent emits map data mid-turn, the pane reverts to the map with a "Back to <tool>" pill.
- **Open-string-enum kinds.** `Citation.kind` and `CalendarEvent.kind` are `"course" | "program" | … | (string & {})` to allow per-deployment extension without a central enum edit — a known ceiling (no exhaustiveness check at compile time) and an explicit upgrade path (tighten to a closed union the day the variant set freezes).
- **sessionStorage = preemption ephemera; localStorage = prefs.** The sidebar's collapsed state persists in `localStorage`; the agent's transient pane preemption is sessionStorage-only and dies on tab close. Pane state itself is component-local (no URL round-tripping — F5 lands on chat full-width; pane re-open is one click from the sidebar Tools strip).

### Research Findings (Summary)

- **Donor `prereqAst.ts` (~1462 lines, zero imports)** — recursive-descent parser producing a typed `Expr` union with lowercase kinds (`'and'`, `'or'`, `'code'`, `'literal'`, `'flattened'`, `'soft'`); the `Or` node carries `ui: 'dropdown' | 'stacked'`; the `flattened` node carries `{ text: string; subExpr: Expr | null }`. Exports: `{ Expr, parsePrereq, displayExpr, isSatisfied, missingPrereqs }`. The donor does NOT export `walkCodeLeaves` or `MAX_DEPTH`; a sibling authored file (`src/shared/prereq-ast/walk.ts`) provides those two helpers for BFS use. Verbatim-portable parser, authored companion for walk helpers.
- **Donor course-code canonicalization** — a single regex over subject/number shapes with `_V` stripping and `_O` rejection. Splits cleanly into `src/shared/course-code.ts` (`CODE_RE`, `extractCourseCodes`, `canonicalize`).
- **Donor citation-marker parser** — a `/\[(\d+)\]/g` scan already verified against real UBCLLM responses. Reused unchanged in the chip renderer.
- **Donor `lib/calendar.ts` date math** — `parseISODate`, `toISODate`, `startOfMonth`, `addMonths`, `isSameDay`, `buildMonthGrid`, `itemCoversDate`, `formatMonthHeading`, `formatMonthBadge`, `formatFullDate`. Pure functions, no internal state. Copies verbatim into `src/shared/calendar/date-math.ts`; canonicalization (kind tagging, `source_url` propagation) is reimplemented against reogent's calendar data.
- **Reogent `calendar` module** (`src/server/modules/calendar.ts`) currently powers the `get_key_dates` agent tool. It returns `KeyDateDoc[]` (type at `src/server/modules/calendar.ts:4`); the tool wraps it as `{ dates: KeyDateDoc[] }`. This is the canonical calendar data surface; the port leaves it untouched. The widget REST route reads `KeyDateDoc[]` and projects inline to `CalendarEvent[]`; the tool stays returning `KeyDateDoc[]` (no reshape), so the citation extractor adapts the existing `KeyDateDoc` shape, which already carries `source_url` at `src/server/modules/calendar.ts:12`.
- **Reogent `chat-shell-context.tsx`** — uses `mapOpen: boolean` (toggle via `setMapOpen(open: boolean)`) plus a separate `highlight: MapHighlight | null` state (set via `setHighlight(h)`; `MapHighlight` is a union at `src/lib/walking.ts:43`), plus a `mobileMapOpen` bottom-sheet flag (auto-opens on highlight at `chat-shell-context.tsx:111-113`). Map reveal happens by setting both. The registry replace-point spans: `setHighlight` at 6 sites (`tool-renderers.tsx:167,196,226`; `chat-panel.tsx:249,280,440`), `mapOpen` read/write across `app-shell.tsx:83,194` (50%-width animation) and `map-panel.tsx:224-256`, and `mobileMapOpen` across `app-shell.tsx:83,111,139,144,155` and `map-panel.tsx:272-398`. Task 11.4 re-routes all of these.
- **Reogent `ChatResponse`** (server agent loop) — emits NDJSON events `thinking`/`text`/`text_clear`/`tool_start`/`tool_end`/`turn_start`/`done`/`error`. A `citations` event joins the stream after each `tool_end`; `done` carries the final array. The `messages.citations` Postgres column stores the array for history reloads.
- **Restructuring `GET_course` impact** — reogent's existing `get_course` tool returns the full Course Record with `prerequisite`, `corequisite`, `sections[]`, `terms[]`. It is reused verbatim as the Course Lookup data source; no tool reimplementation in scope.

Sources: donor `reoditetools/web/src/lib/prereqAst.ts`, `reoditetools/web/src/lib/calendar.ts`; reogent `src/server/modules/calendar.ts`, `src/components/chat/chat-shell-context.tsx`, `src/server/agent/*`, `src/shared/*`. Inline references throughout Components and Interfaces.

## Architecture

The port introduces four subsystems that thread through reogent's existing spine without restructuring it.

```mermaid
flowchart LR
  U[User input / sidebar / composer +] -->|intent| PaneHost
  A[Agent loop<br/>src/server/agent] -->|tool_start/tool_end NDJSON| CitationsAllocator
  A -->|result data| PaneHost
  A -->|prereq tree request| PrereqTool[get_prereq_tree tool]
  A -->|calendar request| CalendarTool[get_key_dates tool]
  CitationsAllocator -->|citations event| ChatStream[NDJSON stream]
  CitationsAllocator -->|used bit| DoneEvent
  DoneEvent -->|persist| Postgres[(messages.citations JSONB)]
  ChatStream --> ChatRenderer[Chat Message Renderer]
  ChatRenderer --> ChipsRenderer[Citation Chip Injector]
  ChatRenderer --> SourcesPanel[Sources Used vs Other]
  PaneHost --> PaneRegistry[PANE_REGISTRY]
  PaneRegistry -->|renders| CoursePane[Course Lookup]
  PaneRegistry -->|renders| PrereqPane[Prereq Tree]
  PaneRegistry -->|renders| CalendarPane[Calendar Widget]
  PaneRegistry -->|renders| MapPane[Map - existing]
  PrereqTool --> PrereqBFS[buildPrereqGraph]
  CalendarREST[GET /api/calendar] --> CalModule[calendar module - existing]
  CourseREST[GET /api/prereq-tree] --> PrereqBFS
  PrereqBFS --> PrereqParser[parsePrereq - verbatim]
  PrereqBFS --> CourseLookup[get_course tool / Meilisearch]
  CalModule --> KeyDateDoc[KeyDateDoc[] - unchanged]
  CalendarREST -.inlines projection.-> CalEvents[CalendarEvent[]]
  Sidebar[Sidebar] -.persists.-> LocalStorage[(localStorage sidebar_collapsed)]
  Sidebar -.reads.-> PackageVersion[package.json version]
```

### Subsystem boundaries

- **Course Lookup** lives entirely client-side. It calls two new HTTP routes (`app/api/courses/[code]/route.ts` for exact lookup and `app/api/courses/route.ts?q=...` for prefix/subject/level-operator search; both wrap reogent's existing `get_course` / `search_courses` agent-tool functions — today only the agent reaches these, no HTTP route exists) plus a thin ambiguous-input layer (`src/shared/course-code.ts` canonicalization + Meilisearch prefix/substring fallbacks, reused by the agent tool's `findByCode` at `src/server/modules/courses.ts:144-157` — that helper already canonicalizes inline and is left as-is). Renders as a `PaneEntry` member of `PANE_REGISTRY`.
- **Prerequisite Tree** parses client-side via the verbatim-copied parser (`src/shared/prereq-ast/`), but the transitive BFS lookup happens server-side behind two façades: the agent tool `get_prereq_tree` and the REST route `GET /api/prereq-tree?root=CPSC+320`. Server returns the full transitive closure; client toggles disjunction selections locally and never re-runs BFS for a known root.
- **Citations** allocates a `Citation[]` array per assistant response. Per-tool `CITATION_EXTRACTORS` adapt each tool's result shape into `CitationSeed[]`; the server stamps `used: true` from the `[N]` regex applied to the final assistant text. The array rides an NDJSON `citations` event after each `tool_end`, persists into `messages.citations` on `done`, and renders via a recursive chip injector plus a "Sources used / Other retrieved context" panel.
- **Calendar Widget** reads from `GET /api/calendar?from=&to=&kinds=`, a new unauthenticated REST route that reads `KeyDateDoc[]` from the existing `calendar` module and inlines a ~30-line projection to `CalendarEvent[]` (kind tagging, `source_url` propagation, `tags` sub-kind extraction). The agent's `get_key_dates` tool is NOT reshaped — it continues to return `{ dates: KeyDateDoc[] }` unchanged. The widget renders the month grid, prev/next/today nav, and upcoming-events list; data revalidation uses a SWR-style hook keyed on the cursor (small bounded cache: the route is a 30-line SQL/projection wrapper over data that updates at most weekly; a once-per-mount fetch with manual refetch on cursor change is enough, no global cache).

### Why the registry, not a union

The boolean `mapOpen` flag has three problems at six tools: (1) every new surface edits `chat-shell-context.tsx`; (2) pane state is impossible to round-trip to a URL because there is no id; (3) two-pane intent (user opens Course Lookup, then agent emits map data) needs explicit precedence rules that ad-hoc booleans can't express. A `PANE_REGISTRY: PaneEntry[]` fixes all three: pane id is the serialization key, the registry is the only edit-point for new surfaces, and `preemptableByAgentMap` makes the precedence rule explicit per entry.

## Components and Interfaces

### A. Pane Host — `src/components/shell/`

Replaces the boolean `mapOpen` flag with a registry-driven host. Files:

- `src/components/shell/pane-registry.ts` — the `PANE_REGISTRY` array and `PaneEntry` type.
- `src/components/shell/pane-host.tsx` — renders the active `PaneEntry.Component`, mounted from `activeChannel.id`. At `null` it collapses to a 3.75rem right-side rail showing the `<ToolsStrip />` icon column; at non-null it expands to 50% of the workspace with the pane's header + body. F5 / initial mount defaults to `null`; no URL state.
- `src/components/shell/pane-preempt.tsx` — the "Back to <tool>" pill shown when the agent emits map data over a user tool.

Edit sites in `chat-shell-context.tsx`:

- Replace `mapOpen: boolean` with `activeChannel: { id: PaneId; state: PaneState } | null` and `previousUserChannel: { id; state } | null` (sessionStorage-backed; survives F5 within the tab, dies on tab close — no cross-tab sync, no expiry sweep).
- Replace the existing `highlight: MapHighlight | null` state with `activeChannel.state` carrying a typed `MapHighlight` payload (`MapHighlight` union lives at `src/lib/walking.ts:43`; current `setHighlight` writer folds into `setActiveChannel("map", { highlight })`).
- `setMapOpen(open: boolean)` (current signature) becomes `setActiveChannel(id, state)`; the map case calls `setActiveChannel("map", { route, highlight })` and the registry's `preemptableByAgentMap["map"]` is `false` (map is never preemptable). Existing call sites in agent-tool result handlers that today call `setMapOpen(true)` and `setHighlight(payload)` are rewritten as a single `setActiveChannel("map", { highlight: payload })` call.
- On F5 / initial mount, `PaneHost` defaults to `null` — the right-side rail shows the `<ToolsStrip />` icons at 3.75rem and chat takes the remaining width (the existing `map-aside`'s collapsed state, repurposed as the discovery rail). No URL state is read or written. Deliberate change from today's `mapOpen: useState(true)` at `chat-shell-context.tsx:58` (map opens at 50% width on mount); the migration resets the default to the collapsed rail.

#### Interfaces

```ts
// src/components/shell/pane-registry.ts
export type PaneId = "map" | "course-lookup" | "prereq-tree" | "calendar" | (string & {});

export type PaneState = Record<string, string | number | boolean | null>;

export type PaneEntry<S extends PaneState = PaneState> = {
  id: PaneId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  Component: React.ComponentType<{ state: S; setState: (s: Partial<S>) => void }>;
  defaultState: S;
  preemptableByAgentMap: boolean;
};

export const PANE_REGISTRY: PaneEntry[];
export const PANE_BY_ID: Record<PaneId, PaneEntry>;
```

#### Discovery

REQ-19.5 defers entry-point placement to design. Three discovery surfaces, all reading from `PANE_REGISTRY`:

1. **PaneHost collapsed-rail Tools strip.** A vertical column of `PaneEntry.icon`-only neumorphic raised buttons inside the 3.75rem right-side rail (the same rail today's `map-aside` uses, repurposed). The rail IS the collapsed state of `PaneHost`: at `activeChannel === null` it shows the icon column and chat takes the remaining width; clicking an icon expands that pane to 50% via `setActiveChannel`. Tooltip = `PaneEntry.label`. On mobile (`<640px`, no rail), the same `<ToolsStrip />` component mounts in the sidebar drawer footer so discovery is consistent across breakpoints.
2. **Chat composer "+" menu.** An affordance next to the composer text input that opens a popover listing `PaneEntry.label` rows. Selecting the Prereq Tree row shows an inline code input before committing.
3. **Tool-renderer cards.** A `Course` tool result card renders a "Prereq Tree" affordance (REQ-4.2). Clicking sets `activeChannel = { id: "prereq-tree", state: { root: <code> }}` directly via `setActiveChannel` (no URL serialization layer).

#### Preemption contract

When the agent's tool loop emits map data (an existing `tool_end` carrying route/highlight/POI payloads), `setActiveChannel("map", payload)` runs. Before doing so the shell captures the current user channel into `previousUserChannel` (sessionStorage). The `pane-preempt` pill in the pane header reads `previousUserChannel` and offers a one-click restore. Map → user-tool preemption does not happen (`preemptableByAgentMap["map"] === false`).

### B. Course Lookup — `src/components/course-lookup/` + `src/shared/course-code.ts`

- `src/shared/course-code.ts` — `CODE_RE`, `canonicalize(input): CanonicalCode | SubjectPrefix | null`, `extractCourseCodes(text)` (used by both the parser and the citation course-code extractor), `isOkanagan(code)`.
- `src/components/course-lookup/course-detail-card.tsx` — REQ-2 renderer.
- `src/components/course-lookup/course-lookup-pane.tsx` — the `PaneEntry.Component`. Owns the lookup box, ambiguous-input handling, did-you-mean chips, and the Course Detail Card mount. The empty-state message (REQ-3.4) is a one-line string inline in this file — no separate `empty-state.tsx` component.
- `src/components/course-lookup/section-row.tsx` — REQ-2.4 section rendering (term, days, HH:MM 24h, instructor).

Server side uses reogent's existing courses module; new routes:

- `app/api/courses/[code]/route.ts` — exact lookup (new route; today only the agent `get_course` tool reaches the courses module, no HTTP route exists).
- `app/api/courses/route.ts?q=...&subject=...&level=...` — prefix + subject + level-operator search (Meilisearch).

### C. Prerequisite Tree — `src/shared/prereq-ast/` + `src/server/prereq/` + `src/components/prereq-tree/`

- `src/shared/prereq-ast/index.ts` — verbatim copy of donor `prereqAst.ts`. Public API (donor exports): `{ Expr, parsePrereq, displayExpr, isSatisfied, missingPrereqs }`. The donor has lowercase kind strings (`'and'`, `'or'`, `'code'`, `'literal'`, `'flattened'`, `'soft'`), `Or.ui: 'dropdown' | 'stacked'` (not `uiVariant`), and `Flattened.text`/`subExpr` (not `label`/`children`); all consuming code is written against the donor's actual shape.
- `src/shared/prereq-ast/walk.ts` — authored companion (not donated): `MAX_DEPTH = 15` and `walkCodeLeaves(expr: Expr | null): { parent: Expr | null; leaf: Extract<Expr, { kind: 'code' }> }[]` implemented as a structural recursion over the donor's lowercase-kind AST. Re-exported from `src/shared/prereq-ast/index.ts` alongside the donor API so callers import from one module.
- `src/shared/prereq-ast/prereq-ast.test.ts` — ported parser property tests (see Correctness Properties).
- `src/server/prereq/build-graph.ts` — `buildPrereqGraph(root: CanonicalCode, opts): Promise<PrereqGraph>` (server BFS, see below).
- `src/server/prereq/agent-tool.ts` — the `get_prereq_tree` agent tool façade. Registered by appending a `prereqModule` to the `modules` array in `src/server/modules/index.ts` (becomes module #13); its `tools` array is aggregated via the existing `modules.flatMap((m) => m.tools)` pipeline at `src/server/agent/stream.ts:27`. No "slot" numbering; the module list grows from 12 to 13 and the tool count from 20 to 21.
- `app/api/prereq-tree/route.ts` — the REST façade (`GET /api/prereq-tree?root=...`).
- `src/components/prereq-tree/prereq-tree-pane.tsx` — the `PaneEntry.Component`. Renders the React Flow canvas, root-input box, and empty/not-found/loading states (REQ-10).
- `src/components/prereq-tree/nodes/` — `CourseNode` (with `known`/`unknown`/`root`/`note` variants, REQ-9.4), `DropdownDisjunctionNode` (REQ-9.1), `StackedDisjunctionNode` (REQ-9.2), `DisjunctionDetailStrip` (REQ-9.3).
- `src/components/prereq-tree/edges/` — `OptionalEdge` (dashed bezier + the "optional" toggle pill, REQ-10.1/10.2), `HardEdge`.
- `src/components/prereq-tree/selection-key.ts` — `${ownerCourseCode}::${path}` encode/decode (REQ-8.1).

#### Server BFS — `buildPrereqGraph`

```ts
// src/server/prereq/build-graph.ts
export type PrereqNode = {
  id: string;
  kind: "course" | "coreq" | "dropdown" | "radio" | "literal" | "soft";
  code?: string;
  variant?: "root" | "known" | "unknown" | "note" | "coreq";
  label: string;
  children?: string[];
  selectionKey?: string;
  ui?: "dropdown" | "stacked";  // mirrors donor Or.ui
  optional?: boolean;
};

export type PrereqEdge = {
  id: string;
  source: string;
  target: string;
  optional?: boolean;
};

export type PrereqGraph = {
  rootCode: string;
  nodes: PrereqNode[];
  edges: PrereqEdge[];
  selectionKeys: string[];
  hasPrereqs: boolean;
  hasCoreqs: boolean;
  found: boolean;
};

export async function buildPrereqGraph(
  root: CanonicalCode,
  opts: { includeCoreqs?: boolean; depthCap?: number },
): Promise<PrereqGraph>;
```

Algorithm (REQ-7):

1. Look up the root Course Record via the `get_course` Meilisearch surface.
2. If no record — return `{ found: false, … }` (REQ-10.4).
3. If record has no `prerequisite` and no `corequisite` — return `{ found: true, hasPrereqs: false, hasCoreqs: false, … }` (REQ-10.3).
4. Parse the root's `prerequisite` via `parsePrereq` → root AST. Walk leaves with `walkCodeLeaves`; enqueue each into a BFS queue keyed by code.
5. If `includeCoreqs !== false` and `corequisite` is non-null, parse it separately; emit a `coreq` column between root and first prereq (REQ-7.3). Enqueue each coreq's prereq chain too, but **do not** recursively walk coreqs-of-coreqs (REQ-7.4).
6. On dequeue, if the code is in `visited` — skip (cycle-safe, REQ-7.1). Add to `visited`.
7. If `depth >= depthCap` (default `MAX_DEPTH = 15`) — skip parsing this node's prereqs (REQ-7.2).
8. Otherwise look up the code's Course Record, parse its `prerequisite`, and enqueue its `walkCodeLeaves`. Each leaf points at its parent's node id for edge construction.
9. Build the `selectionKey` per disjunction using the owner course's `path` traversal index — computed server-side and shipped with the graph so the client never re-derives it (REQ-8.1).
10. Edge `optional` flag is set when the parent AST node is a `Soft` wrapper (REQ-10.1).

Client CanonicalCode validation, root input box, and disjunction selection toggle are pure-client; selection state mirrors via `selectionKey` and lives in `activeChannel.state` (so URL round-trips it). Soft-toggle state mirrors in `activeChannel.state.softToggles[path]` keyed by the soft node's dotted traversal path (root = `''`), the same path convention as the Selection Key Map.

### D. Citations — `src/server/citations/` + `src/components/chat/citations/`

- `src/server/citations/extractors.ts` — `CITATION_EXTRACTORS: Record<ToolName, (result, input) => CitationSeed[]>`. One entry per existing tool that returns a url-bearing payload (course, pages, events, programs, calendar).
- `src/server/citations/allocator.ts` — `allocateCitations(seeds: CitationSeed[]): Citation[]` (assigns 1-indexed `index`, dedupes by `source_url`+`label`).
- `src/server/citations/stamp-used.ts` — `stampUsed(citations: Citation[], finalAssistantText: string): Citation[]` (applies `/\[(\d+)\]/g` and marks `used`).
- `src/components/chat/citations/chip-injector.ts` — recursive leaf-string walker that replaces in-range `[N]` with a `<CitationChip>` (REQ-13.1, REQ-13.4).
- `src/components/chat/citations/citation-chip.tsx` — the superscript chip. Anchored when `source_url` present (REQ-13.1); non-clickable `<span>` with `label` tooltip when absent (REQ-13.2); literal `[N]` when out of range (REQ-13.3).
- `src/components/chat/citations/sources-panel.tsx` — the "Sources used" / "Other retrieved context" split (REQ-14).

Server integration — append to the existing agent loop in `src/server/agent/`:

- On `tool_end`, run the matching `CITATION_EXTRACTORS[toolName]` against the result; accumulate seeds into a per-turn `pendingCitations` buffer.
- Emit a `citations` NDJSON event (new event type) carrying the current `Citation[]` after each `tool_end`. The array grows over the turn; clients render chips as the array fills.
- On `done`, run `stampUsed` against the accumulated assistant text; emit a final `citations` event with the stamped array.
- Persist the final array into `messages.citations` (new JSONB column; see Data Models).

Client integration — extend the NDJSON event consumer — the `chatStream` function (the `ChatApi.chat` impl) in `src/lib/api.ts:94` (the `callbacks?` parameter at lines 97-104 already accepts `onDelta`/`onToolStart`/`onToolEnd`/`onTurnStart`/`onTextClear`/`onThinking`; a new `onCitations` callback is added alongside `onDelta` at line 158):

- New `citations` event handler that stores the array on the in-flight `ChatResponse` and re-renders.
- The `ChatMessageRenderer` (used both live and on history reload) consumes `message.citations`; the chip injector runs as a recursive React component over the markdown AST.

#### System-prompt contract (REQ-15)

Extend the `SYSTEM_PROMPT` template const in `src/server/agent/loop.ts` (lines 3-24; the existing `systemPrompt(now)` builder at lines 27-39 prepends the date — the citation paragraph is appended to `SYSTEM_PROMPT` itself so it travels through every provider):

- A stable paragraph describing the `[N]` convention, included in all three providers (Anthropic, OpenAI, Google) — the contract lives in the text, not the provider message type (REQ-15.4).
- The prompt is generated with the current turn's `citations` array appended so the model knows each entry's `index` and `label`.

### E. Sidebar — inline into `src/components/shell/session-sidebar.tsx`

No `src/components/shell/sidebar/` subdirectory. The existing `src/components/shell/session-sidebar.tsx` already owns the layout and consumes `useChatShell()`; the port inlines both additions there:

- `useSidebarCollapsed()` hook — backed by `localStorage["reogent.sidebar.collapsed"] = "0" | "1"`, defined in-file.
- `<VersionBadge />` — reads `package.json` `version` via `next.config`-injected `process.env.__REOGENT_VERSION__` (set at build time) and renders text-[0.625rem] mono in the footer bottom-left.

The hook hydrates synchronously before first paint via a `useSyncExternalStore` read of `localStorage` to satisfy REQ-11.1/11.2's "re-render on first paint" requirement. SSR returns the default expanded state to avoid a hydration mismatch flash; the client effect reconciles within a microtask.

### F. Calendar — date-math + REST route + `src/components/calendar/`

The agent's `get_key_dates` tool stays unchanged (returns `{ dates: KeyDateDoc[] }`); the citation extractor for `get_key_dates` adapts the `KeyDateDoc[]` shape (already carries `source_url` at `src/server/modules/calendar.ts:12`). No tool reshape; no `src/server/calendar/list-events.ts` file — the canonicalization is a ~30-line projection inlined inside the REST route handler, the single consumer.

- `src/shared/calendar/date-math.ts` — selectively ports the donor's 10 pure date helpers (drops `loadCalendar` which is Vite-only, drops `CalendarItem`/`CalendarPayload`/`CalendarCategory` corpus types incompatible with `CalendarEvent`, drops `itemCoversDate` whose `endDate` branch is dead under `CalendarEvent`'s single-day shape — the calendar-pane render inlines `isSameDay(parseISODate(event.date), d)` instead).
- `app/api/calendar/route.ts` — `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&kinds=academic,holiday` (unauthenticated). The route reads `KeyDateDoc[]` from the existing `calendar` module and inlines a ~30-line projection to `CalendarEvent[]` (kind tagging, `source_url` propagation, `tags` sub-kind extraction). `Cache-Control: public, max-age=300`.
- `src/components/calendar/calendar-pane.tsx` — the `PaneEntry.Component`. Renders month grid, prev/next/today nav, popover/tooltip, mobile stacking, upcoming-events list.
- `src/components/calendar/use-calendar-events.ts` — SWR-style `useCalendarEvents(cursor)` hook keyed on `[cursor, kinds]`. Revalidates on focus; falls back to last-good on network error.

### G. Registry composition

`PANE_REGISTRY` final composition, in order:

1. `map` (existing, `preemptableByAgentMap: false`, default state maps to existing map behavior).
2. `course-lookup` (`defaultState: { code: "" }`).
3. `prereq-tree` (`defaultState: { root: "", selections: {} }`).
4. `calendar` (`defaultState: { cursor: <this-month>, kinds: ["academic","holiday"] }`).

## Data Models

### Course Lookup

```ts
// src/shared/course-code.ts
export type CanonicalCode = { kind: "code"; subject: string; number: string; raw: string };
export type SubjectPrefix = { kind: "subject"; subject: string; raw: string };
export type Rejected = { kind: "rejected"; reason: "okanagan"; raw: string };

export const CODE_RE = /\b([A-Za-z]{2,4})\s*([0-9]{3}[A-Za-z]?)\b/g;
export function canonicalize(input: string): CanonicalCode | SubjectPrefix | Rejected | null;
export function extractCourseCodes(text: string): CanonicalCode[];
export function isOkanagan(raw: string): boolean;

// reuses the existing Course Record from src/server/modules/courses
```

### Prerequisite AST (verbatim donor API)

```ts
// src/shared/prereq-ast/index.ts — verbatim donor types, re-exports walk helpers
export type Expr =
  | { kind: 'and'; children: Expr[] }
  | { kind: 'or'; ui: 'dropdown' | 'stacked'; children: Expr[] }
  | { kind: 'code'; code: string }
  | { kind: 'literal'; text: string }
  | { kind: 'flattened'; text: string; subExpr: Expr | null }
  | { kind: 'soft'; child: Expr };

export function parsePrereq(raw: string | null | undefined): Expr | null;
export function displayExpr(expr: Expr | null): string;
export function isSatisfied(expr: Expr | null, completed: Set<string>): boolean;
export function missingPrereqs(expr: Expr | null, completed: Set<string>): string[];

// authored companion — src/shared/prereq-ast/walk.ts
export const MAX_DEPTH = 15;
export function walkCodeLeaves(
  expr: Expr | null,
): { parent: Expr | null; leaf: Extract<Expr, { kind: 'code' }> }[];
```

`PrereqGraph` server response shape is defined in §C.

### Citations

```ts
// src/shared/citations/citation.ts
export type CitationKind = "course" | "program" | "event" | "calendar" | "page" | "generic" | (string & {});

export type Citation = {
  index: number; // 1-indexed
  label: string;
  kind: CitationKind;
  used: boolean;
  source_url?: string; // omitted when absent (REQ-12.3)
  tool: string; // originating tool name
  // optional provenance payload for the Sources panel tooltip
  detail?: { subject?: string; number?: string; date?: string };
};

// src/server/citations/extractors.ts
export type CitationSeed = Omit<Citation, "index" | "used">;
export type CitationExtractor = (result: unknown, input: unknown) => CitationSeed[];
export const CITATION_EXTRACTORS: Record<string, CitationExtractor>;
```

#### Schema migration

The single `SCHEMA` const in `src/server/db/migrate.ts:3` (small flat block of `CREATE TABLE IF NOT EXISTS` statements, no migration files, no down-paths — `migrate()` runs it idempotently at boot) gains a `citations JSONB` column inside the `messages` block:

```sql
-- inside the existing SCHEMA template literal; only this column is new
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  interstitial JSONB,
  citations JSONB,  -- new
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
```

Because the table is created with `IF NOT EXISTS` on a fresh Postgres instance, this is the only edit needed — existing dev databases are dropped and recreated by `docker-compose down -v && up`. There is no additive migration tool to wire.

- Existing rows in already-migrated dev databases: `citations` is null; the client treats `null` and `[]` identically (renders no chips) — backward compatible.
- New assistant rows: `citations` is the stamped array (may be `[]`).
- User rows: `citations` stays null.

`appendExchange` (in `src/server/sessions/store.ts:35`) is extended to accept the citations array on the assistant half.

### Calendar

```ts
// src/shared/calendar/event.ts
export type CalendarEventKind = "academic" | "holiday" | (string & {});

export type CalendarEvent = {
  id: string; // stable hash of date+label+source_url
  date: string; // YYYY-MM-DD
  label: string;
  kind: CalendarEventKind;
  tags: string[]; // sub-kinds ("reading-week", "exam", "fee-deadline", ...)
  source_url?: string;
};

// app/api/calendar/route.ts inlines a ~30-line projection from KeyDateDoc[] to CalendarEvent[];
// no separate src/server/calendar/list-events.ts file (single consumer = REST route).
```

### Pane state

```ts
// source-of-truth: React component state on the chat shell context
// sessionStorage["reogent.pane.previousUserChannel"] — agent-preempt restore target
// localStorage["reogent.sidebar.collapsed"] — "0" | "1"

type CourseLookupState = { code: string; focusResults: boolean };
type PrereqTreeState = { root: string; selections: Record<string, number> };
type CalendarState = { cursor: string /* YYYY-MM */; kinds: CalendarEventKind[] };
```

## Correctness Properties

A property is a characteristic that should hold across all valid executions — a formal statement bridge between the spec and machine-verifiable correctness. The prework pass in `requirements.md` §Acceptance Criteria Testing Prework (Summary) classifies each REQ's test mix; the properties below formalize the Property and Property+example rows.

### Domain 1 — Course Lookup and Canonicalization (REQ-1, REQ-3)

For all inputs matching `CODE_RE` (with optional `_V`, multi-space, mixed case):

1. **Round-trip with subject subset.** For all `s` where `canonicalize(s)` returns `{ kind: 'code' }`, the returned `CanonicalCode.raw` field equals `subject.toUpperCase().replace(/_V$/, '') + ' ' + number.toUpperCase()` — the `_V` strip applies to the subject (where it appears), not the number. (REQ-1.1, REQ-1.2)
2. **Okanagan rejection invariant.** For all `s` containing a `_O` course code, `canonicalize(s)` does NOT emit `{ kind: 'code' }` for that code. (REQ-1.3)
3. **Subject-prefix shape.** For all `s` of bare subject form (`/^[A-Za-z]{2,5}$/`), `canonicalize(s)` returns `{ kind: 'subject' }`. (REQ-1.4)
4. **Idempotence.** For all `s`, `canonicalize(canonicalize(s)?.raw ?? s)` equals `canonicalize(s)`. (REQ-1.1)
   **Generator:** `arbCourseCode: fc.tuple(fc.string({ minLength: 2, maxLength: 4 }).filter(re => /^[A-Za-z]+$/.test(re)), fc.integer({ min: 100, max: 9999 }).map(String))` composed with optional `_V` + inter-space injection; run with 100 ops.
37. **Level-operator relation.** For all `s` of the shape `<subject> <op><digit>` where `<digit>` ∈ `1..5` and `<op>` ∈ `=|+|-`, `searchCourses(s)` returns exactly the courses whose canonical `number`'s leading digit `d` satisfies the operator's relation: `=` → `d == digit`; `+` → `d >= digit`; `-` → `d <= digit`. (REQ-3.3)
   **Generator:** `arbLevelQuery: fc.tuple(fc.string({ minLength: 2, maxLength: 4 }).filter(re => /^[A-Za-z]+$/.test(re)).map(s => s.toUpperCase()), fc.constantFrom('=', '+', '-'), fc.integer({ min: 1, max: 5 }).map(String))`; assert every returned row's `Number(String(number).charAt(0))` — the first digit of the integer `number` — satisfies the relation against the supplied `digit`.

### Domain 2 — Prerequisite Parser Null-Safety (REQ-5)

5. **No-throw.** For all strings `s` (including random bytes, unbalanced parens, embedded nulls, and the chunker placeholder `none`), `parsePrereq(s)` does not throw and returns either `null` or an `Expr`. (REQ-5.1, REQ-5.2, REQ-5.3)
   **Generator:** `arbPrereqString: fc.oneof(fc.string({ minLength: 0, maxLength: 2000 }), fc.constantFrom('MATH 100', 'one of MATH 100, MATH 102', 'CPSC 110 is recommended', 'KIN_V 320', 'none.', 'NoNE.', 'NONE', 'None.  ', '(())))', '\x00\x00CPSC 110', ''))`; 1000 ops.

6. **Okanagan stripping.** For all `s` containing only `_O` course codes plus optional structural keywords, `walkCodeLeaves(parsePrereq(s))` yields no `_O` codes. (REQ-5.4)
7. **Soft-tail split only at top level.** For all `s` containing a `recommended` clause inside unbalanced parentheses, `parsePrereq(s)` does NOT produce a top-level `Soft` wrapper around that clause. (REQ-5.6)
38. **Soft-tail positive split (top-level clear cases).** For all `s` that END with a top-level `recommended` tail shaped as `X is recommended` / `X strongly recommended` / `X are recommended` (where `X` is a code-bearing expression), `parsePrereq(s)` produces a `Soft`-rooted AST at that tail (the `recommended` clause becomes `kind: 'soft'` at the top level, not a bare literal). (REQ-5.5)
   **Generator:** `arbRecommendedTail: fc.tuple(arbCodeExpr, fc.constantFrom('is recommended', 'is strongly recommended', 'are recommended')).map(([e, t]) => `${displayExpr(e)} ${t}`)` composed with a prefix string from `arbPrereqString`; assert root kind is `'soft'`.

### Domain 3 — Pretty-Printer and Round-Trip (REQ-6)

8. **Non-empty label.** For all `Expr e`, `displayExpr(e)` is non-empty. (REQ-6.1, REQ-6.5)
9. **Round-trip code set.** For all `Expr e` produced by `parsePrereq`, the set of `Code` leaves in `parsePrereq(displayExpr(e))` equals the set of `Code` leaves in `e`. (REQ-6.6 — the canonical parser property)
10. **Soft-flattening.** For all `Soft(child)`, `displayExpr(Soft(child)) === displayExpr(child)`. (REQ-6.4)
39. **Code node canonical form output.** For all `Expr e` and every `Code` leaf `c` in `e`, the substring of `displayExpr(e)` corresponding to `c` matches the canonical form defined in Property 1: subject uppercase, single space, no `_V` suffix, no trailing whitespace. (REQ-6.2)
40. **And/Or separator presence.** For all `Expr e` of kind `And` (resp. `Or`), `displayExpr(e)` contains `' + '` (resp. `' / '`) between every adjacent pair of children's labels. Equivalently, the separator round-trips the AST shape, matching the donor's `.join(' + ')` / `.join(' / ')` at `prereqAst.ts:1368,1370`. (REQ-6.3)
   **Oracle:** `displayExpr(andNode) === andNode.children.map(displayExpr).join(' + ')` for `And`; `' / '` for `Or`. Or-`ui: 'stacked'` is skipped (donor's `.join(' / ')` is ui-invariant at `prereqAst.ts:1370`), so the single `dropdown` `Or` branch covers both.
   **Generator:** `arbExpr: fc.letrec(t => ({ node: fc.oneof(t('code'), t('literal'), fc.array(t('node'), { minLength: 2 }).map(children => ({ kind: 'and', children })), fc.array(t('node'), { minLength: 2 }).map(children => ({ kind: 'or', ui: 'dropdown', children })), t('node').map(child => ({ kind: 'soft', child }))) }))` derived from `arbCode` + `arbLiteral`.

### Domain 4 — BFS Expansion (REQ-7)

11. **Cycle-safety invariant.** For all root codes and any course data set, the BFS produces a `PrereqGraph` whose `nodes` array contains each code at most once. (REQ-7.1)
12. **Depth cap.** For all root codes, no node in the graph has depth (root-to-node BFS distance) greater than `depthCap`. (REQ-7.2)
13. **No coreq-of-coreq edges.** For all root codes with a non-empty `corequisite`, no node with `kind: 'coreq'` has an outgoing edge to another node with `kind: 'coreq'`. (REQ-7.4)
14. **Coreq column graph-side invariant.** For all root codes with `hasCoreqs === true`, every `kind: 'coreq'` node has BFS depth exactly `1`. (REQ-7.3 — pure graph invariant; the column-between-root-and-first-prereq-column *rendering* adjacency is an example test in tasks.md 6.7, not a property.)
   **Generator:** `arbCourseDataset: fc.array(fc.record({ code: arbCourseCode, prereq: arbPrereqString, coreq: arbPrereqString }), { minLength: 1, maxLength: 40 })` (cycle- and depth-chain-injectable by construction).

### Domain 5 — Selection Stability (REQ-8, REQ-10)

15. **Sibling isolation.** For any Selection Key Map `M`, toggling disjunction at path `p` produces `M'` such that `M'` differs from `M` only at key `${owner}::${p}`. (REQ-8.3)
16. **Root-switch survival.** For any `M` and root switch, every key in `M` remains in `M'` with the same value. (REQ-8.4)
17. **Default index 0.** For any disjunction path absent from `M`, the initial rendered selection is child index 0. (REQ-8.2)
36. **Soft-toggle effect on top-level `Soft` blocks.** For any `PrereqGraph` whose root is `Soft(child)` at path `p` (root = path `''`, per the §C `softToggles[path]` mirror) and any soft-toggle store `M` with `M[p] ∈ {0, 1}`, the child subtree's outgoing edges are present in the rendered graph iff `M[p] === 1` (toggle enabled). The toggle controls edge visibility, not label text (since `displayExpr(Soft(child)) === displayExpr(child)` by Property 10, the label is invariant under toggle). (REQ-10.2)
   **Generator:** `arbSoftSelection: fc.record({ tree: arbExpr.filter(e => e.kind === 'soft' && 'child' in e), path: fc.constant('') })` — `path` is the root soft node's dotted traversal index (`''`), matching the §C `softToggles` keying, so the toggle state key and the AST location always agree; render the same `(tree, path)` at both `M[p] = 0` and `M[p] = 1`, and assert the child-subtree edge count differs between the two renders (present when enabled, hidden when disabled).

### Domain 6 — Citations Schema (REQ-12)

18. **Index-1 continuity.** For all `Citation[]` produced by `allocateCitations`, `index` values form exactly the sequence `1..length` with no gaps or duplicates. (REQ-12.1, REQ-12.2)
19. **Source-url honesty.** For all `Citation c`, if `c.source_url` is undefined or empty it is omitted (not `""`). (REQ-12.3)
20. **Used-only-after-stamp.** For all responses, no `Citation` has `used: true` until `stampUsed` has run on `done`; the live `citations` events carry `used: false` for all entries. (REQ-12.2 — `used` is done-time only)
21. **History rehydration byte-equality.** For all persisted assistant `messages`, `JSON.stringify(messages.citations)` (the JS value the renderer receives from history reload) byte-equals `JSON.stringify(JSON.parse(rawRow.citations))` (the value re-stringified from the persisted JSONB column). Both produce Citation arrays whose elements satisfy the Citation schema and omit `source_url` identically when absent. (REQ-12.5)
   **Generator:** `arbPersistedMessage: fc.oneof(fc.constant(null), fc.array(arbCitation, { maxLength: 8 }).map(stampIndices)).map(a => ({ rawJson: a === null ? 'null' : JSON.stringify(a), parsed: a }))` — both fields driven from a single draw of the JSONB-expressible space (array or `null`); `parsed` is the `loadHistory` read-path result and `rawJson` the raw JSONB cell. **Oracle:** assert `JSON.stringify(JSON.parse(rawJson)) === JSON.stringify(parsed)` exactly (no `?? []` normalization; `'null' === 'null'` for the null branch) AND, when `parsed` is an array, every element passes the Citation schema (Zod parse) and `source_url` is absent exactly when it was absent in the draw. The oracle runs the actual `loadHistory`/`deserialize` path from `src/server/db/messages.ts`, not a fresh JSON.parse.
41. **Citations array shape.** For all `messages`: if `citations` is `null` or `undefined`, the renderer emits no chips and no panel (the design's `null`-conditioning path from the schema-migration + error-handling sections). If `citations` is a non-array type, the renderer falls back to `[]`. If `citations` is a `Citation[]` (including `[]`), every element satisfies the Citation schema and Property 18 holds when non-empty. (REQ-12.4)
   **Generator:** `arbCitationArray: fc.oneof(fc.constant(null), fc.constant(undefined), fc.array(arbCitation, { maxLength: 8 }).map(stampIndices), fc.constant(42), fc.constant("not-an-array"))` — the array branch routes through the shared `stampIndices` so it satisfies Property 18 by construction. **Oracle:** assert the renderer's chip array equals `[]` when citations is null/undefined/non-array, equals the input array otherwise, AND every element of the array branch passes the Citation schema (Zod parse), so the "satisfies the Citation schema" claim is machine-checked rather than assumed.

### Domain 7 — Citation Chip Rendering (REQ-13)

22. **Out-of-range literal invariant.** For all assistant text and `citations.length = N`, any marker `[k]` with `k < 1` or `k > N` renders as the literal string `[k]` (no chip, no link). (REQ-13.3)
   **Oracle:** for every `[k]` token in the generated text with `k < 1` or `k > citations.length`, the rendered DOM contains the literal text `[k]` and zero chip elements whose `data-index` equals `k`.
23. **Recursive-leaf injection.** (23a) For each leaf of every markdown element of the kinds listed in REQ-13.4, all in-range `[N]` markers within that leaf's text become chips with the matching `data-index`. (23b) The injector's transformation is invariant under markdown re-rendering: render the same AST, capture the `[data-index]` sequence, re-render, and assert the sequence is identical. (REQ-13.4)
   **Oracle (23a):** assert every leaf of kinds `paragraph`, `list-item`, `strong`, `em`, `table-cell`, `heading`, `blockquote`, `link` containing an in-range `[k]` marker yields a chip element with `data-index === String(k)` in the leaf's DOM subtree. **Oracle (23b):** `querySelectorAll('[data-index]')` over two renders of the same AST yields equal sequences of indices.
24. **No empty-href anchor + label tooltip.** For all rendered chips, if `source_url` is absent the rendered DOM contains no `<a>` element for that chip AND the chip exposes the citation's `label` as tooltip (via `title` or `aria-label`). (REQ-13.2)
   **Oracle:** for each chip whose citation lacks `source_url`, assert no `<a>` ancestor exists and the chip element's `title` or `aria-label` equals the citation's `label`.
   **Generator:** `arbChipContext: fc.array(arbCitation, { maxLength: 8 }).map(stampIndices).chain(citations => fc.record({ text: arbTextWithMarkers(citations.length), citations: fc.constant(citations) }))` — the citations array is stamped first, then the text's `[N]` markers are drawn from the bound `arbMarkerToken(citations.length)` so the in-range/out-of-range split is deterministically sampled; 100 ops per property.

### Domain 8 — Calendar Rendering (REQ-16, REQ-17, REQ-18)

25. **Empty-month correctness.** For all month cursors with zero `CalendarEvent`s, the month grid renders with no markers, no error state, and no missing-data notice. (REQ-16.5)
   **Oracle:** `container.querySelectorAll('[data-event-marker]').length === 0`, no `[data-error]` element, and no text matching `/no events|missing data/i`.
26. **Kind-driven style distinctness.** For any two events `e1, e2` on the same day with `e1.kind !== e2.kind`, the cell DOM exposes two marker elements with differing `data-kind` attributes AND `getComputedStyle(marker1)` differs from `getComputedStyle(marker2)` in at least one of `background-color`, `border-color`, or `color`. (REQ-16.2)
   **Oracle:** locate the paired day's cell, query `[data-kind]` markers, assert the attribute values differ and the computed-style triple differs in at least one property (load the calendar stylesheet into the test harness so `getComputedStyle` returns non-empty values).
27. **Multi-event count.** For all days with `k > 1` events, the cell surface indicates `k`. (REQ-16.4)
   **Oracle:** `cell.querySelector('[data-count]').textContent === String(k)`.
27b. **Popover enumeration.** For all days with `k > 1` events, the expanded popover lists exactly `k` rows, each with the event's `label` and a `source_url` anchor when present. (REQ-16.4 — the second half of the requirement)
   **Oracle:** `popover.querySelectorAll('[data-event-row]').length === k`; each row's `[data-event-label]` text equals the corresponding event's `label` and, when `source_url` is present, `row.querySelector('a[href]').href === event.source_url`.
28. **Today-independence.** For all months containing today, today's cell receives a `today` style independent of any event markers on the same cell. (REQ-17.4)
   **Oracle:** pin `now` to `fc.const('2026-08-01')`; render two draws at the same cursor — one with an event on today's date and one without — and assert today's cell carries the `today` class/style in both.
29. **Horizon-disable.** For all cursors more than `futureHorizonMonths` (default 24) ahead of today, the next-month affordance is inert. (REQ-17.5)
   **Oracle:** pin `now` to `fc.const('2026-08-01')`; assert the next-month button is enabled at exactly `cursor === now + 24 months` and inert at `now + 25`; for `cursor > now + 24` it is inert.
   **Generator:** `arbCalendarMonth: fc.record({ cursor: arbYYYYMM, events: fc.array(arbCalendarEvent, { maxLength: 30 }).map(distributeAcrossDaysAndKinds) })`. Per-property construction: Property 25 → `events.length === 0`; Property 26 → `.filter(m => Object.values(groupBy(m.events, e => e.date)).some(es => es.length >= 2 && new Set(es.map(e => e.kind)).size >= 2))` so a paired-kind day is guaranteed, not probabilistic; Property 27/27b → `.filter(m => Object.values(groupBy(m.events, e => e.date)).some(es => es.length > 1))`; Property 28/29 → pin `now` as above and build the cursor relative to it.

### Domain 9 — Visual Pane Contract (REQ-19)

30. **Chat-never-hidden.** For all combinations of `activeChannel`, the Chat panel remains visible. (REQ-19.1, REQ-19.2)
   **Oracle:** per `(activeChannel.id, activeChannel.state)` draw, `document.querySelector('[data-pane="chat"]').getBoundingClientRect()` has non-zero width AND height, is not fully enclosed by the active pane's rect, and `getComputedStyle(chat).visibility !== 'hidden'` (REQ-19.1) and the chat element is not replaced by the tool surface (REQ-19.2).
31. **Map-precedence-non-preemption.** For all `activeChannel.id === <user tool>` and any agent-emitted map data, the pane switches to `map` and the previous user channel is recoverable via the "Back to" pill. (REQ-19.3)
   **Generator:** `arbPaneState: fc.record({ id: fc.constantFrom("map", "course-lookup", "prereq-tree", "calendar", "unknown"), state: arbPerPaneState })` — full set for Property 30; Property 31 constrains to user tools via `arbPaneState.filter(s => ['course-lookup', 'prereq-tree', 'calendar'].includes(s.id))` so only preemptable user tools sample the agent-emit path (drop `"map"` — non-preemptable — and `"unknown"` — error-handling fallback). Pair with `arbAgentMapEmit: fc.record({ route: fc.string(), highlight: arbMapHighlight })` and assert the priority transition + sessionStorage-restore.
32. **Tool-grounded answer priority.** For any agent turn emitting tool-grounded claim text `c` while pane `p` is open, the rendered DOM satisfies: (1) `within(document.querySelector('[data-pane="chat"]')).getByText(new RegExp(escapeRegex(c)))` resolves within the chat ancestor (scoped to avoid collisions when `c` also appears in pane `p`'s header); (2) the chat container's `getBoundingClientRect()` has non-zero width AND height; (3) the chat rect does not overlap or sit behind pane `p`'s rect. (REQ-19.4 — calendar-deadline case stays in tasks 22.2–22.4 as integration example.)
   **Oracle:** assert each invariant separately, and additionally assert the resolved element's nearest `[data-pane]` ancestor is the chat pane.
   **Generator:** `arbToolGroundedTurnWithOpenPane: fc.record({ turn: arbToolGroundedTurnText, pane: arbPaneId })`; assert all three DOM invariants hold per `(turn, pane)` pair.

### Domain 10 — UX/Accessibility (REQ-20)

33. **Reduced-motion invariant.** For all `prefers-reduced-motion: reduce` matched environments, every registered transition collapses to a computed duration ≤ 0.01ms. (REQ-20.2)
34. **Focus-ring invariant.** For all ported interactive controls, keyboard focus applies `ring-primary/40 ring-2` (with ring-offset) and is visible at rest. (REQ-20.3)
35. **Live-region announcement.** For all status changes on ported features, an `sr-only` live region text is updated within one animation frame. (REQ-20.4)
   **Generator:** `arbReducedMotionEnv: fc.constant({ prefersReducedMotion: true })`; `arbPortedControl: fc.constantFrom("chip", "dropdown", "radio", "day-cell", "nav-arrow", "plus-menu")`; `arbStatusAction: fc.constantFrom("citation-panel-expand", "calendar-month-change", "prereq-selection-flip", "chip-click")`. Each of Properties 33–35 runs 50 ops (component-test cost).

### Property framework

- **Library**: `fast-check` for generators (`arbCourseCode`, `arbPrereqString`, `arbExpr`, `arbCourseDataset`, `arbCalendarMonth`, `arbCitationArray`, `arbLevelQuery`, `arbRecommendedTail`, `arbSoftSelection`, `arbChipContext`, `arbPersistedMessage`, `arbPaneState`, `arbAgentMapEmit`, `arbToolGroundedTurnWithOpenPane`, `arbReducedMotionEnv`, `arbPortedControl`, `arbStatusAction`; shared sub-generators: `arbCode`, `arbLiteral`, `arbCodeExpr`, `arbCitation`, `arbTextWithMarkers`, `arbYYYYMM`, `arbCalendarEvent`, `arbPerPaneState`, `arbMapHighlight`, `arbToolGroundedTurnText`, `arbPaneId`); Vitest for runner. `fast-check@^4.9.0` is already a devDependency in reogent's `package.json`.
- **Generators**: listed per-property inline above each generator's domain (`**Generator:** …`). Derived from `CODE_RE` (valid subject shapes), the `prereqAst` parser grammar (well-formed + adversarial mixes), and the JSON schema discriminators (`Citation`, `CalendarEvent`). Shared sub-generators and helpers referenced across domains (defined here; not repeated inline):
  - `const join = (sep = '') => (arr: string[]) => arr.join(sep)` — array-to-string helper used in `.map(join(' '))` (and `.map(join(''))` for empty-separator joins). Curried so `.map(join)` MUST be `.map(join(''))` to yield a string; never pass `join` directly as a `.map` callback.
  - `const stampIndices = (arr: Omit<Citation, 'index'>[]) => arr.map((c, i) => ({ ...c, index: i + 1 }))` — assigns 1-indexed `index` to a citation array so it satisfies Property 18 (no gaps, no duplicates). Shared by `arbCitationArray`, `arbChipContext`, and `arbPersistedMessage`.
  - `arbSubject = fc.string({ minLength: 2, maxLength: 4 }).filter(s => /^[A-Za-z]+$/.test(s)).map(s => s.toUpperCase())`.
  - `arbNumber = fc.integer({ min: 100, max: 5999 }).map(String)`.
  - `arbCode = fc.record({ kind: fc.constant('code'), code: fc.tuple(arbSubject, arbNumber).map(([s, n]) => s + ' ' + n) })` — a single code leaf.
  - `arbLiteral = fc.record({ kind: fc.constant('literal'), text: fc.string({ minLength: 1, maxLength: 20 }) })`.
  - `arbCodeExpr = fc.oneof(arbCode, fc.record({ kind: fc.constant('and'), children: fc.array(arbCode, { minLength: 2 }) }))` — code-bearing expressions for tail suffixes (Property 38).
  - `arbCitation = fc.record({ label: fc.string({ minLength: 1, maxLength: 40 }), kind: fc.constantFrom('course', 'program', 'event', 'calendar', 'page', 'generic'), source_url: fc.option(fc.webUrl()), used: fc.boolean(), tool: fc.constantFrom('get_course', 'search_courses', 'get_key_dates', 'get_pages', 'get_events', 'get_programs') })` — full Citation schema minus `index`; `index` is assigned by the shared `stampIndices` helper so any consumed array satisfies Property 18. `arbCitationArray` and `arbChipContext` both route their arrays through `stampIndices`.
  - `arbMarkerToken = (maxIndex: number) => fc.integer({ min: 0, max: maxIndex + 3 }).map(n => '[' + n + ']')` — draws `[0..maxIndex+3]` so both in-range (`1..maxIndex`) and out-of-range (`0`, `maxIndex+1..maxIndex+3`) markers are sampled deterministically.
  - `arbMarkdownLeaf = fc.oneof(...['paragraph', 'list-item', 'strong', 'em', 'table-cell', 'heading', 'blockquote', 'link'].map(k => fc.record({ kind: fc.constant(k), text: fc.string({ minLength: 0, maxLength: 40 }) })))`.
  - `arbTextWithMarkers = (maxIndex: number) => fc.array(fc.oneof(arbMarkdownLeaf, arbMarkerToken(maxIndex)), { minLength: 1, maxLength: 30 }).map(join(''))`.
  - `arbYYYYMM = fc.stringMatching(/^\d{4}-(0[1-9]|1[0-2])$/)`.
  - `arbCalendarEvent = fc.record({ date: arbYYYYMM.map(m => m + '-01'), label: fc.string({ minLength: 1, maxLength: 40 }), kind: fc.constantFrom('academic', 'holiday'), tags: fc.array(fc.string({ maxLength: 20 })) })`.
  - `distributeAcrossDaysAndKinds = (rec) => ({ ...rec, events: rec.events.map((e, i) => ({ ...e, date: rec.cursor + '-' + String((i % 28) + 1).padStart(2, '0') })) })` — spreads events across days within the cursor month; per-property construction in the Property 25–29 generator block (Property 26 filters for a guaranteed paired-kind day, Property 27/27b for a count > 1 day) guarantees the required day exists rather than leaving it probabilistic.
  - `arbPerPaneState = fc.record({})` — each pane's state is validated separately in the pane's own property tests.
  - `arbMapHighlight = fc.record({ route: fc.string() })` — minimal shape per `MapHighlight` union at `src/lib/walking.ts:43`; full union fields asserted in the walking-route property tests.
  - `arbToolGroundedTurnText = fc.array(fc.oneof(arbCode, arbCalendarEvent.map(e => e.label), fc.string({ minLength: 1, maxLength: 20 })), { minLength: 1, maxLength: 10 }).map(join(' '))`.
  - `arbPaneId = fc.constantFrom('map', 'course-lookup', 'prereq-tree', 'calendar')` — Property 30 uses the full set; Property 31 filters inline via `arbPaneState.filter(s => ['course-lookup', 'prereq-tree', 'calendar'].includes(s.id))` so only preemptable user tools sample the agent-emit path.
- **Run count**: 100 runs per property in CI; 1000 for the parser no-throw property (Property 5, cheap + high-value). `arbCourseDataset`-driven properties (11–14) run at 30 ops since each op re-runs a full BFS, not just a parser call.
- **Shrinking**: fast-check's built-in shrink on string generators; expected to surface parser edge cases compactly.

### Non-property test mix (per prework table)

- REQ-2: Render snapshots + edge case for null-field omission.
- REQ-3: Property for level-operator relation + example for did-you-mean 8-chip cap.
- REQ-9: Example + layout invariant ("menu inherits zoom") via React Flow canvas test.
- REQ-11: Smoke for localStorage persistence + render snapshot for badge.
- REQ-14: Example + integration for two-list/scroll-into-view.
- REQ-15: Per-provider smoke (Anthropic/OpenAI/Google) verifying the contract paragraph is in all three system prompts.
- REQ-17: Example + edge case for horizon-disable.
- REQ-18: Responsive snapshot at 375px and 1024px.
- REQ-19: Integration smoke for agent-trigger precedence and "Back to" pill.

## UI / UX per component

The visual layer for the new ported components. Implement exactly as written. All classes follow DESIGN.md's Whisper-Neumorphic system; tokens map to Tailwind v4 utilities via `@theme inline` at `app/globals.css:139` (`bg-surface`, `text-primary`, `border-border-subtle`, etc.). The `motion` library (already imported at `src/components/shell/session-sidebar.tsx:13`) drives springs; CSS `--neu-ease` (`cubic-bezier(0.16, 1, 0.3, 1)`) drives micro-interactions. The `.neu-*` classes are defined at `app/globals.css:365-440`.

**Data-attribute contract.** The property-suite oracles query these attributes; do not rename without updating every oracle that names them: `data-pane` (every pane surface root, including `data-pane="chat"` on the chat panel), `data-tool-id` (Tools strip buttons), `data-preempt-restore` (Back-to pill), `data-action` + `data-code` (Prereq Tree affordance), `data-did-you-mean` (suggestion chips container), `data-index` (citation chips), `data-citation-row` + `data-used` (Sources panel rows), `data-sources-panel`, `data-day` + `data-today` + `data-count` + `data-event-marker` + `data-kind` (calendar day cells), `data-event-row` + `data-event-label` (popover rows), `data-edge-variant` (React Flow optional edges), `data-node-id` + `data-variant` (React Flow nodes).

### Shell — `app-shell.tsx`, `pane-host.tsx`, `tools-strip.tsx`

PaneHost replaces the existing `motion.aside` at `app-shell.tsx:193-200` (the `map-aside` element animating `width: mapOpen ? "50%" : "3.75rem"`). The new shell:

```tsx
// app-shell.tsx — replaces the existing motion.aside map-aside
<PaneHost /> // renders the rail (collapsed) or the active pane (expanded)
```

```tsx
// src/components/shell/pane-host.tsx
const active = useChatShell().activeChannel; // { id, state } | null

return (
  <>
    {/* Desktop / tablet rail + pane: hidden on mobile, MapBottomSheet handles map there */}
    <motion.aside
      animate={{ width: active ? "50%" : "3.75rem" }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      className="pane-host hidden min-h-0 min-w-0 overflow-hidden sm:flex"
      data-pane-host
    >
      {!active && <ToolsStrip orientation="rail" />}
      {active && <ActivePane entry={PANE_BY_ID[active.id]} state={active.state} />}
    </motion.aside>

    {/* Mobile: user-tool panes render as bottom sheets (map already does via MapBottomSheet) */}
    {active && active.id !== "map" && (
      <PaneBottomSheet entry={PANE_BY_ID[active.id]} state={active.state} />
    )}
  </>
);
```

`ActivePane` mounts the entry's `Component` inside a frame with a consistent header:

```tsx
<section data-pane={entry.id} className="neu-panel w-full h-full flex flex-col overflow-hidden rounded-2xl">
  {entry.id !== "map" && (
    <header className="flex items-center gap-2 px-4 py-3 shrink-0">
      <span className="bg-surface-container-low text-primary size-7 rounded-lg grid place-items-center shrink-0">
        <entry.icon className="size-4" />
      </span>
      <h2 className="text-base font-medium tracking-[-0.01em]">{entry.label}</h2>
      <div className="ml-auto" /> {/* right-slot: Back-to pill mounts here when preempted */}
    </header>
  )}
  <div className="flex-1 overflow-auto min-h-0">
    <entry.Component state={state} setState={...} />
  </div>
</section>
```

The map pane (`entry.id === "map"`) skips the header — `MapPanel` already owns its own chrome and renders directly. The `pane-host.tsx` edit must preserve the existing `mobileMapOpen` bottom-sheet behavior for map; only the user-tool panes get the new bottom-sheet path.

Mobile bottom sheet for user-tool panes (`<640px`):

```tsx
// PaneBottomSheet — mirrors MapBottomSheet's structure
<motion.div
  initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
  drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.2}
  onDragEnd={(_, info) => info.offset.y > window.innerHeight * 0.2 && close()}
  data-pane={entry.id}
  className="neu-panel fixed inset-x-0 bottom-0 h-[80vh] rounded-t-2xl z-50 flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
>
  <div className="bg-outline/40 h-1.5 w-10 rounded-full mx-auto mt-2 shrink-0 cursor-grab touch-none" />
  <header className="flex items-center gap-2 px-4 py-3 shrink-0">
    <span className="bg-surface-container-low text-primary size-7 rounded-lg grid place-items-center"><entry.icon className="size-4" /></span>
    <h2 className="text-base font-medium tracking-[-0.01em]">{entry.label}</h2>
    <button onClick={close} aria-label={`Close ${entry.label}`} className="neu-button bg-surface size-9 rounded-xl ml-auto grid place-items-center"><Icon name="close" size={18} /></button>
  </header>
  <div className="flex-1 overflow-auto min-h-0"><entry.Component state={state} setState={...} /></div>
</motion.div>
```

Esc dismisses; drag past 20% dismisses (matches `MapBottomSheet`).

#### `ToolsStrip` — `src/components/shell/tools-strip.tsx`

```tsx
export function ToolsStrip({ orientation }: { orientation: "rail" | "drawer" }) {
  const { activeChannel, setActiveChannel } = useChatShell();
  return (
    <nav
      aria-label="Tools"
      data-tools-strip
      className={
        orientation === "rail"
          ? "w-[3.75rem] flex flex-col items-center gap-1.5 py-3 px-0.5"
          : "lg:hidden grid grid-cols-3 gap-1.5 pt-2 mt-2 border-t border-border-subtle/60 px-2 pb-2"
      }
    >
      {PANE_REGISTRY.map((entry) => {
        const active = activeChannel?.id === entry.id;
        return (
          <button
            key={entry.id}
            data-tool-id={entry.id}
            type="button"
            aria-label={entry.label}
            aria-pressed={active}
            title={entry.label}
            onClick={() => setActiveChannel(entry.id, entry.defaultState)}
            className={
              "neu-raised bg-surface size-9 min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-on-surface-variant hover:text-primary focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1 active:[box-shadow:var(--neu-inset-shadow)] transition-colors " +
              (active ? "bg-accent-subtle text-primary" : "")
            }
          >
            <entry.icon className="size-4" />
          </button>
        );
      })}
    </nav>
  );
}
```

Rail orientation = vertical column at 3.75rem. Drawer orientation = `grid grid-cols-3` in the mobile sidebar drawer footer. Active state uses `bg-accent-subtle text-primary` (the existing active-nav treatment) — primary indigo reserved for interactive/active per the Indigo-Scarcity rule.

#### Back-to pill — `src/components/shell/pane-preempt.tsx`

```tsx
{previousUserChannel && (
  <button
    data-preempt-restore
    type="button"
    aria-label={`Back to ${previousUserChannel.label}`}
    title={`Back to ${previousUserChannel.label}`}
    onClick={() => { setActiveChannel(previousUserChannel.id, previousUserChannel.state); setPreviousUserChannel(null); }}
    className="inline-flex items-center gap-1.5 min-h-[36px] min-w-[44px] px-3 rounded-full border border-primary text-primary text-xs font-medium hover:bg-accent-subtle focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-95 transition-colors"
  >
    <Icon name="left" size={14} />
    Back to {previousUserChannel.label}
  </button>
)}
```

Renders in the right-slot of the `map` pane header (the map pane mounts its own header inside `MapPanel`; the pill slots in next to the existing close affordance). Mounted only when `previousUserChannel !== null`. 200ms CSS opacity crossfade coordinated with the spring settle; reduced-motion instant.

### A. Course Lookup — `course-detail-card.tsx`, `course-lookup-pane.tsx`, `section-row.tsx`

#### Pane body

```tsx
// PaneEntry.Component = CourseLookupPane
<div className="flex flex-col gap-3 p-3 h-full">
  <LookupForm />
  {didYouMean && <DidYouMean candidates={didYouMean} onPick={(code) => setCode(code)} />}
  {status === "loading" && <Skeleton className="h-48" />}
  {record && <CourseDetailCard record={record} />}
  {error && <p role="alert" className="text-sm text-error bg-error-container/30 border border-error/30 rounded-lg px-3 py-2">{code} could not be reached. <button className="text-primary underline">Retry</button></p>}
  {!code && !record && !error && <p className="text-sm text-muted">Type a course code to see its details.</p>}
</div>
```

#### Lookup form

```tsx
<form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="flex gap-2">
  <input
    type="text"
    value={code}
    onChange={(e) => setCode(e.target.value)}
    placeholder="CPSC 110"
    aria-label="Course code"
    aria-invalid={rejected ? "true" : undefined}
    aria-errormessage={rejected ? "code-error" : undefined}
    className="neu-inset bg-surface-container-low text-on-surface h-11 rounded-lg px-3 text-sm w-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error/30"
  />
  <button type="submit" className="neu-primary-button bg-primary text-on-primary rounded-xl min-h-[44px] min-w-[44px] px-4 text-sm font-medium" disabled={code.trim() === ""}>Look up</button>
</form>
{rejected && (
  <p id="code-error" role="alert" className="text-xs text-error bg-error-container/30 border border-error/30 rounded-lg px-3 py-2">Okanagan campus codes aren't in this catalog. Try a Vancouver course.</p>
)}
```

Mono placeholder (`CPSC 110`) signals the structured-identifier affordance. 44px touch target on the submit.

#### Did-you-mean chips (up to 8, `bg-surface-container` 1px border)

```tsx
<div data-did-you-mean className="flex flex-wrap gap-1.5">
  {candidates.slice(0, 8).map((c) => (
    <button
      key={`${c.subject}-${c.number}`}
      type="button"
      onClick={() => { setCode(`${c.subject} ${c.number}`); lookup(`${c.subject} ${c.number}`); }}
      className="border border-primary text-primary rounded-full text-xs px-4 py-2.5 min-h-[36px] min-w-[44px] font-medium hover:bg-accent-subtle focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 transition-colors"
    >
      <span className="font-mono">{c.subject} {c.number}</span>
    </button>
  ))}
</div>
```

8-chip cap is an example test (REQ-3.5); the slice is the universal hard ceiling.

#### Course Detail Card

```tsx
<article className="bg-surface-container-low rounded-lg p-3 flex flex-col gap-2.5">
  <header className="flex items-baseline gap-1.5 flex-wrap">
    <h3 className="text-base font-medium leading-tight font-mono">{record.code}</h3>
    {record.credits != null && <span className="bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5 text-xs">{record.credits} cr</span>}
    {record.prerequisite && (
      <button
        data-action="open-prereq-tree"
        data-code={record.code}
        type="button"
        onClick={() => setActiveChannel("prereq-tree", { root: record.code, selections: {} })}
        className="inline-flex items-center gap-1 border border-primary text-primary text-xs font-medium rounded-full px-3 py-1.5 min-h-[44px] hover:bg-accent-subtle focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 transition-colors"
      >
        <Icon name="tree" size={14} /> Prereq Tree
      </button>
    )}
  </header>
  <p className="text-sm font-medium">{record.title}</p>
  {record.description && <p className="text-sm text-on-surface-variant leading-relaxed">{record.description}</p>}
  <dl className="flex flex-col gap-1.5">
    {record.prerequisite && <FieldRow label="Prerequisite" value={record.prerequisite} mono />}
    {record.corequisite && <FieldRow label="Corequisite" value={record.corequisite} mono />}
    {record.terms?.length > 0 && <FieldRow label="Offered" value={record.terms.join(", ")} />}
  </dl>
  {record.sections?.length > 0 && <SectionTable sections={record.sections} />}
  {total > 200 && <p className="text-xs text-muted">Showing first 200 of {total}.</p>}
</article>
```

`FieldRow`:

```tsx
function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted uppercase tracking-[0.05em] font-medium">{label}</dt>
      <dd className={mono ? "text-sm font-mono" : "text-sm"}>{value}</dd>
    </div>
  );
}
```

Null-or-empty fields are omitted, never rendered as placeholders (REQ-2.2).

#### Section table (REQ-2.4)

```tsx
<table className="text-sm w-full">
  <caption className="sr-only">Sections for {record.code}</caption>
  <thead className="sr-only"><tr><th>Term</th><th>Days</th><th>Time</th><th>Instructor</th></tr></thead>
  <tbody>
    {sections.map((s) => (
      <tr key={s.id} className="border-t border-border-subtle/60">
        <td className="py-2 pr-3 text-on-surface-variant">{s.term}</td>
        <td className="py-2 pr-3 font-mono text-on-surface-variant">{s.days}</td>
        <td className="py-2 pr-3 font-mono text-on-surface-variant">{s.start}-{s.end}</td>
        <td className="py-2 text-on-surface-variant">{s.instructor}</td>
      </tr>
    ))}
  </tbody>
</table>
```

Times in 24h mono per the Mono-for-Data rule.

### B. Prereq Tree — `prereq-tree-pane.tsx`, `nodes/`, `edges/`

#### Pane body

```tsx
<div className="flex flex-col gap-3 p-3 h-full">
  <RootCodeInput />
  {status === "loading" && (
    <p className="text-xs text-muted inline-flex items-center gap-1.5" aria-live="polite">
      <span className="size-3 border-2 border-muted border-t-transparent rounded-full animate-spin" /> Building tree…
    </p>
  )}
  {error && <NotFoundAlert code={root} />}
  {graph && !graph.found && <NotFoundAlert code={root} />}
  {graph && graph.found && !graph.hasPrereqs && !graph.hasCoreqs && (
    <p className="text-sm text-muted">{root} has no prerequisites or corequisites listed in the calendar.</p>
  )}
  {graph && graph.found && (graph.hasPrereqs || graph.hasCoreqs) && (
    <ErrorBoundary fallback={<AccordionFallback graph={graph} />}>
      <div data-prereq-canvas className="flex-1 min-h-0 relative">
        <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} nodesFocusable elementsSelectable attributionEnabled={false} proOptions={{ hideAttribution: true }}>
          {/* no Miniimap, no Controls */}
        </ReactFlow>
        <DisjunctionDetailStrip graph={graph} selections={selections} />
      </div>
    </ErrorBoundary>
  )}
</div>
```

#### Root code input

```tsx
<form onSubmit={(e) => { e.preventDefault(); rebuild(canonicalize(code)); }} className="flex gap-2">
  <input aria-label="Root course code" placeholder="CPSC 320" value={code} onChange={(e) => setCode(e.target.value)}
    className="neu-inset bg-surface-container-low text-on-surface h-11 rounded-lg px-3 text-sm w-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error/30" />
  <button type="submit" className="neu-primary-button bg-primary text-on-primary rounded-xl min-h-[44px] min-w-[44px] px-4 text-sm font-medium" disabled={code.trim() === ""}>Build</button>
</form>
```

`NotFoundAlert` (REQ-10.4):

```tsx
<p role="alert" className="text-sm text-error bg-error-container/30 border border-error/30 rounded-lg px-3 py-2">
  {code} isn't in the catalog. Try <button className="text-primary underline" onClick={() => setCode("CPSC 110")}>CPSC 110</button> or <button className="text-primary underline" onClick={() => setCode("MATH 200")}>MATH 200</button>.
</p>
```

#### React Flow CSS (append to `app/globals.css`, scoped to `[data-pane="prereq-tree"]` so canvas styles don't leak):

```css
[data-pane="prereq-tree"] .react-flow__attribution { display: none; }
[data-pane="prereq-tree"] .react-flow__node { font: inherit; border: none; box-shadow: none; background: transparent; }
[data-pane="prereq-tree"] .react-flow__edge-path { stroke: var(--border); stroke-width: 1.25; }
[data-pane="prereq-tree"] .react-flow__edge[data-edge-variant="optional"] .react-flow__edge-path {
  stroke: var(--outline-variant); stroke-dasharray: 4 3;
}
[data-theme="dark"] [data-pane="prereq-tree"] .react-flow__edge-path { stroke: var(--border); }
```

Dark-theme canvas dark-variant styling pigments per DESIGN.md tokens at integration time (Open Question 3).

#### Node components

`CourseNode` variants (REQ-9.4):

```tsx
<section data-node-id={node.id} data-variant={node.variant}
  className="neu-raised rounded-lg px-3 py-2 min-w-[120px] text-center " + variant classes
>
  {{ variant: "root" }   && "bg-primary-container text-on-primary-container"}
  {{ variant: "known" }  && "bg-surface text-on-surface"}
  {{ variant: "unknown" }&& "bg-error-container text-on-error-container"}
  {{ variant: "note" }   && "bg-surface-container-low text-muted"}
  {{ variant: "coreq" }  && "bg-secondary-container text-on-secondary-container"}
  <div className="font-mono text-sm font-medium">{node.code}</div>
  {node.variant === "unknown" && <div className="text-[0.625rem] text-on-error-container" title="Not in UBC Vancouver catalog">not in catalog</div>}
</section>
```

Root node carries a `ROOT` label above the code. Unknown nodes get a `title="Not in UBC Vancouver catalog"` tooltip.

`DropdownDisjunctionNode` (REQ-9.1): a listbox at the node footer showing the current selection; click opens the options list of `displayExpr(child)` labels. `StackedDisjunctionNode` (REQ-9.2): a radio group stacked vertically. Both write `selections[selectionKey] = index` into pane state. Default index 0 when path absent (Property 17).

`DisjunctionDetailStrip` (REQ-9.3): a horizontal scrollable strip below the canvas:

```tsx
<div data-disjunction-strip className="flex gap-2 overflow-x-auto pt-2 border-t border-border-subtle/60 text-xs text-muted">
  {disjunctions.map((d) => (
    <span key={d.selectionKey} className="whitespace-nowrap">
      <span className="font-mono text-on-surface-variant">{d.path}</span>: <span className="text-on-surface">{displayExpr(d.options[selections[d.selectionKey] ?? 0])}</span>
    </span>
  ))}
</div>
```

#### Optional edge + soft-toggle pill (REQ-10.1, REQ-10.2)

`OptionalEdge` carries `data-edge-variant="optional"` and a `SoftToggle` child button centered along the path:

```tsx
<button
  data-toggle="soft-toggle"
  data-path={path}
  aria-pressed={softToggles[path] === 1}
  aria-label={softToggles[path] === 1 ? "Hide optional subtree" : "Show optional subtree"}
  type="button"
  onClick={() => setSoftToggles({ ...softToggles, [path]: softToggles[path] === 1 ? 0 : 1 })}
  className="neu-raised bg-surface size-7 rounded-full grid place-items-center hover:bg-accent-subtle focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1 transition-colors"
>
  <Icon name={softToggles[path] === 1 ? "minimize" : "add"} size={14} />
</button>
```

Property 36 uses `path = ''` (root soft node), so the pill sits between root and the first child column. State persists in `activeChannel.state.softToggles[path]`.

#### Accordion fallback (React Flow crash)

`AccordionFallback` renders the graph as nested `<details>` of `displayExpr` labels, mirroring `.assistant-markdown` list styling. No canvas; keyboard-tabbable summaries.

### C. Citations — `citation-chip.tsx`, `chip-injector.ts`, `sources-panel.tsx`

#### Citation chip (three render variants)

The `chip-injector` walks markdown-leaf strings of kinds `paragraph, list-item, strong, em, table-cell, heading, blockquote, link`, splits on `/\[(\d+)\]/`, and delegates each in-range marker to `<CitationChip>`; out-of-range markers pass through as literal text (no element).

In-range + `source_url` present (REQ-13.1):

```tsx
<a data-index={c.index} href={c.source_url} target="_blank" rel="noopener noreferrer"
  title={c.label}
  className="inline-flex items-center align-super font-mono text-[0.625em] leading-none rounded-full px-1.5 py-0.5 bg-primary-container/60 text-on-primary-container hover:bg-primary-container focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1 transition-colors ml-0.5">
  [{c.index}]
</a>
```

In-range, `source_url` absent (REQ-13.2):

```tsx
<span data-index={c.index} title={c.label} aria-label={c.label}
  className="inline-flex items-center align-super font-mono text-[0.625em] leading-none rounded-full px-1.5 py-0.5 bg-surface-container text-on-surface-variant cursor-help ml-0.5">
  [{c.index}]
</span>
```

Out-of-range (REQ-13.3): render the literal `[k]` text node — no chip, no `<sup>`, no element. The injector returns `"[k]"` as a plain string fragment.

`align-super` + `text-[0.625em]` is the superscript treatment. Chips are inline within the markdown leaf, not block.

`chip-injector.ts` is a pure function: `(markdownRoot, citations) => React.ReactNode`. It memoizes per-text-segment so a `citations` event arrival only re-injects the diffing leaves (per Performance Considerations).

#### Sources panel (REQ-14)

Mounts as the last child of the assistant message container (see task 17.11 wiring). Collapsed by default; expands on click. `scrollIntoView({ block: "nearest", behavior: "smooth" })` on first expand; reduced-motion instant.

```tsx
<aside data-sources-panel className="mt-2">
  <details>
    <summary className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer min-h-[44px] list-none select-none rounded-lg hover:bg-surface-container/60 [&::-webkit-details-marker]:hidden">
      <Icon name="down" size={14} className="transition-transform open:rotate-180" />
      {usedCount > 0 ? `Sources used (${usedCount})` : `Other retrieved context (${unusedCount})`}
    </summary>
    <div className="flex flex-col gap-1.5 max-h-64 overflow-auto px-3 pb-3 pt-1">
      {usedList.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {usedList.map((c) => <SourceRow key={c.index} c={c} />)}
        </ul>
      )}
      {unusedList.length > 0 && (
        <>
          {usedList.length > 0 && <div className="text-xs text-muted uppercase tracking-[0.05em] font-medium pt-1">Other retrieved context</div>}
          <ul className="flex flex-col gap-1.5">
            {unusedList.map((c) => <SourceRow key={c.index} c={c} />)}
          </ul>
        </>
      )}
    </div>
  </details>
</aside>
```

`SourceRow`:

```tsx
<li data-citation-row={c.index} data-used={c.used ? "true" : "false"} className="text-xs flex items-start gap-1.5 min-w-0">
  <span className="font-mono text-muted shrink-0">{c.index}.</span>
  <div className="flex flex-col min-w-0">
    <span className={c.used ? "text-on-surface" : "text-on-surface-variant opacity-60"}>{c.label}</span>
    {c.source_url && (
      <a href={c.source_url} target="_blank" rel="noopener noreferrer" title="Open source"
        className="text-primary underline hover:text-primary/80 inline-flex items-center min-h-[36px] min-w-[44px] text-xs">Source</a>
    )}
  </div>
</li>
```

Two-list split lives in REQ-14.1/14.2; "M retrieved (no Sources used)" is the summary header when used-list empty and other-list non-empty (REQ-14.5). Opacity 60 on unused rows (readable, ≥4.5:1 on `bg-surface-container-low`).

### D. Calendar — `calendar-pane.tsx`, `use-calendar-events.ts`

#### New color tokens (append to `app/globals.css` `:root` + dark block + `@theme inline` map)

Calendar event kinds map to the existing `secondary` (verdant, academic) and `tertiary` (bark, holiday) families — no new palette, just semantic aliases:

```css
/* :root and [data-theme="dark"] both */
--event-academic: var(--secondary);
--on-event-academic: var(--on-secondary);
--event-academic-container: var(--secondary-container);
--event-holiday: var(--tertiary);
--on-event-holiday: var(--on-tertiary-container);
--event-holiday-container: var(--tertiary-container);
```

```css
/* @theme inline — add alongside the existing color-surface/primary map */
--color-event-academic: var(--event-academic);
--color-on-event-academic: var(--on-event-academic);
--color-event-academic-container: var(--event-academic-container);
--color-event-holiday: var(--event-holiday);
--color-on-event-holiday: var(--on-event-holiday);
--color-event-holiday-container: var(--event-holiday-container);
```

Utilities available: `bg-event-academic`, `bg-event-academic-container`, `text-event-academic`, `bg-event-holiday`, `bg-event-holiday-container`, `text-event-holiday`. Two distinct `data-kind` styles per Property 26 (verdant vs bark differ in all three of background/border/color, so `getComputedStyle` reads non-empty distinct values once the calendar stylesheet is loaded into the test harness).

#### Pane body

```tsx
<div className="flex flex-col gap-3 p-3 h-full">
  <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3 flex-1 min-h-0">
    <MonthGrid />
    <UpcomingEvents />
  </div>
</div>
```

#### Month grid

```tsx
<div data-month-grid className="flex flex-col gap-1 min-h-0">
  <div className="grid grid-cols-7 gap-1 mb-1">
    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
      <div key={d} className="text-xs text-muted text-center font-medium">{d}</div>
    ))}
  </div>
  <div className="grid grid-cols-7 gap-1 flex-1 min-h-0">
    {cells.map((cell) => (
      <DayCell key={cell.isoDate} cell={cell} onMultiClick={(d) => setPopover(d)} />
    ))}
  </div>
</div>
```

`DayCell`:

```tsx
<button
  data-day={cell.isoDate}
  data-today={cell.isToday ? "true" : undefined}
  data-count={cell.events.length > 1 ? cell.events.length : undefined}
  aria-label={ariaDayLabel(cell)}
  onClick={cell.events.length > 1 ? () => onMultiClick(cell) : undefined}
  className={
    "neu-inset bg-surface-container-low rounded-lg min-h-[64px] min-w-[44px] p-1.5 flex flex-col gap-1 text-left focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1 " +
    (cell.isOutOfMonth ? "opacity-40 " : "") +
    (cell.isToday ? "ring-2 ring-primary/40 " : "")
  }
>
  <span className="text-xs text-muted font-mono">{cell.dayNum}</span>
  {cell.events.length > 1 && (
    <span data-count className="bg-accent-subtle text-primary text-[0.625rem] rounded-full size-4 grid place-items-center self-end" title={`${cell.events.length} events`}>{cell.events.length}</span>
  )}
  {cell.events.slice(0, 3).map((e) => (
    <span key={e.id} data-event-marker data-kind={e.kind}
      className={
        "rounded-full h-1.5 w-full block " +
        (e.kind === "academic" ? "bg-event-academic-container" : "bg-event-holiday-container")
      }
    />
  ))}
</button>
```

`data-count` is the cell-surface count signal (Property 27). `data-event-marker` markers carry `data-kind` (Property 26). Today's cell: `ring-2 ring-primary/40` independent of markers (Property 28).

#### Multi-event popover (Property 27b)

Positioned absolute under the cell; Esc closes; Esc handled at the pane level via `onKeyDown`.

```tsx
<div data-popover role="dialog" aria-label={`Events on ${formatFullDate(isoDate)}`}
  className="glass-neu rounded-2xl p-3 w-64 max-h-80 overflow-auto absolute z-30 shadow-[var(--elevation-lg)]">
  <span className="text-xs text-muted uppercase tracking-[0.05em] font-medium mb-2 block">{formatFullDate(isoDate)}</span>
  <ul className="flex flex-col gap-1.5">
    {events.map((e) => (
      <li key={e.id} data-event-row className="flex flex-col gap-0.5 min-w-0">
        <span data-event-label className="text-sm text-on-surface truncate">{e.label}</span>
        <span className="text-xs text-muted">{e.kind}</span>
        {e.source_url && (
          <a href={e.source_url} target="_blank" rel="noopener noreferrer" title="Open source"
            className="text-primary text-xs underline inline-flex items-center gap-1 min-h-[36px] min-w-[44px]">Open source</a>
        )}
      </li>
    ))}
  </ul>
  <button type="button" onClick={close} className="self-end text-xs text-on-surface-variant hover:text-primary mt-1">Close</button>
</div>
```

`[data-event-row]` count + `[data-event-label]` text + `a[href]` source link oracle (Property 27b).

#### Upcoming-events list (REQ-18, N=10)

```tsx
<div data-upcoming className="flex flex-col gap-1.5">
  {upcoming.slice(0, 10).map((e) => (
    <div key={e.id} className="bg-surface-container-low rounded-lg px-3 py-2 flex gap-2 min-w-0">
      <span className={"size-2 rounded-full mt-1 shrink-0 " + (e.kind === "academic" ? "bg-event-academic" : "bg-event-holiday")} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm text-on-surface truncate">{e.label}</span>
        <span className="text-xs text-muted font-mono">{formatFullDate(e.date)}</span>
      </div>
    </div>
  ))}
  {upcoming.length === 0 && <p className="text-xs text-muted">No upcoming events this month.</p>}
</div>
```

#### Nav header + states

Prev / Today / Next buttons in the pane header right-slot (see PaneHost frame; calendar adds these via the right-slot). Next disabled at `cursor === now + 24 months` (inclusive boundary; Property 29).

Loading: skeleton grid `bg-surface-container animate-pulse rounded-lg` × 42 cells. Stale-data badge:

```tsx
<span className="text-[0.625rem] text-muted bg-surface-container px-1.5 py-0.5 rounded-full" title="Showing last-known data">last-known</span>
```

Empty month: grid renders normally, no markers, no error, no notice (Property 25). Network error: SWR keeps last-good; the badge renders next to the heading.

### E. Sidebar — `session-sidebar.tsx`

The sidebar keeps its existing session-list role (no Tools strip here — that moved to the PaneHost rail). Two inlined additions remain as specified in design.md §E: `useSidebarCollapsed()` (localStorage-backed) and `<VersionBadge />`:

```tsx
<span className="font-mono text-[0.625rem] text-muted px-2 py-1" aria-hidden="true">v{version}</span>
```

Placed in the sidebar's bottom-left, above the existing collapse affordance. On mobile (`<1024px`), the sidebar is a drawer; the drawer footer hosts `<ToolsStrip orientation="drawer" />` (per the shell section above) so the mobile Tools discovery surface is the drawer.

### Reduced motion + a11y (all ported components)

- `prefers-reduced-motion: reduce` collapses all spring transitions to `{ duration: 0 }` (existing `useReducedMotion()` pattern), CSS transitions to 0.01ms, and reveals to final state on first paint (Property 33).
- Every interactive control carries `focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:ring-offset-1` (per DESIGN.md a11y patterns; Property 34 audits the ring).
- 44px minimum touch targets via `min-h-[44px] min-w-[44px]` on visually smaller controls (suggestion pills, popover source links).
- `sr-only` live region updates on: citation panel expand, calendar month change, prereq selection flip, chip click (Property 35).
- All icons are `aria-hidden` (decorative) when paired with a text label; the existing `<Icon label="...">` API sets `role="img"` when a label is supplied.

## Error Handling

| Feature | Failure mode | Handling |
|---|---|---|
| Course Lookup | Exact lookup miss | Fall back to prefix scan; if zero, surface "Did you mean" chips (up to 8). (REQ-3.4, REQ-3.5) |
| Course Lookup | Subject returns >200 | Cap at 200 + footer "Showing first 200 of N" notice. (REQ-3.2) |
| Course Lookup | Network/server error | Inline "<code> could not be reached; retry" affordance in the card; preserves user input. |
| Prereq Tree | Root not found | Not-found state with CPSC 110 / MATH 200 prompt. (REQ-10.4) |
| Prereq Tree | Root has no prereqs and no coreqs | Single-message empty state. (REQ-10.3) |
| Prereq Tree | Prereq string is null/empty/`none.` | `parsePrereq` returns null — graph has root only; same empty-state path. (REQ-5.1, REQ-5.2) |
| Prereq Tree | Parser hits unknown tokens | Collapses into `Literal` node; tree continues. (REQ-5.3) Field is never dropped silently at the UI level. |
| Prereq Tree | BFS crosses depth cap | Stops enqueuing; rendered graph shows a "depth-capped" badge on the bottom row. |
| Prereq Tree | Cycle in prereq chain | First-seen-wins; no duplicate node ever emitted. (REQ-7.1) |
| Prereq Tree | React Flow canvas crash | Error boundary in `prereq-tree-pane.tsx` — falls back to nested accordion of `displayExpr` labels (preempt-recovery). |
| Citations | Tool result has no `source_url` | `source_url` field omitted from the Citation; chip renders as non-clickable span. (REQ-13.2) |
| Citations | Out-of-range `[N]` | Renders as literal `[N]` text. (REQ-13.3) |
| Citations | Empty citations array | Chip injector skips; Sources panel does not render at all. (REQ-12.4) |
| Citations | History reload with `citations: null` | Treated as `[]`; no chips; no panel. (Backward compat) |
| Calendar | Month has zero events | Renders empty grid with no error state. (REQ-16.5) |
| Calendar | Network error on fetch | SWR keeps last-good cache; renders stale-data badge "showing last-known"; silent revalidation on focus. |
| Calendar | Cursor beyond horizon | Next-month button disabled. (REQ-17.5) |
| Sidebar | localStorage unavailable | Falls back to sessionStorage; if both unavailable, defaults to expanded and logs a single console warning. |
| Visual Pane | Invalid `?tool=` query param | PaneHost renders chat full-width (no pane); an sr-only live region announces "Unknown tool id, pane closed." |
| Visual Pane | Agent emits map data while user tool is open | Preempts to map; preserves user channel; "Back to" pill offered. (REQ-19.3) |

All network failures render inline — no global error toast; the chat surface remains stable.

## Testing Strategy

### Framework

- **Vitest** for unit, property, integration, and example tests, colocated as `*.test.ts` next to the code under test.
- **fast-check** for property-based tests (Domains 1–10 above).
- **React Flow** test harness: `@testing-library/react` + a mocked canvas; for the "menu inherits zoom" invariant, an explicit event-listener assertion.
- **Biome** for lint; **Prettier** for format.

### Test layers

1. **Pure-function unit tests** (`src/shared/**/*.test.ts`) — parser, canonicalization, date math, citation allocation, chip injector logic. Most property tests live here.
2. **Component tests** (`src/components/**/*.test.tsx`) — render snapshots, interaction examples, layout invariants. Use `render()` + `screen` queries.
3. **Server integration tests** (`src/server/**/*.test.ts`) — agent loop citations allocation, BFS graph construction with a mocked `get_course`, calendar canonicalization.
4. **API route tests** (`app/api/**/route.test.ts`) — REST routes return expected shapes; prereq-tree route handles the cycle case; calendar route respects `from`/`to` window.
5. **E2E smoke** (small; no Playwright unless already in repo) — agent stream produces a `citations` event; history reload re-renders chips; pane preemption shows "Back to" pill.

### Fixture corpus

- A `__fixtures__/prereq-strings.json` of ~30 real UBC prerequisite strings (CPSC 110, MATH 200, AANB 500, KIN 320 with mid-clause "recommended", etc.) drives parser snapshots and round-trip tests.
- A `__fixtures__/calendar-events.json` of academic + holiday events from a representative year drives calendar month rendering.
- A `__fixtures__/agent-turns.json` of three assistant turns (one with citations, one without, one with out-of-range markers) drives chip injector + Sources panel tests.

### Property test wiring

Properties run as `it.prop(...)` (fast-check's Vitest integration) with seeded randomness — CI failures print the seed so any shrink repros locally. Generator definitions live alongside the property (`arbCourseCode`, `arbPrereqString`, `arbExpr`). For the parser no-throw property, the generator includes `fc.string({ minLength: 0, maxLength: 2000 })` and a constant-array of adversarial samples (unbalanced parens, embedded NULs, mixed-case `none`). Run count 1000 for that property.

### Snapshot policy

Snapshots capture render output for Course Detail Card, Prereq Tree node variants, Sidebar footer (with badge), Calendar month cell, and Citations panel. Snapshot updates are explicit; CI catches drift. Snapshots use `prettyFormat` (not raw HTML) so diffs are reviewable.

## Performance Considerations

- **Pane render latency**: Course Lookup's first paint is gated only by the courses API lookup (`/api/courses/:code`). No client-side parsing. Prereq Tree's first paint is gated by the BFS round-trip; the server parallelizes course lookups with bounded concurrency (default 8) to keep total latency under 1.5s for trees up to depth 8.
- **Citation chip regex**: `/\[(\d+)\]/g` runs once per render pass per message. For long assistant messages, memoize per-text-segment so re-renders only re-inject the diffing leaves. The `citations` event arrival triggers a chip re-render; this is O(text length) and acceptable at chat message sizes.
- **Citation allocation**: `allocateCitations` runs on the server per `tool_end`. It dedupes by `source_url+label` so a repeated tool call (e.g. two `search_courses` turns) doesn't double-count.
- **BFS caching**: The server memoizes `buildPrereqGraph(rootCode)` per process lifetime with an LRU cap of 50 ( ponytail: ceiling — bump if Meilisearch load grows). Repeated identical root lookups skip the BFS; cache key is the canonical code.
- **Calendar fetch**: SWR hook caches by `[cursor, kinds]` with a 5-minute focus revalidation. The unauthenticated REST route is cacheable by `Cache-Control: public, max-age=300`; the agent tool path skips that header.
- **React Flow**: Minimap and Controls are off by default in the pane; "Back to" preemption doesn't unmount the React Flow component, only hides it (CSS), so re-entering the tree preserves canvas zoom.
- **Bundle size**: `reactflow@^11` is the only new dependency; tree-shaken via per-component imports. Estimated +85 kB gzipped; lazy-load the Prereq Tree pane with `next/dynamic` to keep main chunk unaffected.

## Security Considerations

- **`/api/prereq-tree`** is auth-gated by the same JWT middleware that wraps all `/api/*` routes (excepting `/api/calendar` which is intentionally public, REQ-16.1). No new auth paths.
- **Rate limiting**: reogent's existing per-IP rate limit (if present at `/api/*` middleware) applies. The BFS route is more expensive than most — add a same-IP 10-req/min limit on `/api/prereq-tree` (configurable via `RATE_LIMIT_PREREQ`) to prevent graph-exhaustion. Ponytail comment: this is a soft ceiling that defends against runaway clients; revisit if real users hit it.
- **`source_url` trust**: citation URLs rendered in chips pass through the structured `Citation.source_url` field assigned server-side from tool results. The renderer MUST NOT accept `source_url` from the rendered markdown itself; it only reads from the typed field. Chips open in a new tab with `rel="noopener noreferrer"`.
- **No SSR pane state leakage**: pane state stored in URL is client-only — the server renders Chat + empty pane frame; the active channel hydrates client-side. No user-private data leaks in HTML.
- **Prereq AST verbatim copy audit**: the donor `prereqAst.ts` is copied as-is then linted with Biome (eslint-clean pass expected). A `git diff` review confirms zero functional change beyond TS path adjustments.
- **Calendar source URLs**: `CalendarEvent.source_url` is one of the calendar module's known UBC domains. The renderer passes `rel="noopener noreferrer"` and never auto-opens; user click only.

## Dependencies

| Add | Version | Why |
|---|---|---|
| `reactflow` | `^11` | React 19-compatible node-link graph for Prereq Tree. Tree-shaken imports keep the bundle delta under 100 kB gzipped. Lazy-loaded so non-Prereq-Tree routes don't pay. |

No other runtime dependencies are added. The donor's parser ships as a pure-function copy with no library dependencies. Calendar date math is verbatim TypeScript, no `date-fns` or `luxon`.

Peer-pinned: React 19 (existing); `reactflow@^11` declares `react: >=17` (verified at install with `npm ls reactflow`), which accepts React 19. The port mirrors the donor's exact import surface (`reactflow` package, not `@xyflow/react`) so the component code ports with zero rewrite.

### Removed / Not carried over

- The donor's `sentence-transformers`, `@mlc-ai/web-tokenizer`, `@mlc-ai/web-runtime`, and IndexedDB caching library are explicitly NOT added. Citations are server-driven; chat streaming is reogent's existing NDJSON consumer.
- The donor's `katex` / `remark-math` — Prereq Tree labels use plain strings; no math rendering needed.

## Open Questions (Deferred)

- **Citations schema migration approach.** reogent's schema lives in a single `SCHEMA` template literal at `src/server/db/migrate.ts` (`CREATE TABLE IF NOT EXISTS` blocks, no migration tooling to wire). The new column is added directly inside the `messages` block; "rollback" means dev-DB reset via `docker-compose down -v && up`. Is this approach acceptable? Default: yes; the column is server-only, history rows tolerate `null`.
- **Calendar route unauthenticated surface area.** REQ-16.1 implicit: the widget is unauthenticated. Is that acceptable OPSEC given reogent's auth wall elsewhere? Default: yes; calendar data is public UBC content.
- **Prereq Tree React Flow dark theme.** The canvas needs `[data-theme="dark"]` styling; React Flow ships CSS variables for theming. Pigment per DESIGN.md tokens at integration time.

These three are tracked as the first tasks in `tasks.md` and resolved before implementation begins.
