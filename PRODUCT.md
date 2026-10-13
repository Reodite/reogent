# Reodite

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

UBC Vancouver undergraduate and graduate students using a phone or laptop to find courses, plan a term, compare costs, or navigate campus. The repository does not establish usage-frequency or registration-window research.

## Product Purpose

Answer campus questions from indexed UBC sources and provide dedicated tools for browsing, planning, and maps. Chat answers can open a relevant tool pane; students can also use tools directly.

## Positioning

Use retrieved university evidence for factual UBC answers. Show source links and distinguish source dates, missing data, and estimates. Reodite covers the published datasets, not every UBC website or live campus condition.

## Operating Context

- **AI:** Streaming chat, saved conversations, tool activity, citations, and a contextual Answer Canvas. Users can dismiss a pane or reopen it through a mapped result; automatic activation respects dismissal.
- **Tools:** Campus map, course lookup, prerequisites, degree planner, schedule planner, and calendar. Preserve routed screens and workspace state when moving between modes.
- **Unity:** Pulse voting and schedule sharing. Joining a shared group requires explicit confirmation before disclosing a schedule.
- **Accounts:** Username/password sign-in protects private sessions, saved work, and profiles. Public geographic and catalog endpoints have separate access rules. Settings stores optional program/year/student-type defaults for agent context; unavailable defaults do not block chat.
- **Conversations:** Persist completed user/assistant exchanges and their activity/citations. Create sessions on the first saved exchange, generate first-exchange titles, and retain history across visits.
- **Devices:** Phones use full-width pages, bottom mode navigation, and a drawer. Wider screens use the sidebar and split workspaces. See [DESIGN.md](DESIGN.md) for geometry, focus, and responsive contracts.

## Capabilities and Constraints

- Retrieve courses/sections, prerequisite and historical grade data, fees/costs, programs/admissions, calendar dates, campus services, events, and indexed prose. The [module registry](src/server/modules/index.ts) owns tool names and dispatch.
- Search across published prose and legacy pages. Read complete relevant documents before presenting procedures or eligibility rules; preserve original links, hashes, dates, and extraction warnings. Snippets alone do not establish the full conditions.
- Route over the pedestrian network where possible. Label straight-line fallback estimates and do not draw them as network paths. Map data includes buildings, verified current entrances, and associated services; undocumented entrance fields do not establish accessibility.
- Explore building details, save favorites for an account, share a building link, and edit walking endpoints. Keep one active route/highlight context. Tools shows details in Explore; Chat retains its map popup behavior.
- Show calendar dates and multi-day events, browse course records, inspect prerequisites, and maintain degree/timetable plans. Workday XLSX import belongs to the schedule tools; chat input remains text-only.
- Limit each chat request to eight model turns and six total tool calls. Tools in one batch can execute in parallel; the next model turn waits for results. A final-turn prompt does not guarantee an answer, and exhausted or unverified exchanges return an error.
- Data freshness follows the source snapshot and ingestion. Parking facts, study-space descriptions, and library schedules do not establish live occupancy, vacancy, or booking availability.
- OpenAI-compatible, Anthropic, and Google adapters share the agent contract. Provider selection and deployment settings belong in [README.md](README.md).

## Brand Commitments

Use neutral surfaces, restrained depth, and indigo for actions and selected states. Keep app views focused on the task; the landing page can use more expressive motion. Follow [DESIGN.md](DESIGN.md) rather than introducing another palette, type scale, or component system.

## Evidence on Hand

The repository includes published UBC datasets, derived/curated degree data, UI assets, automated tests, and security review notes. Source provenance supports campus facts; engineering tests do not substitute for usability research, measured building popularity, or accessibility certification.

## Product Principles

- Keep factual claims tied to retrieved evidence; greetings and conversational replies need not invent a data lookup.
- Preserve account ownership, saved work, and explicit sharing consent.
- Keep source verification and complete content intact during performance optimization.
- Distinguish loading, stale data, failure, and a successful empty result. Provide a usable recovery action.
- Keep direct tool use and contextual chat visuals compatible with the same workspace state.

## Accessibility & Inclusion

Provide keyboard operation, visible focus, named controls, text alternatives for mapped results, and reduced-motion behavior. Preserve the 32px minimum touch target and larger component-specific sizes in `DESIGN.md`. Target WCAG AA; do not claim certification from automated tests. Phone viewport, keyboard, notch, and assistive-technology behavior still need device testing.
