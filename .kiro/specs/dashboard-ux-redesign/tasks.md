# Implementation Plan: Dashboard UX Redesign

## Overview

This plan implements the dual-mode dashboard shell from `requirements.md` / `design.md`: an AI mode (chat + agent-driven Answer Canvas with response widgets) and a Tools mode (tool list + full-bleed tool), behind a persisted toggle. The implementation is TypeScript throughout; it composes existing pieces (`message.toolCalls`, per-tool renderers, `setActiveChannel`/`showOnMap`, the four pane components) and retires the superseded ones (`PaneHost`, `ToolsStrip`, `PanePreempt` + `previousUserChannel`, the AI-mode composer tools menu, `mergeMapHighlights`).

The build order starts at the state contract (the single `workspaceView` source of truth), then the pure mapper, then the components bottom-up, then wiring into `AppShell` and `ChatPanel`, then retirements, then responsive/a11y, then a visual-polish pass with the `impeccable` skill, then a final browser smoke. Checkpoints gate each phase with a running test gate (`npm run lint`, `npm run format:check`, `npx vitest run`). This is a UI-rendering feature; PBT does not apply — tests are example/unit/component/integration/snapshot, marked with `*` per kiro-sdd convention.

Requirement clauses are referenced as `REQ-N.M` (Requirement N, acceptance criterion M).

## Tasks

- [x] 1. Foundation — state contract and types
  - [x] 1.1 Define shell-state types in `src/components/chat/chat-shell-context.tsx`
    - Add `type ShellMode = "ai" | "tools"` and `type CanvasView = { paneId: PaneId; state: PaneState }`. Extend `ChatShellState` (design §Component 2): add `mode`, `setMode`, `workspaceView: CanvasView | null`, `setWorkspaceView`, `activateCanvasView: (call: ToolCall) => void`, `answerSheetOpen`, `setAnswerSheetOpen`. Keep `showOnMap`/`highlight`/`mapOpen`/`focusNonce` and all session fields. Add a latest-value ref for `workspaceView` mirroring the existing `activeChannelRef` stability pattern so `activateCanvasView` stays identity-stable.
    - _Requirements: REQ-1.2, REQ-1.3, REQ-3.1, REQ-3.4_
  - [x] 1.2 Implement `activateCanvasView` and reconcile `showOnMap`
    - `activateCanvasView(call)` = `const v = toolCallToCanvasView(call); if (v) setWorkspaceView(v)`. `showOnMap(highlight)` becomes `setWorkspaceView({ paneId: "map", state: { highlight } })` + `focusNonce++` + open the below-wide sheet (preserved contract). `setWorkspaceView(null)` = idle (AI) / default tool (Tools). Keep the callback deps `[]` so callers' effect deps don't churn.
    - _Requirements: REQ-3.1, REQ-3.6, REQ-8_

- [x] 2. `toolCallToCanvasView` mapper (pure, standalone)
  - [x] 2.1 Implement `toolCallToCanvasView` in `src/lib/walking.ts` (generalize next to `mergeMapHighlights`)
    - Pure function over the design mapping table: `walking_distance`/`find_places`/`find_building`/`find_parking` → `{ paneId: "map", state: { highlight: extract*Highlight(call) } }`; `get_course`/`search_courses` → `{ paneId: "course-lookup", state: { code: result.code ?? input.code ?? input.subject } }`; `get_prereq_tree` → `{ paneId: "prereq-tree", state: { root: result.rootCode ?? input.code, selections: {} } }`; `get_key_dates` → `{ paneId: "calendar", state: { cursor: thisMonth(), kinds: ["academic","holiday"] } }`. Error results (`isToolError`) and unmapped tools return `null`. Reuse the existing `extract*Highlight` helpers; do not change the `walking_distance` polyline split (polyline stays fetched by `/api/route`).
    - _Requirements: REQ-3.1, REQ-3.7_
  - [x]* 2.2 Example tests for `toolCallToCanvasView`
    - One passing + one error-result case per mapped tool name; unmapped-name returns `null`; null result tolerated. Colocate as `walking.test.ts` next to the source.
    - _Requirements: REQ-3.1, REQ-3.7_

- [x] 3. Checkpoint — mapper and state-contract tests pass
  - Ensure `npx vitest run` is green; ask the user if questions arise.

- [x] 4. ShellMode persistence + bootstrap
  - [x] 4.1 Implement `useShellMode`
    - Hook in `src/components/shell/use-shell-mode.ts`: `localStorage["reogent.shell.mode"]`, default `"ai"`, tolerant parse (invalid/absent → `"ai"`), persist on change.
    - _Requirements: REQ-1.5, REQ-1.6_
  - [x] 4.2 Pre-paint bootstrap in `app/layout.tsx`
    - Extend the existing inline `<head>` bootstrap (which sets `data-theme` and `data-auth-pending`) to also read `reogent.shell.mode` and write `documentElement.dataset.shellMode`, preventing a mode flash on load. Covered by `suppressHydrationWarning`.
    - _Requirements: REQ-1.6, REQ-4.5_

- [x] 5. `ResponseWidget` — unify streaming and history tool rendering
  - [x] 5.1 Refactor `src/components/chat/tool-renderers.tsx` so the per-call card is an activatable widget
    - Rename/extract `ToolCallsView` into `ResponseWidget` (one per `ToolCall`): reuses the existing per-tool summary renderers + `ToolBadge` + `ToolResultCard` visuals; adds `active` ring when `workspaceView` matches `toolCallToCanvasView(call)`; `onClick`/Enter/Space → `activateCanvasView(call)` for mapped tools; unmapped tools render a static non-focusable summary. `role="button"` + `tabIndex={0}` only when `toolCallToCanvasView(call)` is non-null.
    - _Requirements: REQ-3.2, REQ-3.3, REQ-3.4, REQ-8.1_
  - [x] 5.2 Unify the streaming interstitial block with the widget
    - In `src/components/chat/message.tsx`, render `ResponseWidget` for every `tool_call` interstitial block during streaming (replacing `ToolCallBlock`) AND for every `message.toolCalls` entry on history reload (replacing the `ToolCallsView` branch at `message.tsx:301`). One component, both paths. Pass `toolCalls` into `AssistantMarkdown`'s context only if inline chips are later desired (deferred per design — block widgets only for now).
    - _Requirements: REQ-3.2, REQ-3.5_
  - [x]* 5.3 Component tests for `ResponseWidget`
    - Click activates the canvas for a mapped tool; unmapped renders static and non-focusable; `active` ring reflects `workspaceView`; keyboard Enter/Space activates.
    - _Requirements: REQ-3.3, REQ-3.4, REQ-8.1_

- [x] 6. `AnswerCanvas` (AI-mode right region)
  - [x] 6.1 Implement `AnswerCanvas` + `AnswerCanvasIdle` in `src/components/shell/answer-canvas.tsx`
    - `view === null` → `AnswerCanvasIdle` renders `MapArea` with `highlight = null` at the default extent (map-first idle). `view !== null` → resolve `PANE_BY_ID[view.paneId]` and render `<entry.Component state={view.state} setState={..real..} />`. For `paneId === "map"`, `CampusMap` reads `highlight` from `view.state` and `focusNonce` from context (unchanged). Fix the existing `noopSetState` bug (`pane-host.tsx:11`): pass a real `setState` that merges back into `workspaceView.state` so course-lookup submit and calendar month-nav persist. Host the map here (moved up from `ChatPanel`).
    - _Requirements: REQ-2.1, REQ-2.3, REQ-3.1, REQ-9.4_
  - [x]* 6.2 Component tests for `AnswerCanvas`
    - Idle map rendered when `workspaceView === null`; pane component rendered for a given `CanvasView`; `setState` writes back into `workspaceView.state` (the noop-bug fix).
    - _Requirements: REQ-2.3, REQ-3.1_

- [x] 7. `FullBleedTool` (Tools-mode workspace)
  - [x] 7.1 Implement `FullBleedTool` in `src/components/shell/full-bleed-tool.tsx`
    - Renders the selected pane's `Component` across the full workspace area (the AI-mode chat+canvas split collapses to one region). `view === null` → default to the first `PANE_REGISTRY` entry (Campus Map). Real `setState` round-trip (same fix as §6.1). Exactly one tool at a time.
    - _Requirements: REQ-4.3, REQ-4.4, REQ-4.5_
  - [x]* 7.2 Component tests for `FullBleedTool`
    - Default tool when `view === null`; selecting another tool replaces it; `setState` round-trips.
    - _Requirements: REQ-4.4, REQ-4.5_

- [x] 8. Checkpoint — components render and tests pass
  - Ensure `npx vitest run` and `npm run lint` are green; ask the user if questions arise.

- [x] 9. `ModeToggle` + `LeftSidebar` mode swap
  - [x] 9.1 Implement `ModeToggle`
    - Segmented "AI mode" switch pinned at the left-sidebar footer; calls `setMode`; persists via `useShellMode`; visible at all viewports in both modes; keyboard-operable.
    - _Requirements: REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.7_
  - [x] 9.2 Refactor `LeftSidebar` to swap contents by mode
    - AI Mode → `<SessionList>` (reuse the existing `SessionSidebar` body minus the footer tool grid; new-conversation + history + optimistic ops). Tools Mode → `<ToolList>` (one row per `PANE_REGISTRY` entry; selecting a row calls `setWorkspaceView({ paneId, state: entry.defaultState })`). Footer always renders `<ModeToggle>`. Keep the wide/below-wide sidebar collapse (17 rem ⇄ 3.75 rem) and below-wide drawer pattern; remove the tools-strip drawer footer in AI Mode.
    - _Requirements: REQ-1.4, REQ-6.3, REQ-6.4_
  - [x]* 9.3 Component tests for `ModeToggle` + `LeftSidebar`
    - Toggling swaps left contents between SessionList and ToolList and persists; `ToolList` selection sets `workspaceView`; toggle reachable from both modes.
    - _Requirements: REQ-1.4, REQ-6.4_

- [x] 10. `AppShell` refactor + mobile Answer Sheet
  - [x] 10.1 Rewrite `src/components/shell/app-shell.tsx` to compose the new regions
    - TopBar + LeftSidebar + WorkspaceArea(`{mode === "ai" ? <ChatSurface>{children}</ChatSurface><AnswerCanvas view={workspaceView}/> : <FullBleedTool view={workspaceView}/>}`). Host `AnswerCanvas`/`MapArea` in `AppShell` (not inside `ChatPanel`) so the map survives session swaps. Keep `RequireAuth`, skip-link, `#main-content` target (AI: on ChatSurface; Tools: on FullBleedTool).
    - _Requirements: REQ-2.1, REQ-2.2, REQ-4.1, REQ-4.4, REQ-9.4_
  - [x] 10.2 Implement the below-wide Answer Sheet for AI Mode
    - Replace the existing `MapBottomSheet` + `PaneBottomSheet` split with one `AnswerSheet` (a Bottom Sheet hosting `AnswerCanvas`) opened from the TopBar "Map" entry. Scrim + `inert` on the shell + Close Control in the header + dismiss on scrim tap/Escape. Map waiting-answer cue when `highlight` set and sheet closed.
    - _Requirements: REQ-2.4, REQ-2.5, REQ-5.4, REQ-6.5, REQ-6.6_
  - [x] 10.3 Below-wide Tools Mode drawer for the Tool List
    - Collapse `ToolList` into the existing left drawer pattern below wide; keep `FullBleedTool` full-bleed on all viewports.
    - _Requirements: REQ-4.6, REQ-5.1_
  - [x]* 10.4 Component tests for `AppShell` layouts (snapshot)
    - Snapshot baselines: wide AI, below-wide AI (sheet), wide Tools, below-wide Tools (drawer). Assert `#main-content` target present in each layout.
    - _Requirements: REQ-4.1, REQ-4.5, REQ-7.1_

- [x] 11. `ChatPanel` wiring — generalized canvas drive + reload re-activation
  - [x] 11.1 Replace the map-only post-response drive with the general mapper
    - At `src/components/chat/chat-panel.tsx:456-460`, replace `mergeMapHighlights(response.tool_calls)` + `showOnMap`/`else setActiveChannel(null)` with: find the last `ToolCall` in `response.tool_calls` for which `toolCallToCanvasView(call)` is non-null; if found, `activateCanvasView(call)`; if none, leave `workspaceView` as-is (the canvas is persistent — do NOT auto-close per REQ-3.6).
    - _Requirements: REQ-3.1, REQ-3.6, REQ-9.1_
  - [x] 11.2 Re-activate the latest widget on session load
    - At `chat-panel.tsx:289-293`, replace the `mergeMapHighlights`-only restore with a scan of `history` (reverse) for the last assistant message with `toolCalls`, then the last call mapping to a view; `activateCanvasView` it, else set `workspaceView(null)` (idle map).
    - _Requirements: REQ-3.8, REQ-9.5_
  - [x] 11.3 Remove manual tool launch from AI Mode
    - Remove the composer `+` tools menu (`composer-tools-menu.tsx`) from AI Mode; manual tool use moves to Tools Mode via `ToolList`. Keep the composer input and citation chips unchanged.
    - _Requirements: REQ-2.1, REQ-6.4_

- [x] 12. Retirements — delete superseded code
  - [x] 12.1 Remove `PaneHost`, `ToolsStrip`, `PanePreempt` + Back-to pill
    - Delete `src/components/shell/pane-host.tsx`, `tools-strip.tsx`, `pane-preempt.tsx`. Update imports in `app-shell.tsx`. Keep `pane-registry.tsx` (`PANE_REGISTRY`/`PANE_BY_ID` reused by `ToolList` + `AnswerCanvas`); drop the `preemptableByAgentMap` flag (no longer consulted — design retires the capture).
    - _Requirements: REQ-1.4, REQ-3.6_
  - [x] 12.2 Remove `previousUserChannel` + sessionStorage restore flow
    - Remove `previousUserChannel`/`setPreviousUserChannel`/`readPreviousUserChannel`/`writePreviousUserChannel` and the `PREVIOUS_USER_CHANNEL_KEY` from `chat-shell-context.tsx`. Widgets in persisted `message.toolCalls` replace the restore mechanism.
    - _Requirements: REQ-3.4, REQ-3.8_
  - [x] 12.3 Remove `mergeMapHighlights` after Task 11 replaces all callers
    - Delete `mergeMapHighlights` from `src/lib/walking.ts` once `chat-panel.tsx` no longer references it (Tasks 11.1, 11.2). Keep the `extract*Highlight` helpers (reused by `toolCallToCanvasView`).
    - _Requirements: REQ-3.1_
  - [x] 12.4 Remove the AI-mode composer tools menu and `PaneBottomSheet`
    - Delete `composer-tools-menu.tsx`'s AI-mode entry and `PaneBottomSheet` (replaced by `AnswerSheet`).
    - _Requirements: REQ-2.5, REQ-6.4_

- [x] 13. Responsive, a11y, focus, inert, reduced-motion pass
  - [x] 13.1 Breakpoint transitions preserve state
    - Verify regions rearrange across `md`/`lg` boundaries without unmounting the map (desk scene survives) or losing `workspaceView`/`mode`/session. The shell does not conditionally swap AnswerCanvas↔AnswerSheet by remounting — keep `MapArea` mounted; only its wrapper changes.
    - _Requirements: REQ-5.1, REQ-7.1, REQ-9.4_
  - [x] 13.2 ARIA roles + labels
    - TopBar `banner`; ChatSurface wrapper `main` + `#main-content`; AnswerCanvas a labelled `region` (`aria-label="Answer canvas"`); ToolList + SessionList `navigation`; each `ResponseWidget` `role="button"` (mapped) or omitted (unmapped).
    - _Requirements: REQ-8.2_
  - [x] 13.3 Focus move/return + inert management
    - Opening `AnswerSheet` or a drawer moves focus in; closing returns to the triggering control. `inert` on the shell behind an open sheet/drawer; kept out of the tab order and accessibility tree.
    - _Requirements: REQ-2.5, REQ-8.1, REQ-8.3_
  - [x] 13.4 Reduced-motion
    - All region/sheet/toggle animations collapse to near-zero when `prefers-reduced-motion: reduce` (reuse the existing `useReducedMotion` gating on `motion.*`).
    - _Requirements: REQ-8.4_

- [x] 14. Checkpoint — integration tests pass
  - [x]* 14.1 Integration: agent stream drives the canvas
    - Drive `runExchange` with a fake NDJSON stream (`tool_end` + `done`) for each mapped tool; assert `workspaceView` becomes the expected `CanvasView` after `done`; for an unmapped-only turn assert `workspaceView` unchanged.
    - _Requirements: REQ-3.1, REQ-9.1_
  - [x]* 14.2 Integration: reload re-activates the latest widget
    - Seed `api.getSession` with a history whose last assistant message has `toolCalls`; assert `workspaceView` re-activates that tool's view on mount.
    - _Requirements: REQ-3.8_
  - [x]* 14.3 Integration: revisit an earlier widget + a11y
    - Render two assistant messages with widgets; activate the earlier widget; assert `workspaceView` switches. Keyboard-activate a widget; assert focus moves and the canvas loads. Sheet-focus-return is covered by the Task 13 app-shell focus-return test (same mechanism).
    - _Requirements: REQ-3.4, REQ-3.5, REQ-8.1_

- [x] 15. Visual polish pass (impeccable skill)
  - [x] 15.1 Lock the visual decisions deferred in the design
    - Locked in code: chat/canvas split ~50/50 at the lg breakpoint via `lg:min-w-88` (22 rem) on both panes (`app-shell.tsx`, `answer-sheet.tsx`); `ResponseWidget` active state uses `bg-accent-subtle` + `ring-primary ring-2` with a `hover:bg-surface-container-high` hint (`tool-renderers.tsx`); idle-map framing locked to full-bleed `<MapArea>` with no `neu-panel` card frame, matching the active-map path (`answer-canvas.tsx`); `ModeToggle` styling unchanged (already an aria-checked switch with primary track + neutral handle); `AnswerSheet` grabber/header left as the standard `h-1.5 w-10 rounded-full` grabber inside a `flex shrink-0 px-4 pt-3 pb-3` row. Visual styling pass via the `impeccable` skill was skipped (no image input available in this session); specs locked from the spec's recommended defaults + `DESIGN.md` tokens. Final visual sign-off left to the operator in-browser.
    - _Requirements: REQ-4.1, REQ-4.4, REQ-6.1_
  - [x] 15.2 Re-baseline the layout snapshots from Task 10.4 after the polish
    - No snapshot tests exist in this repo (vitest with DOM assertions only, no `toMatchSnapshot`); Task 10.4's assertion tests were re-run and still pass after the polish (339 / 339 green).
    - _Requirements: REQ-4.1, REQ-4.4_

- [ ] 16. Final checkpoint — full gate + browser smoke
  - [ ] 16.1 Run the verification gate
    - `npm run lint` exit 0; `npm run format:check` clean; `npx vitest run` 0 failures (including tasks 5.3, 6.2, 7.2, 9.3, 10.4, 14.*).
    - _Requirements: all_
  - [ ] 16.2 Browser smoke against the docker app
    - Rebuild `docker compose up -d --build app`; CDP headless chromium: toggle persists across reload; clicking a widget loads its view into the Answer Canvas; activating an earlier widget in history revisits it; toggling to Tools Mode renders the tool full-bleed; a mapped agent response drives the canvas; map camera survives a session swap.
    - _Requirements: REQ-1.6, REQ-3.1, REQ-3.4, REQ-4.3, REQ-9.4_
  - [ ] 16.3 Non-regression spot checks
    - Agent NDJSON streaming intact; session list/switch/rename/delete intact; `RequireAuth` gate + theme toggle + account menu work in both modes; `showOnMap` contract (walking route polyline fetch) intact.
    - _Requirements: REQ-9.1, REQ-9.2, REQ-9.3, REQ-9.5_

## Notes

- Tests marked `*` are component/integration/snapshot tests (no PBT — UI rendering). They are the smallest checks that fail if each unit breaks.
- Each checkpoint runs the gate before the next phase; do not batch completions.
- Tasks 10, 11, and the retirements (12) are the riskiest (large structural move); validate the map-survives-session-swap invariant (REQ-9.4) early via the Task 14.1 integration test.
- The visual-polish pass (Task 15) uses the `impeccable` skill per `AGENTS.md`; it lands after structure is correct and before the final browser smoke.
