# Landing preview accuracy

## Scope

Correct the carousel preview content and captions against current implementation. Preserve Agent capabilities → Tools → Unity, the six registered Tools, carousel motion, controls, accessibility, card dimensions and hero/authentication paths. Keep previews static and labeled Example.

## Evidence and changes

- Research listed retired `get_tuition`, `search_student_fees` and `get_living_costs` tools. The module registry uses `get_costs` with tuition, fees and living kinds. Reuse `describeToolCall` and match conversation activity badges without importing live chat state.
- The CPSC 221 diagram omitted alternatives and presented CPSC 110 as CPSC 210's only prerequisite. The local Vancouver Academic Calendar catalog records CPSC 210's prerequisite as “One of CPSC 107, CPSC 110.” Show that complete direct choice instead.
- Degree planning organizes years into winter/summer terms. Reuse `SEASON_META`, show a selected-course excerpt across Winter 1 and Winter 2, and retain prerequisite checking in the caption. Do not imply that an excerpt is a complete BSc program.
- Calendar uses Sunday-first UTC date math and Academic, Holiday and Campus event legend entries. Reuse its grid helpers for September 2026 and mark the catalog's September 8 term start and September 21/28 drop dates. Do not invent event dates.
- Course schedule builds a timetable from course sections. Label illustrative class times.
- Unity sharing imports Workday schedules into groups, compares their weeks and calculates common free time. Name the group, use the Shared schedule heading, and mark a single Tuesday interval rather than painting one label across the week.
- Both map examples used unverified 9-minute/680-metre values. Omit the measurements and retain a walking-route example with ICCS/Nest endpoints.
- Course lookup course names/credits and the grounded CPSC 340 result match the local course catalog. Announcements copy matches the published welcome post. The Pulse prompt matches the example round. Preserve those previews.

## Source files

- `src/server/modules/index.ts`, `src/server/modules/costs.ts`
- `src/lib/format.ts`, `src/components/chat/tool-renderers.tsx`
- `src/components/shell/pane-registry.tsx`
- `ubc-unified-data/data/academic-calendar/vancouver/courses.json`
- `ubc-unified-data/data/academic-calendar/vancouver/dates.json`
- `src/components/prereq-tree/nodes/DisjunctionNode.tsx`
- `src/lib/planner-model.ts`, `src/components/degree-planner/term-section.tsx`
- `src/components/calendar/calendar-pane.tsx`, `src/shared/calendar/date-math.ts`
- `src/components/schedule-planner/schedule-planner-pane.tsx`
- `src/components/schedule/schedule-app.tsx`, `src/components/schedule/schedule-grid-adapter.ts`
- `content/announcements/welcome-to-announcements.md`, `data/pulse/round.example.json`

## Verification

- Regression baseline: seven new assertions failed against the old previews; eighteen existing carousel checks passed. See `landing-accuracy-red.log`.
- Focused landing tests: 40 passed. The full suite subsequently passed 208 files / 2,684 tests with `npm test -- --maxWorkers=4`; see `landing-accuracy-tests.log`.
- First browser batch: 597/598 checks passed. At 320px, research activity badges pushed the response below the preview boundary. Reduced phone-only gaps without changing text size, preview height or content. See `landing-accuracy-browser-first.json` and `landing-accuracy-narrow-dark-agent-before.png`.
- Confirmation batch: 598/598 checks passed at 1440, 768, 390 and 320px, plus a 720px viewport at device scale 2 to represent 200% desktop reflow. Each selected preview keeps text inside its preview/footer bounds. Arrow/dot navigation, wrapping, depth, layering, keyboard focus, wheel input, touch cancellation, vertical scrolling, resize preservation and reduced motion retain their behavior. No API requests occurred. See `landing-accuracy-browser-report.json` and `landing-accuracy-check.cjs`.
- `npx tsc --noEmit` and `npm run build` exited 0. The build retained the 14 existing filesystem-tracing warnings in `src/server/data.ts`.
- `npm run lint` exited 0 with 25 existing warnings and 7 informational diagnostics. Targeted Biome found no issues.
- Changed tracked files pass Prettier and Git whitespace checks. Repository-wide formatting retains 134 unrelated failures after formatting this revision's review artifacts.
- The Impeccable detector returned no findings. The only subsequent UI adjustment compacted research-preview gaps after the first browser batch.
- Restored the test-generated prerequisite snapshot line-ending change after confirming its normalized contents match HEAD. Preserve the dirty data submodule, previous review artifacts and `dev.log`.

## Limits and existing findings

The image adapter exposes text only, so this review relies on computed browser geometry, interaction checks and source comparison. Screenshots remain available for human visual review. Chromium desktop/mobile emulation does not establish other-browser or physical-device behavior. The zoom check uses an equivalent CSS viewport and device scale rather than changing a browser's zoom control.

Unchanged hero/closing-CTA initial styles still produce a reduced-motion hydration warning. The narrow Course lookup preview intentionally ellipsizes its long first title. Neither finding comes from this revision. Keep both outside this content correction.
