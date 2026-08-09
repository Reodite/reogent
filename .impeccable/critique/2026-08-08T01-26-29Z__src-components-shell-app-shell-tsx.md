---
target: app shell + full interface
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-08-08T01-26-29Z
slug: src-components-shell-app-shell-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 4 | Streaming text, thinking orb, tool spinners, 8s slow-response escalation. Best-in-class agentic chat feedback. |
| 2 | Match System / Real World | 3 | Humanized tool labels, UBC-specific suggestions. "Reogent" brand name has no semantic signal for new students. |
| 3 | User Control and Freedom | 2 | Sidebar/map dismissible. Missing: no cancel in-flight, no session delete/rename, no edit-last-message. |
| 4 | Consistency and Standards | 3 | Shadow tiers, radii, color roles consistent. Deviation: "New conversation" h-10 vs session items h-9; map rail 52px vs sidebar rail 60px. |
| 5 | Error Prevention | 3 | Send locked during flight, empty-check, safe-area insets. No user-facing "stop generating" affordance. |
| 6 | Recognition Rather Than Recall | 3 | Session titles, active highlight, tool labels. No session search; old conversations become scroll-buried. |
| 7 | Flexibility and Efficiency | 2 | Enter/Escape/Shift+Enter. No keyboard shortcut discovery, no session search, no slash commands. |
| 8 | Aesthetic and Minimalist Design | 3 | Neumorphic language cohesive. Assistant avatar repeats on every message (vertical cost). "AI can make mistakes" is permanent noise. |
| 9 | Error Recovery | 3 | Retry preserves state, session load failure offers two paths, map fallback text. No edit-and-resend. |
| 10 | Help and Documentation | 2 | Empty state explains capability, suggestion pills. No help menu, no contextual hints after first message. |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: The system is authored for this product. The neumorphic depth vocabulary, the agent-triggered visual pane, the asymmetric bubble radii, and the tool interstitial blocks are all product-specific decisions that could not be transplanted to a generic chat app. The muted indigo palette is institutional without being corporate.

**Deterministic scan**: 7 findings total. 5 are false positives (on the ignore list). 2 real findings in `app/api/preview/route.ts` (OG image route with dynamic src). Zero layout, color, or accessibility violations detected. The codebase is clean.

## Overall Impression

This is a well-built agentic chat with a coherent visual system. The neumorphic treatment is the right level of restraint. The layout architecture is sound. The biggest gap is user control: once a request is in flight, you're locked in. The second gap is spatial: the collapsed rail widths don't match (52px vs 60px), creating visual asymmetry on the shared grid row.

## What's Working

1. **Streaming/thinking model is production-grade.** Interstitial blocks, thinking orb, tool spinners, 8s escalation label. The rAF-batched text deltas prevent paint thrashing.
2. **Collapse/expand choreography is physical.** Staggered delays, --neu-ease overshoot, opacity-before-transform sequencing creates weight. Surfaces feel moved by the same hand.
3. **Map-as-reactive-output is architecturally sound.** Auto-opens on highlight, fallback text for WebGL failure, mergeMapHighlights consolidates multi-tool state.

## Priority Issues

### [P0] No cancel/stop for in-flight requests
- **Location**: chat-panel.tsx:244-253
- **Why**: Users wait up to 30 seconds with no escape. Multi-tool loops run 4-5 tools with no intervention. Mobile users between classes will close the tab.
- **Fix**: Add a "Stop generating" button that cancels the fetch and renders whatever text has streamed so far.
- **Suggested command**: `$impeccable harden`

### [P1] Collapsed rail width mismatch (52px map vs 60px sidebar)
- **Location**: globals.css:577 (shell-body: 3.75rem), globals.css:546 (chat-workspace: 3.25rem min)
- **Why**: On desktop, these rails are visually adjacent in the same grid row. The 8px difference reads as imprecision. "One material, shaped into different forms" requires matching proportions for equivalent structural elements.
- **Fix**: Align both to 3.75rem (60px) for visual symmetry. Adjust `chat-workspace` min-column to match.
- **Suggested command**: `$impeccable layout`

### [P2] Three button heights in the sidebar (40px/36px/32px)
- **Location**: session-sidebar.tsx:66-73 (h-10 new-conversation), :124 (h-9 session items), :108 (h-8 retry)
- **Why**: DESIGN.md specifies standard 36px, compact 32px, large 40-44px for mobile. "New conversation" is a desktop sidebar element using the large size without need. Breaks grid alignment.
- **Fix**: Change "New conversation" to h-9 (36px) to match session items. It already has primary color and icon for emphasis.
- **Suggested command**: `$impeccable layout`

### [P2] Border inside glass-neu-strong panel
- **Location**: chat-panel.tsx:272 (border-b on chat header bar)
- **Why**: DESIGN.md states: "No borders on neumorphic surfaces... Surfaces emerge from shadow." The hairline contradicts the system's own rules.
- **Fix**: Remove border-b. Use a subtle inset shadow or background-color difference to separate header from message well.
- **Suggested command**: `$impeccable polish`

### [P2] Assistant avatar repeats on every message
- **Location**: message.tsx:160-180
- **Why**: In a 1:1 conversation, the "R" badge + "Reogent" label on every response costs 28px vertical space per message. In 10 messages, that's 140px of repeated identity. WhatsApp doesn't show avatars on every consecutive bubble.
- **Fix**: Show avatar only on the first message in a consecutive assistant sequence, or only after a user message breaks the sequence.
- **Suggested command**: `$impeccable distill`

## Persona Red Flags

**Alex (power user, knows UBC)**: Will hit session management ceiling within days. No rename, search, delete, or pin. Wants Cmd+K for search, Cmd+N for new chat, up-arrow to edit. Notices the 42fr chat column feels tight for long course listings. No copy button on code blocks or tool results.

**Jordan (first-time student)**: "Reogent" communicates nothing. Two of three suggestion pills use building codes (IKB, ICCS) that a first-year doesn't know. If first response takes 20+ seconds (multi-tool), Jordan assumes it's broken — the "Still working" label helps but there's no step count or progress. No guided first steps.

**Casey (mobile, between classes)**: No cancel means Casey sends a query with 3 minutes before class, response takes 25 seconds, no abort option. Map button hidden at sm+ (640px), so an iPad in portrait loses the map entry point. The safe-area handling is correct.

## Minor Observations

- Scroll-to-bottom fires on every message count change including initial history load. Long history snaps to bottom with no opportunity to read earlier messages.
- The `New conversation` button uses `active:scale-[0.98] active:brightness-110` which is off the neumorphic press pattern (shadow inversion). Should use the standard `.neu-primary-button` active state.
- Map rail vertical text "Campus map" in `writing-mode: vertical-rl` with `text-xs tracking-[0.06em]` — the letter-spacing is 0.06em which is tight for vertical text. Readability could improve at 0.08-0.1em.
- Chat panel header title truncates with `truncate` but has no tooltip. Long session titles are unrecoverable.

## Questions to Consider

1. Is the map earning its 58% when no route is active? A blank UBC campus map is low-information. Should it auto-collapse when conversation moves to non-spatial topics?
2. Why does the assistant identity repeat on every message in a 1:1 conversation? Would grouping consecutive messages save vertical space and reduce noise?
3. The "one material" principle extends to proportions: should the map rail and sidebar rail be the same width, reinforcing that they're structural equivalents in different positions?
