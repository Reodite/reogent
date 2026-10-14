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

- **Entry and routes:** `/` remains the public landing page without ending a signed-in or guest session. The Reodite logo returns there. Open app starts chat at `/app`; saved conversations use `/app/chat/:id`. Tools, Unity, Settings, Account, and About live under `/app/tools`, `/app/pulse`, `/app/settings`, `/app/account`, and `/app/about`. Retain redirects from existing workspace links.
- **AI:** Streaming chat, saved conversations, tool activity, citations, and a contextual Answer Canvas. Users can dismiss a pane or reopen it through a mapped result; automatic activation respects dismissal.
- **Tools and guests:** Campus map, course lookup, prerequisites, degree planner, schedule planner, and calendar. Preserve routed screens and workspace state when moving between modes. Guests enter Tools and can open Settings, Account, and About; hide both mode-switcher presentations, including phone bottom tabs. Course search and detail APIs are public, so guest course browsing requires no private account request.
- **Unity:** Announcements, Pulse voting, and schedule sharing. List Announcements first at `/app/pulse/announcements`, with dated cards linking to full posts at `/app/pulse/announcements/:slug`. Joining a shared group requires explicit confirmation before disclosing a schedule.
- **Accounts:** Username/password sign-in protects private sessions, saved work, profiles, and account activity. Public geographic and catalog endpoints retain their own access rules. Optional personal details supply agent context; missing values do not prevent a conversation.
- **Conversations:** Persist completed user/assistant exchanges and their activity/citations. Create sessions on the first saved exchange, generate first-exchange titles, and retain history across visits. Send `done` after the required save succeeds; preserve post-completion save attempts after disconnect. Resource and cancellation limits belong in [README.md](README.md).
- **Devices:** Phones use full-width pages, bottom mode navigation for signed-in users, and a drawer. Wider screens use the sidebar and split workspaces. See [DESIGN.md](DESIGN.md) for geometry, focus, and responsive contracts.

### Onboarding and profile

Signed-in accounts without `onboarding_completed: true`, including older accounts, visit `/onboarding` before entering the app. Guests bypass setup. Completed accounts continue to their requested destination.

Show three cards: Welcome, About you, then Preferences. Prefill saved details; keep preferred name, program, year of study (integer 1–10), and tuition defaults optional. Tuition choices are ask when needed, domestic, or international. Preferences contains the shared Light/Dark toggle and volume slider. Next and Back retain the draft. Finish saves details, appearance, and completion together before continuing to the original safe local destination. Skip preserves saved personal details, saves current appearance, and marks setup complete. Failed saves retain entries for retry; a reload starts with the last saved profile.

Onboarding and Account share `ProfileFields`, validation, and the `user_profiles.data` JSONB record. Onboarding reads `/api/profile`; Account reads the same profile through `/api/account`. Both save through `/api/profile`. Keep `preferred_name`, `program`, `year`, `student_type`, `theme`, and `onboarding_completed` in the shared schema. Account edits must preserve the completion flag. Add account-level preferences to both surfaces; these optional JSONB fields need no schema migration. Profile load failures offer retry without overwriting saved values.

Apply appearance immediately. Use the initial device preference when no explicit local choice exists, then retain Light or Dark without following later device changes. Finish, Skip, and Save profile persist the current appearance to the account; signing in elsewhere loads it. Ignore unsupported stored themes. Respect reduced motion during the theme ripple.

### Account, Settings, and About

Open utility routes from the account popup's General section. Preserve the current mode and its saved destination while viewing them; browser Back restores the prior workspace.

Account shows username, preferred name, student defaults, creation date, tokens spent, and Pulse questions answered. Edit profile opens the shared fields in place. Load account details before editing, retain drafts after failed saves, and keep Sign out available during loading and recovery. Guests see a sign-in prompt without private account requests.

`/api/account` requires authentication. Token totals include provider-reported chat and conversation-title usage and survive conversation deletion. Show the tracking start date; earlier and unreported usage remain unavailable. Count stored Pulse answers across active and locked rounds.

Settings contains Appearance and Sound for guests and signed-in users; student details belong in Account. About shows The creators, Max and Chakorn's initial-placeholder cards, and the coffee link. Link their names to `https://libo.dev/ai` and `https://chakornk.dev`. Keep About outside Unity. Redirect `/app/pulse/creators` to `/app/about` and exclude the retired destination from mode restoration.

### Sound feedback

Start at 0% volume. Onboarding and Settings share a native 0–100% slider with 10% steps and eleven marks. Preview each crossed mark at its volume; selecting the current mark previews it again. Zero mutes previews and feedback. Settings adds native Navigation and Bot noises switches. Keep Sound as an accessible region name without a visible subheading or duplicate percentage display.

Navigation covers committed interface actions, including page changes, local Back, expansion/collapse, toggles, selection, deletion, drag/drop, and map controls. Pulse votes use directional cues for buttons, keyboard, and committed swipes. Keep cancelled gestures, hover, focus, typing, and uncommitted presses silent. Choose one cue from explicit action metadata and native state before icon hints; rate-limit repetition and overlapping peaks.

Bot noises covers accepted sends/retries, thinking, tool work and outcomes, response start, and exchange completion or failure. Play one send cue without a generic click and one terminal cue per exchange. Streamed response text stays quiet after its entry cue. Stop, reset, unmount, and replacement exchanges cancel without terminal feedback; opening saved conversations stays silent. Pause audio in hidden tabs and discard missed notifications.

Store only volume, Navigation, and Bot noises under `reodite.audio`; synchronize browser tabs and save volume as it changes, including during skipped setup. These preferences remain device-local for guests and accounts. Merge legacy interface-action preferences into Navigation and completion/failure preferences into Bot noises, retaining an off setting if any merged category was off. Start audio after a gesture; unavailable audio leaves the interface usable and unavailable storage keeps preferences in memory.

## Capabilities and Constraints

- Retrieve courses/sections, prerequisite and historical grade data, fees/costs, programs/admissions, calendar dates, campus services, events, and indexed prose. The [module registry](src/server/modules/index.ts) owns tool names and dispatch.
- Search across published prose and legacy pages. Read complete relevant documents before presenting procedures or eligibility rules; preserve original links, hashes, dates, and extraction warnings. Snippets alone do not establish the full conditions.
- Route over the pedestrian network where possible. Label straight-line fallback estimates and do not draw them as network paths. Map data includes buildings, verified current entrances, and associated services; undocumented entrance fields do not establish accessibility.
- Explore building details, save favorites for an account, share a building link, and edit walking endpoints. Keep one active route/highlight context. Tools shows details in Explore; Chat retains its map popup behavior.
- Show calendar dates and multi-day events, browse course records, inspect prerequisites, and maintain degree/timetable plans. Workday XLSX import belongs to the schedule tools; chat input remains text-only.
- Limit each chat request to eight model turns and six total tool calls. Tools in one batch can execute in parallel; the next model turn waits for results. A final-turn prompt does not guarantee an answer, and exhausted or unverified exchanges return an error.
- Data freshness follows the source snapshot and ingestion. Parking facts, study-space descriptions, and library schedules do not establish live occupancy, vacancy, or booking availability.
- Publish developer announcements from Markdown bundled with the app. Dates order posts rather than schedule publication; see [README.md](README.md#announcements) for the publishing contract.
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

Provide keyboard operation, visible focus, named controls, text alternatives for mapped results, and reduced-motion behavior. Preserve the 32px minimum touch target and larger component-specific sizes in `DESIGN.md`. Keep audio supplementary to visible state and preserve native keyboard controls for appearance, volume, and switches. Target WCAG AA; do not claim certification from automated tests. Phone viewport, keyboard, notch, and assistive-technology behavior still need device testing.
