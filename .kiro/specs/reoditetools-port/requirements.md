# Requirements Document

## Introduction

This document captures the requirements for porting five user-facing features from the sibling **reoditetools** repository (the standalone browser-native UBC academic-advisor chatbot, also known as UBCLLM, that runs Qwen3.5 2B locally via WebGPU with offline RAG) into **reogent**, the server-driven conversational-AI Next.js application for UBC students.

**Features ported (the entire scope of this spec):**

1. **Course Lookup** — a one-shot course detail card by code, with case-insensitive canonicalization and ambiguous-input handling.
2. **Prerequisite Tree** — an interactive node-link graph rendered from a recursive-descent parser applied to UBC's free-text prerequisite strings, with selectable disjunctions and transitive BFS expansion.
3. **Sidebar enhancements** — collapse-state persistence across reloads plus a version badge in the footer.
4. **Citation surfacing** — `[N]` markers in the agent's response become inline superscript chips linked to source URLs, with a "Sources Used" vs "Other Retrieved Context" split panel.
5. **Calendar widget** — a read-only month-grid view of academic deadlines and statutory holidays fed by reogent's existing `calendar` module.

**Explicitly excluded from scope (NOT ported):**

- The reoditetools browser-local inference stack: WebLLM, WebGPU, Qwen3.5 2B weights, the MLCEngine Web Worker, model-load error recovery, and IndexedDB model caching.
- The offline RAG pipeline: `sentence-transformers` embeddings, `chunks.json` + `embeddings.bin`, cosine-similarity retrieval, the Python `pipeline/` chunker, and the `buildSystemPrompt('default'|'easter'|'bareSubject')` RAG-grounding contract (reogent's agent uses server-side tools, not browser RAG).
- The Python `scraper/` package: `scrape_courses.py`, `scrape_faculties.py`, `scrape_degree_programs.py`, `scrape_academic_dates.py`, `scrape_holidays.py`, `common.py`, and their committed `output/*.json` snapshots.
- The Vite + React single-page build, `web/public/data/*.json` regenerated-in-CI artifacts, the `_redirects` SPA fallback, and `scraper/output/*.json` corpus.
- The Cloudflare Pages GitHub Action and the `web/src/version.ts` deployment-versioning scheme (reogent uses its own `package.json` semantic version).
- The Degree Planner (`view: 'planning'`), the Easter Eggs system (`ABCD_EASTER_ID`, `LONGEST_PREREQ_TREE_EASTER_ID`), and the WebLLM smoke-test page — none are user-requested and none fit reogent's chat-first product.

**Preserved as canonical (no change):**

reogent's entire architectural spine: Next.js 16 App Router, React 19, TypeScript, JWT (HS256, 7-day expiry) auth, the server-side streaming tool-calling agent (up to 8 iterations, NDJSON `thinking`/`text`/`text_clear`/`tool_start`/`tool_end`/`turn_start`/`done`/`error` events; `done` carries `{ message, tool_calls, warning?, follow_ups? }`), the 20-tool, 12-module data layer (the `modules` array lives at `src/server/modules/index.ts`; tools are aggregated as `modules.flatMap((m) => m.tools).map((t) => t.spec)` at `src/server/agent/stream.ts:27` producing a `ToolSpec[]` — no "slot" registry, just iterating a modules array), Postgres `users`+`sessions`+`messages` schema created by one `SCHEMA` template const in `src/server/db/migrate.ts:3` (no migration tooling, idempotent) with the `appendExchange` write path at `src/server/sessions/store.ts:35`, per-route auth via `requireUser` imported from `@/src/server/auth` (no central middleware), Meilisearch indices, MapLibre GL + deck.gl map, the three-zone Sidebar + Chat + Visual Pane layout (agent-triggered Visual Pane for map content), the multi-provider LLM adapter (`LLM_API_TYPE` openai/anthropic/google), and the Whisper-Neumorphic design language with Tailwind v4 (dual-direction box-shadows, 8px grid, `cubic-bezier(0.16, 1, 0.3, 1)` transforms, light-mode-primary with opt-in dark mode).

A self-contained subset of donor logic eligible for direct reuse with light adaptation: the recursive-descent Prerequisite AST parser (`prereqAst.ts`), the course-code canonicalization regex, the BFS expansion algorithm, and the `[N]` citation-marker parser. These are pure functions with no donor-runtime coupling and port with minimal change. Everything else is reimplemented against reogent's server-driven data surfaces.

## Glossary

- **Reogent**: the Next.js server-driven application that is the port target. All persistence (Postgres, Meilisearch), agent logic, and UI shell live here. Canonical for all design choices.
- **Reoditetools (UBCLLM)**: the donor browser-native chatbot project. Its infrastructure is NOT ported; only its self-contained feature logic is.
- **Canonical Course Code Form**: a normalized course code in the shape `SUBJECT NUMBER` — uppercase subject (2–4 letters), single space, 2–4 digit number with optional trailing letter, `_V` suffix removed. Example outputs: `CPSC 110`, `MATH 200`, `AANB_V 500` → `AANB 500`. Okanagan (`_O`) codes are stripped entirely (Vancouver-app only).
- **Course Record**: the structured object reogent's `get_course` agent tool already returns. Fields: `code`, `subject`, `number`, `title`, `description`, `credits`, `prerequisite` (freeform string or null), `corequisite` (freeform string or null), `sections[]`, `terms[]`, `total_sections`.
- **Prerequisite String**: the raw freeform text returned by the `prerequisite` field of a Course Record. Format is whatever the UBC academic calendar wrote (e.g. `"one of MATH 100, 102, 104, 105, 121"`).
- **Prerequisite AST**: a typed tree produced by recursive-descent parsing of a Prerequisite String. Union of node kinds: `And`, `Or` (with UI variant), `Code` (canonical course code), `Literal` (prose), `Flattened` (labeled-branch prose with embedded structural sub-expr), `Soft` (recommended-tail wrapper). The actual TypeScript `kind` strings carried by the AST are lowercase to match the donor parser: `'and' | 'or' | 'code' | 'literal' | 'flattened' | 'soft'` (PascalCase here is the human-readable requirement form).
- **Dropdown Disjunction**: an `Or` AST node rendered as a single collapsed dropdown (source wording `one of A, B, C`).
- **Stacked Disjunction**: an `Or` AST node rendered as a stacked radio group (source wording `Either (a) … or (b) …`).
- **Literal**: a prose-only AST node (e.g. `"Third-year standing"`). Top-level Literals are dropped from the visual tree; Literals inside disjunctions render as non-clickable option rows.
- **BFS Expansion**: breadth-first transitive walk over `Code` leaves of a Prerequisite AST: each leaf is looked up via reogent's `get_course` tool to fetch ITS `prerequisite` string, parsed again, and merged into one graph. Cycle-safe; depth-capped.
- **Selection Key**: the per-disjunction persistence key in the form `${ownerCourseCode}::${path}` where `path` is the dotted traversal index into the Prerequisite AST. Stable across disjunction toggles and root-course switches.
- **Citation Marker**: the literal token `[N]` inside the assistant response text, where `N` is a 1-indexed position into the per-response retrieved Source Chunk list.
- **Source Chunk**: a unit of retrieved context the agent cites for a single response. In reoditetools these are RAG chunks; in reogent these are tool results (or fields thereof) carrying a URL the model can attribute to.
- **Sources Used Set**: the subset of Source Chunks whose index `N` appears as a `[N]` Citation Marker in the response text.
- **Other Retrieved Context**: the subset of Source Chunks not cited by any `[N]` marker; rendered in a dimmed secondary panel.
- **Visual Pane**: reogent's third zone. Currently agent-triggered for map content. The port extends this surface to host tool-driven surfaces (Course Lookup, Prerequisite Tree, Calendar Widget) without breaking the agent-triggered contract for map data.
- **Three-zone Layout**: reogent's Sidebar + Chat + Visual Pane responsive shell. Sidebar 17rem↔3.75rem (desktop), drawer on tablet/mobile; Chat primary; Visual Pane 50% when agent-emitted map data, else collapsed rail.
- **Sidebar Collapsed State**: the desktop sidebar's 3.75rem rail vs 17rem expanded state. Currently component-local React state in reogent; the port persists it across browser reloads.
- **Calendar Widget**: a read-only month-grid UI showing academic deadlines and statutory holidays fed by reogent's existing `calendar` module (`get_key_dates` tool). Per-month navigation, jump-to-today, mobile stacking.
- **Calendar Event**: a single entry in the calendar data — either an academic deadline (e.g. "Last day to drop courses") or a statutory holiday (e.g. "Family Day"). Carries: `date`, `label`, `kind` (deadline/holiday), optional `source_url`.
- **Neumorphic Whisper Design**: reogent's visual language — dual-direction box-shadows (raised = interactive, recessed = input well, flat = content); 8px grid with 6px sub-grid; `cubic-bezier(0.16, 1, 0.3, 1)` transforms; light-mode primary with `[data-theme="dark"]` opt-in.
- **Reduced-Motion Preference**: the OS-level `prefers-reduced-motion: reduce` signal. All animations on ported features collapse to ≤0.01ms when active.

## Requirements

### Requirement 1: Course Code Canonicalization

**User Story:** As a UBC student, I want to look up a course by typing its code in any common form, so that I receive the same Course Record regardless of capitalization, spacing, or the `_V` suffix.

#### Acceptance Criteria

1. WHEN the user submits a code of the form `SUBJECT NUMBER` with optional `_V` suffix, optional capitalization, and one or more spaces between the subject and the number, the Course Code Canonicalizer SHALL produce the Canonical Course Code Form (`SUBJECT NUMBER`, uppercase, single space, `_V` removed).
2. WHEN the user submits a Vancouver course code carrying the `_V` suffix (e.g. `CPSC_V 110`), the Course Code Canonicalizer SHALL strip the suffix and emit the same canonical form as the unsuffixed input.
3. WHEN the user submits an Okanagan course code (`_O` suffix) where the canonical form is requested for Vancouver-only lookup, the Course Code Canonicalizer SHALL reject the code as out-of-scope.
4. WHEN the user submits a bare subject (2–5 letters, no number), the Course Code Canonicalizer SHALL treat it as a subject-prefix query rather than an exact code.

### Requirement 2: Course Detail Card Rendering

**User Story:** As a UBC student, I want the looked-up course to be rendered as a structured detail card, so that I can scan its metadata without re-reading prose.

#### Acceptance Criteria

1. WHEN a Course Record is returned, the Course Detail Card SHALL render at minimum the course's code, title, credits, description, prerequisite text, corequisite text, terms offered, and the scheduled sections list.
2. WHEN a Course Record field is null or empty, the Course Detail Card SHALL omit that field rather than render an empty placeholder.
3. WHEN the Course Record's `prerequisite` field is non-null and non-empty, the Course Detail Card SHALL display a "Prereq Tree" affordance that opens the Prerequisite Tree for the same course code.
4. WHEN the Course Detail Card renders a scheduled section, the section SHALL display its term, days, formatted start/end times (HH:MM 24h), and instructor when available.

### Requirement 3: Course Lookup Ambiguous-Input Handling

**User Story:** As a UBC student exploring courses, I want Course Lookup to fall back to prefix scan, subject listing, and "did you mean" suggestions when my input is not an exact code, so that I get shortlists I can scan instead of dead-end "not found" screens.

#### Acceptance Criteria

1. WHEN an exact Canonical Course Code Form lookup misses, the Course Lookup SHALL fall back to a prefix scan over canonical codes (e.g. `CPSC 2` → all CPSC courses whose number starts with 2) and display the matches.
2. WHEN the user submits a bare subject, the Course Lookup SHALL render a list of all courses under that subject, capped at a configurable default limit of 200.
3. WHEN the user submits a subject code followed by a level operator (`=` exact first digit, `+` at-least, `-` below), the Course Lookup SHALL return courses whose first digit matches the operator's relation to the supplied digit.
4. WHEN a filter or lookup produces zero results, the Course Lookup SHALL display an empty-state message naming the applied filters or the unresolved code.
5. WHEN an exact code lookup misses AND the prefix scan also returns zero matches, the Course Lookup SHALL display up to 8 substring-suggestion chips labelled "Did you mean:".
6. WHEN the user clicks a "Did you mean" chip, the Course Lookup SHALL re-execute the lookup for that suggested code.

### Requirement 4: Course Lookup to Prerequisite Tree Navigation

**User Story:** As a course-planning UBC student, I want a one-click path from a course card or a mention inside chat into the Prerequisite Tree for that same course, so that I can plan prerequisites without re-typing codes.

#### Acceptance Criteria

1. WHEN the user activates the "Prereq Tree" affordance on a Course Detail Card, the Prerequisite Tree SHALL open with that Course Record's code as the root.
2. WHEN a Course Record is rendered inside an Agent tool-call result card, the user SHALL be able to route that course code into either Course Lookup or the Prerequisite Tree with a single click.
3. WHEN the Prerequisite Tree is the active view, the user SHALL be able to switch the root course by entering a new code into a Course Lookup-style input rendered alongside the tree.

### Requirement 5: Prerequisite AST Parser — Null-Safety and No-Throw

**User Story:** As a developer, I want the Prerequisite AST Parser to be null-safe and to never throw on real-world input, so that no UBC calendar text ever breaks the Prerequisite Tree UI.

#### Acceptance Criteria

1. WHEN the Prerequisite String is null, undefined, empty, or entirely whitespace, the Prerequisite AST Parser SHALL return null.
2. WHEN the Prerequisite String consists only of the chunker placeholder word `none` (case-insensitive, optionally followed by a period and any whitespace), the Prerequisite AST Parser SHALL return null.
3. WHEN the Prerequisite String contains tokens the Prerequisite AST Parser does not recognize as either a course code or a structural keyword, the Prerequisite AST Parser SHALL collapse those tokens into a single Literal node rather than throw.
4. WHEN the Prerequisite String cites only Okanagan (`_O`) courses, the Prerequisite AST Parser SHALL strip those codes and return whichever hard or soft expression remains (including null when nothing remains).
5. WHEN the Prerequisite String contains a tail clause of the form `. X is recommended` / `. X, Y are recommended` / `. X strongly recommended` (case-insensitive), the Prerequisite AST Parser SHALL split that tail into a Soft wrapper around its own parsed sub-expression, leaving the hard prerequisites as the primary expression.
6. WHEN the Prerequisite String names codes inside an unbalanced parenthesis (e.g. `KIN 320 (KIN 351 strongly recommended)`), the Prerequisite AST Parser SHALL NOT split that tail into a Soft wrapper (the "recommended" sits mid-clause).

### Requirement 6: Prerequisite AST Pretty-Printer and Round-Trip Stability

**User Story:** As a developer, I want a Pretty-Printer for the Prerequisite AST and a round-trip property tying the parser and printer together, so that dropdown and radio labels render predictable human-readable text and parser regressions surface as test failures.

#### Acceptance Criteria

1. THE Prerequisite AST Pretty-Printer SHALL flatten any Prerequisite AST node into a single non-empty string label for use as a dropdown option or radio label.
2. WHEN a `Code` node is the input, the Prerequisite AST Pretty-Printer SHALL emit the Canonical Course Code Form.
3. WHEN an `And` node is the input, the Prerequisite AST Pretty-Printer SHALL join its children's labels with ` + `; WHEN an `Or` node is the input, the Prerequisite AST Pretty-Printer SHALL join its children's labels with ` / `.
4. WHEN a `Soft` node wraps an inner node, the Prerequisite AST Pretty-Printer SHALL flatten into the inner node's label (the Soft wrapper affects edge styling only, not the label text).
5. WHEN a `Literal` or `Flattened` node carries empty text, the Prerequisite AST Pretty-Printer SHALL emit a sentinel placeholder (e.g. `(empty)`) rather than the empty string.
6. FOR ALL Prerequisite AST nodes `expr` produced by the Parser, calling `parsePrereq(displayExpr(expr))` SHALL produce an AST whose contained course codes are identical to those in `expr` (round-trip stability on the code-bearing subset).

### Requirement 7: Prerequisite Tree BFS Expansion — Depth, Cycle Safety, Corequisite Column

**User Story:** As a UBC student, I want the Prerequisite Tree to expand a course's full prerequisite chain to a reasonable depth without entering infinite loops or rendering my coreq's coreq's coreqs, so that the graph stays scannable and terminates.

#### Acceptance Criteria

1. WHEN the BFS Expansion encounters a course code it has already enqueued, the BFS Expansion SHALL NOT enqueue that course again (cycle-safe by first-seen-wins).
2. WHEN the BFS Expansion reaches a configurable depth cap (default 15 levels), the BFS Expansion SHALL stop enqueuing further ancestors beyond that depth.
3. WHEN the root Course Record carries a non-empty `corequisite` string, the BFS Expansion SHALL render those corequisite codes in a Corequisite Column that sits adjacent to the root, between the root column and the first prerequisite column.
4. WHEN the BFS Expansion renders the Corequisite Column, the BFS Expansion SHALL enqueue each corequisite's own prerequisites for transitive walking, but SHALL NOT recursively walk corequisites-of-corequisites.
5. WHEN a corequisite's Prerequisite String contains a course code already visited through the prerequisite chain, the BFS Expansion SHALL reuse the existing node rather than create a duplicate.

### Requirement 8: Prerequisite Tree Selection State Stability

**User Story:** As a UBC student exploring alternative prerequisite paths, I want to flip one dropdown without losing sibling selections or my place when I switch the root course, so that the graph stays predictable as I scaffold my plan.

#### Acceptance Criteria

1. THE Prerequisite Tree SHALL record the user's per-disjunction selection in a Selection Key whose form is `${ownerCourseCode}::${path}` where `path` is the dotted traversal index into the owner course's Prerequisite AST.
2. WHEN a Selection Key is absent (first render of a disjunction), the Prerequisite Tree SHALL default to index 0 of the disjunction's children so that the initial render always shows a fully-populated tree.
3. WHEN the user toggles one disjunction, the Prerequisite Tree SHALL modify only the Selection Key for that one disjunction's path, leaving all other Selection Keys unchanged.
4. WHEN the user switches the root course, the Prerequisite Tree SHALL preserve the Selection Key Map across the switch; selections made under any previous root SHALL remain associated with their respective `ownerCourseCode::path` keys.
5. WHEN a disjunction's chosen option is itself a `Code` node, the Prerequisite Tree SHALL route any edges pointing at that code into the dropdown's group node rather than into a standalone course node (dropdown-absorption).

### Requirement 9: Prerequisite Tree Disjunction and Course Node Rendering

**User Story:** As a UBC student, I want disjunctions to render as either a dropdown or a stacked radio group depending on the wording in the source text, and I want course nodes to visually distinguish known, unknown, and note-only nodes, so that I can tell at a glance what's actionable.

#### Acceptance Criteria

1. WHEN a `one of A, B, C` source pattern produces an `Or` AST node with the dropdown UI variant, the Prerequisite Tree SHALL render that disjunction as a custom dropdown menu that scales with the canvas zoom and exposes wheel events to the menu instead of the canvas while open.
2. WHEN an `Either (a) … or (b) …` source pattern produces an `Or` AST node with the stacked UI variant, the Prerequisite Tree SHALL render that disjunction as a stacked radio group with one custom radio row per child.
3. WHEN the disjunction's selected option resolves to a known Course Record, the Prerequisite Tree SHALL render an inline detail strip beneath the disjunction control carrying that course's title (or the sentinel "(not in calendar)" when the course is not found in the index).
4. WHEN a Course node is the root, the Prerequisite Tree SHALL render the root with the `root` variant styling; WHEN the Course is found in the catalog, with the `known` variant; WHEN the Course is not found, with the `unknown` variant; WHEN the node is prose-only (a `Literal` inside a disjunction), with the `note` variant.
5. WHEN the user activates a "Course → Course Lookup" action on any Course node, the user SHALL be routed to the Course Detail Card for that code with a single interaction.

### Requirement 10: Prerequisite Tree Optional Edges, Empty and Not-Found States

**User Story:** As a UBC student, I want "recommended" prerequisites to read visually differently from hard prerequisites, and I want clear messaging when a course has no prerequisites at all or when my code resolves nothing — so that the tree never lies about what is required vs. optional.

#### Acceptance Criteria

1. WHEN a `Soft` wrapper sits on a subtree, the Prerequisite Tree SHALL render edges from that subtree's top-level blocks as dashed paths with an "optional" toggle pill at the bezier midpoint.
2. WHEN the optional toggle is in its "enabled" state, the Prerequisite Tree SHALL include the wrapped subtree in its ancestors; WHEN disabled, the Prerequisite Tree SHALL hide the wrapped subtree's edges.
3. WHEN the resolved root Course Record has no `prerequisite` and no `corequisite` (both null or `none`), the Prerequisite Tree SHALL render a single-message empty state "(code) has no prerequisites or corequisites listed in the calendar." and no canvas nodes.
4. WHEN the input code resolves to no Course Record at all, the Prerequisite Tree SHALL render a not-found state with a prompt to try a code like `CPSC 110` or `MATH 200`.
5. WHILE the Course Record index or the root lookup is still loading, the Prerequisite Tree SHALL render a loading state with the literal text "Loading course index…".

### Requirement 11: Sidebar Collapsed-State Persistence and Version Badge

**User Story:** As a returning UBC student, I want my sidebar to stay collapsed (or expanded) across reloads and to see the app version in the footer, so that my workspace layout is sticky and I know which version I'm running.

#### Acceptance Criteria

1. WHEN the user collapses the desktop sidebar to its 3.75rem rail and reloads the page, the Sidebar SHALL re-render in the collapsed state on first paint.
2. WHEN the user expands the desktop sidebar to its 17rem width and reloads the page, the Sidebar SHALL re-render in the expanded state on first paint.
3. THE Sidebar footer SHALL display the Reogent Version (sourced from reogent's `package.json` `version` field) at the bottom-left, in a small monospaced treatment consistent with reogent's `text-[0.625rem]` Tailwind scaling.
4. WHEN auth is disabled in development (`AUTH_ENABLED=false`), the Sidebar Collapsed-State persistence and version badge SHALL still function identically to the authenticated path.

### Requirement 12: Structured Citations Schema in Agent Response

**User Story:** As the system architect, I want a structured Citations field on the agent's response so that the client can render source chips, link URLs, and split used-vs-other without parsing the prose markdown post-hoc.

#### Acceptance Criteria

1. THE ChatResponse schema SHALL expose a `citations` array whose entries each carry at minimum a 1-indexed `index`, a `label` (canonical course code or page title), a `kind` (course / program / event / calendar / page / generic), and an optional `source_url`.
2. WHEN the agent emits a response that cites one or more retrieved Source Chunks via a `[N]` Citation Marker, the ChatResponse `citations` array SHALL include all retrieved Source Chunks in citation order, with the cited subset marked as `used: true`.
3. WHEN a Source Chunk does not carry a `source_url`, the Citation entry SHALL omit the `source_url` field rather than carry an empty value.
4. WHEN the agent emits no citations for a response, the ChatResponse `citations` array SHALL be empty (not null).
5. WHEN a response is loaded from Postgres history, the persisted Assistant Message SHALL include its citations array so that a reloaded conversation renders chips identically to the live stream.

### Requirement 13: Citation Chip Inline Rendering and Out-of-Range Robustness

**User Story:** As a UBC student, I want `[3]` markers in the assistant answer to render as clickable inline superscript chips that open the cited source, and I want stray `[N]` tokens that fall outside the source-count range to stay as readable literal text — so that the answer reads clean and every chip leads somewhere real.

#### Acceptance Criteria

1. WHEN the assistant content contains a `[N]` Citation Marker whose `N` is in range `1..citations.length`, the Chat Message Renderer SHALL emit an inline superscript chip carrying the integer `N`, clickable, that opens the citation's `source_url` in a new tab.
2. WHEN a citation's `source_url` is absent, the Chat Message Renderer SHALL render the chip as a non-clickable span (no anchor with empty href) and SHALL surface the citation's `label` as the chip's tooltip.
3. WHEN the assistant content contains a `[N]` Citation Marker whose `N` is outside `1..citations.length`, the Chat Message Renderer SHALL render that token as the literal string `[N]` (no chip, no link).
4. WHEN the assistant content contains a `[N]` marker inside inline markdown elements (paragraph, list item, strong, em, table cell, heading, blockquote, link), the Chat Message Renderer SHALL apply citation-chip injection recursively at every leaf string child of those elements.

### Requirement 14: Sources Used vs. Other Retrieved Context Split

**User Story:** As a UBC student, I want to see at a glance which retrieved sources the agent actually leaned on versus which were retrieved but not cited, so that I can spot when the answer is thinly grounded without scrolling the entire response.

#### Acceptance Criteria

1. WHEN the Chat Message Renderer renders the Citations panel for a response, the panel SHALL enumerate Source Chunks in two visually distinct lists: "Sources used" (entries whose `used === true`) and "Other retrieved context" (entries whose `used === false`).
2. WHEN the "Sources used" list is empty and the "Other retrieved context" list is non-empty, the panel SHALL display a single summary header "Sources retrieved (M)" in place of the "Sources used" header.
3. THE Citations panel SHALL default to a collapsed state and SHALL expand on user interaction with a smooth height transition.
4. WHEN the user expands the Citations panel, the panel SHALL scroll into view if any part would be clipped by the chat-scroll viewport.
5. WHEN the "Other retrieved context" list renders, the list's rows SHALL render at reduced opacity relative to the "Sources used" rows so that the used-vs-retrieved distinction is visually obvious without reading the labels.

### Requirement 15: Citation System-Prompt Contract

**User Story:** As the system architect, I want the agent system prompt to mandate `[N]` citation markers tied to the per-response Source Chunk list, so that the structured `citations` field and the inline `[N]` markers stay synchronized and the agent cannot drift away from the chip contract.

#### Acceptance Criteria

1. WHEN the agent has retrieved one or more Source Chunks for a response, the System Prompt SHALL instruct the model to attribute facts by inserting a `[N]` Citation Marker matching the 1-indexed position of the cited Source Chunk in the `citations` array.
2. WHEN no Source Chunks were retrieved for a response (a text-only turn without tool calls), the System Prompt SHALL instruct the model to emit no `[N]` markers.
3. WHEN a Tool Return value carries a `source_url` (or a `url` field per reogent's existing convention), the system SHALL include that entry in the `citations` array and SHALL make its `index` available to the model as the citation number to use.
4. WHERE the active LLM Provider is the Anthropic, OpenAI, or Google adapter (selected via `LLM_API_TYPE`), the Citation System-Prompt Contract SHALL apply identically — the contract lives in the System Prompt, not the provider-specific message format.

### Requirement 16: Calendar Widget Renders Existing Calendar Module Data

**User Story:** As a UBC student planning my term, I want a month-grid calendar overlaying academic deadlines and statutory holidays onto the same canvas, so that I can spot drop deadlines and term breaks at a glance.

#### Acceptance Criteria

1. THE Calendar Widget SHALL render Calendar Events sourced from reogent's existing `calendar` module (the data the `get_key_dates` tool already returns).
2. WHEN a Calendar Event has a date in the rendered month, the Calendar Widget SHALL mark that day in the month grid with a visual indicator distinguishing academic deadlines from statutory holidays (two distinct `kind`-driven styles).
3. WHEN the user hovers (pointer) or focuses (keyboard) a marked day, the Calendar Widget SHALL surface a popover or tooltip carrying the Calendar Event's label and a "Open source" link to the Calendar Event's `source_url` when one is present.
4. WHEN multiple Calendar Events fall on the same day, the Calendar Widget SHALL indicate the count and SHALL enumerate each inside the popover with its own label and source link.
5. WHEN the underlying calendar data is empty for the rendered month, the Calendar Widget SHALL render the empty month grid with no markers, no error state, and no missing-data notice (the absence is the correct rendering).

### Requirement 17: Calendar Widget Navigation and Today Jump

**User Story:** As a UBC student, I want prev/next month buttons and a one-tap return to today, so that I can navigate forward to deadline weeks and snap back without scrubbing.

#### Acceptance Criteria

1. WHEN the user activates the previous-month affordance, the Calendar Widget SHALL render the prior calendar month.
2. WHEN the user activates the next-month affordance, the Calendar Widget SHALL render the next calendar month.
3. WHEN the user clicks the month-header label, the Calendar Widget SHALL jump the rendered month back to the month containing today's date.
4. WHEN the rendered month contains today, the Calendar Widget SHALL highlight today's day cell with a distinct `today` style independent of any Calendar Event markers on the same cell.
5. WHEN the Calendar Widget renders prev/next buttons, the buttons SHALL be disabled (or visibly inert) while the navigation would exceed a configurable future horizon (default 24 months ahead).

### Requirement 18: Calendar Widget Mobile Responsiveness

**User Story:** As a UBC student on my phone, I want the calendar to stack its month grid above an upcoming-events list on small viewports and shrink controls to tappable sizes, so that I can use the calendar between classes without pinch-zooming.

#### Acceptance Criteria

1. WHEN the viewport width is less than 640px, the Calendar Widget SHALL stack the month grid and an upcoming-events list vertically; WHEN the viewport is 640px or wider, the Calendar Widget SHALL lay these out side-by-side.
2. WHEN the viewport width is less than 640px, every interactive control on the Calendar Widget SHALL meet a 44×44px minimum tap target (including the prev-month, next-month, today, and per-day cells).
3. THE upcoming-events list SHALL enumerate the next N Calendar Events chronologically (default N = 10) starting from the rendered month's first visible date.
4. WHEN the user activates an entry in the upcoming-events list, the Calendar Widget SHALL open the same popover the equivalent day cell would open.
5. WHEN the user activates prefers-reduced-motion, the Calendar Widget's month-change transitions SHALL collapse to ≤0.01ms duration.

### Requirement 19: Visual Pane Surfacing Honors Chat-First Contract

**User Story:** As the product owner, I want the ported tool surfaces (Course Lookup, Prerequisite Tree, Calendar Widget) to live inside or alongside the existing Visual Pane without taking over Chat's primary role, so that reogent's chat-first grounding contract is preserved.

#### Acceptance Criteria

1. WHEN a Chat panels-composition is rendered, the Chat panel SHALL remain the primary surface and SHALL never be hidden to make room for a ported tool surface.
2. WHEN the user opens one of Course Lookup, Prerequisite Tree, or Calendar Widget manually, the Chat panel SHALL remain visible (it SHALL NOT be replaced by the tool surface).
3. WHEN the agent emits map data during a chat turn, the existing agent-triggered Visual-Pane-opens-for-maps behavior SHALL remain the source of truth for the Visual Pane's map state; the ported tool surfaces SHALL NOT preempt that trigger.
4. WHEN the user has the Calendar Widget open and asks "what's the deadline for course drop?", the agent's tool-grounded answer SHALL take priority over the widget's static rendering for grounded claims.
5. THE entry points for Course Lookup, Prerequisite Tree, and Calendar Widget SHALL be discoverable from within the three-zone layout; the spec defers the exact entry-point placement to the Design document.

### Requirement 20: Neumorphic, Reduced-Motion, and Accessibility Compliance

**User Story:** As a UBC student who relies on keyboard navigation and reduced-motion settings (and as the product owner who has committed to WCAG 2.1 AA), I want every ported feature to honor reogent's existing Neumorphic Whisper Design system and accessibility standards without bespoke divergence, so that the merged product reads as one continuous material.

#### Acceptance Criteria

1. WHEN any ported feature renders an interactive control (button, chip, dropdown, radio, day cell, navigation arrow), the control SHALL apply the Neumorphic Whisper Design's raised-surface treatment (dual-direction box-shadow); WHEN the control is pressed, the control SHALL animate to the recessed-surface treatment (shadow inversion).
2. WHEN the user activates `prefers-reduced-motion: reduce`, every animation on every ported feature SHALL collapse to ≤0.01ms duration with no fade or slide; reveals SHALL render at their final state on first paint.
3. WHEN the user navigates by keyboard, every interactive control on every ported feature SHALL be reachable in a logical tab order and SHALL display a visible focus ring (`ring-primary/40 ring-2` with ring-offset equivalent).
4. WHEN a ported feature surfaces a status change (citation panel expanding, calendar month change, prereq-tree selection flip, citation chip click), the feature SHALL update an `sr-only` live region for screen readers.
5. WHEN a ported feature renders text, all text SHALL meet WCAG 2.1 AA contrast (≥4.5:1 body, ≥3:1 large text) against its rendered surface, including the dimmed "Other retrieved context" panel and the "note" variant Prereq Tree node.
6. WHEN the Prerequisite Tree renders a custom dropdown menu open, the menu SHALL expose wheel events to itself so that scrolling the menu options does not zoom the canvas; the menu SHALL be dismissable by outside-pointerdown and by Escape.

## Acceptance Criteria Testing Prework (Summary)

A formal correctness-prework pass accompanies the design document. The summaries below identify which requirements are amenable to property-based testing versus example, integration, or smoke testing, so the Design phase can scope the test surface.

| Req | Likely Test Mix | Notes |
|---|---|---|
| REQ-1 (canonicalization) | Property + example | Pure function across all valid subject/number shapes; `_O` rejection as edge case |
| REQ-2 (detail card) | Example + edge case | Render snapshots; null-field-omission is the universal property |
| REQ-3 (ambiguous input) | Property + example | Subject-prefix scan, level filter, "did you mean" — varies meaningfully with input |
| REQ-4 (course ↔ tree nav) | Smoke + example | Wiring check; one example per nav direction |
| REQ-5 (parser null-safety) | Property + edge case | Null/empty/whitespace generator; unknown-token generator; never-throws property |
| REQ-6 (pretty-printer + round-trip) | Property | FOR ALL Prerequisite AST `expr`: code-bearing set of `parsePrereq(displayExpr(expr))` equals that of `expr` |
| REQ-7 (BFS expansion) | Property + example | Cycle-safety property (visited-set invariant); depth-cap property; coreq-column rendering as example |
| REQ-8 (selection stability) | Property + example | Sibling-selection-isolation property; root-switch-survives property |
| REQ-9 (disjunction + node variants) | Example + edge case | Render + interaction tests; "menu inherits zoom" is a layout invariant |
| REQ-10 (soft edges + empty states) | Property + example | Soft-toggle effect property; no-prereqs state as example |
| REQ-11 (sidebar persistence + badge) | Smoke + example | localStorage persistence smoke; version badge render snapshot |
| REQ-12 (citations schema) | Property + integration | Schema validation property (FOR ALL responses); history-rehydration integration |
| REQ-13 (chip rendering) | Property + edge case | Out-of-range-literal invariant; recursive-injection-on-leaf property |
| REQ-14 (used/other split) | Example + integration | Two-list rendering; collapsed-by-default; scroll-into-view |
| REQ-15 (system-prompt contract) | Integration + example | Per-provider parity smoke; prompt-content example |
| REQ-16 (calendar data) | Property + example | FOR ALL Calendar Events in month: cell marked with kind-driven style; multi-event-day example |
| REQ-17 (calendar nav) | Example + edge case + property | Prev/next/today jumps (example); horizon-disable as edge case and as Property 29 (tasks 20.9-20.12) |
| REQ-18 (calendar mobile) | Example + responsive snapshot | <640px stack, ≥640px side-by-side; 44px tap targets |
| REQ-19 (visual pane contract) | Integration + smoke | Test the agent-trigger precedence + chat-remains-visible invariants |
| REQ-20 (UX/accessibility) | Example + integration | Reduced-motion invariant; focus-ring invariant; contrast checks |

The Design document will formalize each property, identify edge-case generators, and lock the test framework (Vitest + fast-check for property tests, Vitest for example/integration, Biome for lint).
