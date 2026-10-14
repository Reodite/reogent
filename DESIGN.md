---
name: Reodite
description: AI campus assistant with whisper-neumorphic surfaces
colors:
  background: "#f7f7f5"
  surface: "#fafafa"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f3f3f5"
  surface-container: "#ededef"
  surface-container-high: "#e6e6e8"
  surface-bright: "#ffffff"
  primary: "#4a4e7a"
  primary-container: "#7a7ea8"
  secondary: "#2d6b47"
  secondary-container: "#b0efc2"
  tertiary: "#7a5733"
  tertiary-container: "#f4e3cf"
  error: "#9c4040"
  error-container: "#ffdad6"
  on-surface: "#18191b"
  on-surface-variant: "#3e4348"
  muted: "#5a6066"
  outline: "#6e747a"
  outline-variant: "#bfc4c9"
  border: "#d9d9dd"
  border-subtle: "#e8e8ea"
  accent-subtle: "#edeef5"
  surface-tint: "#4a4e7a"
  on-primary: "#ffffff"
  on-primary-container: "#0f1128"
  on-secondary: "#ffffff"
  on-secondary-container: "#001f0e"
  on-tertiary-container: "#4a3010"
  on-error-container: "#6e2c2c"
  scrim: "rgba(0, 0, 0, 0.3)"
  course-cornflower: "#6ea8fe"
  course-tangerine: "#ffb46b"
  course-jade: "#62d2a2"
  course-orchid: "#e886c9"
  course-amber: "#ffd166"
  course-ice: "#7ee0e6"
  course-lavender: "#b69cff"
  course-pear: "#9bd356"
  course-salmon: "#ff8f8f"
  course-lagoon: "#5fd0c0"
  course-pink-quartz: "#f3a6ff"
  course-sandstone: "#d9c79b"
typography:
  body:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  body-sm:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  display:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  caption:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  avatar:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Commit Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-primary-large:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xl}"
    padding: "0 32px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-back:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "0"
    height: "44px"
    width: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "36px"
  mobile-mode-tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.lg}"
    height: "60px"
  mobile-mode-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.lg}"
    height: "60px"
---

# Design System: Reodite

## Overview

**Creative North Star: "The Whisper Instrument"**

Use neutral surfaces, restrained neumorphic depth, and muted indigo for actions and active states. Mobile pages stay flat and edge-to-edge. Keep larger type, blur reveals, and expressive entrances on the landing page.

**Key Characteristics:**

- Raised controls, recessed fields, and flat content.
- Shared spacing, typography, and corner geometry.
- Visible loading, failure, selection, and keyboard-focus states.

The frontmatter supplies tokens for design tools. Runtime colors come from `src/shared/color-tokens.ts`; `app/globals.css` owns typography utilities, material recipes, and motion. Keep `.impeccable/design.json` synchronized with this document. Shell and schedule details belong in their [shell brief](.impeccable/surfaces/src-components-shell-app-shell-tsx.md) and [schedule brief](.impeccable/surfaces/src-components-schedule-schedule-app-tsx.md).

## Colors

### Primary

Use Muted Indigo for actions, links, focus, and selected states. Use its container for bounded identity elements. Do not use primary color as a large decorative background.

### Secondary and tertiary

Campus Verdant marks success feedback; persistent requirements and progress use primary or neutral treatments. Warm Bark marks warnings. Errors use the error family. Preserve the calendar's category tokens rather than substituting generic status colors.

### Neutral

Use `background` for the page, `surface` for raised content, and the container steps for nested wells and interaction states. Keep adjacent steps distinct; dark surface steps remain neutral and differ by at least five per RGB channel. `border` defines visible dividers; `border-subtle` serves interior hairlines and the sanctioned button/glass edges.

Use `on-surface` for primary text, `on-surface-variant` for secondary text, and `muted` for metadata and placeholders. Do not use `outline` or `outline-variant` as text colors. Preserve AA text contrast in both themes. Background tints may use opacity modifiers; text and borders retain their specified contrast.

Schedules derive a stable identity color from the normalized course code. Preserve the 12-color course palette, 1px edge, and low-opacity surface mix. Labels use theme text tokens; conflict rings, participant identities, and the current-time marker remain separate. Planner and sharer normalize campus suffixes before assigning colors.

## Typography

**Display Font:** Aspekta Variable, with the frontmatter's system sans fallbacks.

**Mono Font:** Commit Mono, with system monospace fallbacks.

| Role       | Size / line height   | Weight     | Use                                        |
| ---------- | -------------------- | ---------- | ------------------------------------------ |
| Title      | 20px / 25px, -0.02em | 500        | Workspace/auth titles, recovery, greetings |
| Section    | 16px / 24px, -0.01em | 500        | Dialog, chat, and Answer Canvas headings   |
| Subsection | 14px / 20px          | 500        | Dense panel headings                       |
| Body       | 14px / 20px          | 400        | UI text and control labels                 |
| Body small | 13px / 1.5           | 400        | Supporting text                            |
| Caption    | 12px / 16px          | 400 or 500 | Metadata and field labels                  |
| Avatar     | 11px / 1.4           | 500        | Single initials in 28px avatars            |

Use `Heading` for application headings; choose the HTML level separately from the visual size. Chat prose uses relaxed leading, and assistant Markdown uses 1.65. Phone text-entry controls use 16px to avoid focus zoom; drawer labels use 16px/24px. Keep the wordmark's -0.025em tracking.

Use mono for structured values in tool results and message formatting. Degree Planner and Schedule use Aspekta throughout, including course identifiers. Use weight 500 for emphasis, 550 for Markdown headings, and at most 600 for strong text, table headers, and list markers. Uppercase tracking belongs to session groups and collapsed rail labels.

Landing headings use the 36/48/60px responsive scale, 1.05 leading, and -0.035em tracking. Section headings use 24/30px. Keep the sticky header in document flow, let its groups wrap, and reserve anchor clearance for the skip link. The hero keeps 32px vertical padding and a viewport-minus-header minimum without clipping short screens.

## Layout

- Below 640px, remove outer page gutters, radii, and shadows. Primary canvases fill the width; headers, notices, switches, and command groups retain 16px side insets. Contained cards and overlays keep their own geometry.
- From 640px, retain 12px shell gutters and raised workspace panels. AI/Unity use the persistent sidebar from 1024px; Tools waits until 1280px. Below those thresholds, use the drawer.
- `WorkspacePage` owns 24px wide/16px compact spacing, 16px region gaps, the optional 20rem rail, and the 55rem rail/canvas threshold. Keep the heading/navigation fixed while short viewports scroll the toolbar and content below. Preserve the 20rem content floor and feature-specific minima.
- Keep one owner for each gap and scroll region. Use 4px between a title and support text, 8–16px within a group, and 16–24px between sections. Fields retain a 6px label/control gap. Omit empty metadata and feedback regions.
- Use the shell's reported visual viewport at normal scale; preserve native pinch zoom. The shell owns top/side safe areas and the signed-in bottom mode bar owns the bottom safe area. Guests have no mode bar, so the shell owns their bottom inset. Independent overlays keep their own safe padding; the composer retains 12px above the bar without adding another bottom safe area.
- Match loading and loaded frames. Keep usable navigation outside pending-only inert regions, including when an implementation chunk is still loading.

The shell brief owns sidebar widths, pane floors, mode restoration, drawer geometry, focus return, and Answer Sheet behavior. Preserve those contracts rather than introducing a second mobile component tree.

Keep the landing page at `/` and the logo linked there. Chat starts at `/app`; Tools and Unity live under `/app/tools` and `/app/pulse`. Utility routes `/app/settings`, `/app/account`, and `/app/about` retain the prior mode and cached destination without marking an unrelated tool current. Guests retain Tools navigation and the account menu without mode controls. Keep native links, modified-click behavior, and browser Back restoration.

## Elevation & Depth

Use the existing CSS recipes. Do not copy literal shadows into feature components.

| Treatment                    | Use                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| `.neu-panel`, `.neu-raised`  | Shared raised material using `--neu-surface-shadow`           |
| `.neu-inset`                 | Fields and wells using `--neu-inset-shadow`                   |
| `shadow-sm/md/lg/inset/glow` | Existing one-off utility elevation                            |
| `.chat-message-well`         | Directional inset for the wider-screen chat scroller          |
| `.glass-neu`                 | Floating overlays: 12px blur, subtle border, soft drop shadow |

Keep utility elevation and composed material separate on an element. Raised and inset recipes use the same contextual dark/light primitives, with the light source at the upper left. Phone page frames and primary workspace canvases stay flat.

`npm run colors:generate` derives the shadow/highlight pairs by adjusting marked surface channels by -15%/+15%. Select the parent material with `.neu-shadow-on-<token>`; preserve the generated fallbacks and theme weights. Translucent scrims and mixed course tints do not receive surface pairs.

Only `.neu-button` and `.glass-neu` add their specified subtle borders to composed material. Glass falls back to a solid surface without backdrop-filter support. Use glass for overlays, not decorative panels. Primary-button presses use the contextual inset recipe, not a colored glow. Preserve existing shared-control transitions; measure repaint cost before adding shadow animation elsewhere.

## Shapes

| Role                                                     | Radius |
| -------------------------------------------------------- | ------ |
| Peer workspace panels/canvases, dialogs, sheets          | 16px   |
| Phone page frames and primary canvases                   | 0      |
| Ordinary actions, fields, rows, segmented-control frames | 8px    |
| Large auth/marketing actions and floating map frames     | 12px   |
| Independent compact details and badges                   | 6px    |
| Pills and avatars                                        | Full   |
| Landing product-mock outer frame                         | 28px   |

Keep user bubbles at `16px 16px 5px 16px` and assistant bubbles at `16px 16px 16px 5px`. Independent cards, fields, avatars, and offset panels keep their own geometry.

### Concentric contours and optical anchors

For close parallel corners, subtract the border-box inset from the outer radius. Include borders and padding, but not shadows or focus rings.

| Contour                                       | Outer / inset / inner |
| --------------------------------------------- | --------------------- |
| Expanded navigation well and row              | 16 / 8 / 8px          |
| Collapsed navigation well and row             | 12 / 4 / 8px          |
| Workspace, prerequisite, and term segments    | 8 / 4 / 4px           |
| Timetable canvas and frame                    | 16 / 2 / 14px         |
| Timetable frame and scroll field              | 14 / 2 / 12px         |
| Timetable day strip and selection             | 12 / 4 / 8px          |
| Single-line composer and action, phone        | 16 / 6 / 10px         |
| Single-line composer and action, wider screen | 16 / 10 / 6px         |

Center leading controls on the 28px workspace title anchor without shrinking their targets. Plain rail content and discovery searches share the header's 16px inset; dense list bodies retain their explicit 8px variant. Match loading-field positions and responsive heights. Check computed bounds alongside original-scale screenshots before adjusting alignment.

## Components

### Shared primitives

Use the components in `src/components/ui/` rather than restyling equivalent controls:

- `Button`/`ButtonLink` own action variants, sizes, disabled states, and focus. `InlineAction` handles compact text actions; `RetryAlert` handles retryable failures. Keep links, radios, tabs, and navigation on their native contracts.
- `TextInput`, `SelectInput`, `SearchInput`, `Field`, and `Checkbox` own field material and labels. Search has 44px primary and 36px desktop/44px phone rail density. Keep label actions outside the label and connect help/error text with `aria-describedby`.
- `WorkspacePage`, `WorkspaceRail`, `WorkspacePanel`, and `WorkspaceCanvas` own page geometry. Feature components supply content. Keep context-aware header navigation and toolbar outlets in `WorkspaceHostContext`.
- `DialogPanel`, `DialogHeader`, and `DialogActions` own modal framing. Use 16px compact/24px desktop padding, 8px action gaps, and 24px section separation. Callers choose initial and fallback return-focus targets.
- `InfoChip` shows noninteractive facts. Use caution for required choices and error for conflicts/skipped input; keep domain identity colors separate.

### Actions and fields

Ordinary controls have 8px corners. Shared buttons retain 36px desktop/44px phone targets; compact controls retain 32px desktop, field companions 44px, and large actions 48px with 12px corners. Primary and secondary buttons use contextual raised/inset states; press feedback scales without translating the control. Ghost actions have no resting shadow or border. Disabled buttons use native disabled behavior and suppress hover/press feedback.

Back actions retain a 44px square ghost target, 20px arrow, destination-specific accessible name/title, and visible focus. Keep route-level back controls above scrollers and panel-level controls in their headers.

The single-line composer has a 44px field inside a 56px well. Phone text uses 16px/24px with 10px block padding; wider screens use 14px/20px with 12px padding. Send/Stop targets are 44px on phones and 36px on wider screens, with the concentric corners above. Multiline input grows to 96px; preserve the 18px outer/16px inner thinking ring.

Suggestion pills wrap within the available width and keep a 44px minimum. Mapped tool badges use outline pill buttons with `aria-pressed`, 32px desktop/44px phone minima, and the active primary ring. Unmapped badges remain static; preserve primary/error tints and accessible failure text.

### Appearance and sound

Use one intrinsic-width Light/Dark pill with sun/moon icons, two equal tracks, a 2px gap, and 4px padding. Compact radios retain 44px phone/32px wider-screen circles, giving the group 98px/74px widths. Onboarding uses labeled 44px-high segments. Let the account popup's Appearance row wrap rather than shrink the radios. Preserve arrow-key selection and roving focus. Apply the theme immediately with the 400ms ripple; reduced-motion users and browsers without view transitions switch immediately.

Reuse `AudioVolumeControl` in onboarding and Settings. Keep the native range at 0–100% in 10% steps, eleven marks, and visible 0%, 50%, and 100% labels. Use a 44px-high input, 24px circular thumb, and 4px track, with primary selected fill and neutral unselected marks. Retain the Volume label, visible focus, and accessible current percentage without another visual readout. Preview crossed marks and repeat the current mark on selection; keep 0% silent.

Settings places the slider after Appearance and a thin divider, followed by Navigation and Bot noises. Keep Sound as the region's accessible name without a visible subheading, descriptions, or separate mute/preview controls. Use flat 44px rows, 14px clickable labels, and native checkboxes with switch semantics. Switches retain a 44×36px input target, 44×24px pill track, 20px thumb, primary active state, and visible keyboard focus.

Use one action cue per activation, including keyboard input. Page changes use the percussive navigation cue; local Back uses a lower impact. Pair expansion/collapse with rising/falling sweeps and toggles with opposing latch sounds. Keep dedicated drag, drop, selection, deletion, map, and agent cues without a generic click underneath. Hover, focus, typing, and cancelled gestures stay silent. Audio supplements visible feedback; [PRODUCT.md](PRODUCT.md#sound-feedback) owns persistence and exchange lifecycle rules.

### Loading, failures, and state

Use `Skeleton`, `SkeletonGroup`, and the existing text/list/field compositions. Announce one loading label and hide decorative placeholders. Retain page padding, headers, grids, feedback rows, and footer geometry. Use the list's 16px inset only when the parent does not already supply it.

Keep usable data during refresh and distinguish failure from successful empty content. Sending, saving, importing, routing, and redirects use progress labels. Loading dialogs retain real cancellation and keyboard dismissal. Do not replace a form during save or retain obsolete route/group/search content for an exit animation.

### Motion and resource lifetime

| Motion                           | Contract                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| Overlay presence                 | 220ms entry, 140ms exit; interrupted motion continues from current styles |
| Disclosure                       | 240ms expansion, 160ms collapse; preserve caller-owned values             |
| Content / notice / chart arrival | 180ms opacity / 200ms local feedback / 320ms bar reveal                   |
| Phone mode indicator             | 280ms transform; navigation content changes without waiting               |
| Answer Sheet                     | 300ms translate/opacity; retain height and drag handle through exit       |
| Chat messages                    | Spring stiffness 400, damping 25; 6px entrance                            |
| Drags / tool badges              | Existing springs: 300/30 and 500/30 respectively                          |
| Theme ripple                     | 400ms clip-path expansion                                                 |
| Thinking border / orb            | 2.4s / 1.15s loops, stopped under reduced motion                          |

Use `--neu-ease` for CSS transitions and existing shared presence/disclosure utilities. Wrap conditional overlays in `AnimatePresence` outside the condition; a lazy form and its fallback share one presence unit. Closing controls become inert immediately, while focus/inert/scroll ownership releases at logical close. Defer synchronous removal until the presence parent registers it.

Keep focus immediate during disclosure, then reveal the same control after layout settles. Cancel delayed alignment on input, scrolling, focus departure, close, or unmount. Native details use 240ms size/160ms opacity where supported and a 200ms intro fallback. Sources align after their disclosure finishes. Do not replay arrival motion on streamed text or animate browser-driven viewport sizing.

Reduced-motion users receive immediate state changes: disable spatial exits and loops, collapse CSS animation durations, and retain visible focus. Landing-only effects include 420ms scroll reveals, 12px blur entrances, 30s texture drift, and its existing parallax and 80–120/18–20 springs.

### Performance

Measure the same production route, viewport, workload, and network conditions before claiming improvement. Include initial transfer/evaluation, selected-tool first use, and resource retention after repeated navigation.

Keep navigation and pane metadata available without loading inactive implementations. Use stable lazy boundaries with matched loading/recovery frames and preserve direct URLs, state callbacks, and supported prerendering. Reuse public requests within explicit freshness and account boundaries; failures must permit retry.

Give readers, timers, requests, subscriptions, animation frames, and map resources one owner. Cancel superseded work and clean up when the owner disposes. Hiding an intentionally mounted canvas does not authorize discarding its form, camera, or scroll state. Preserve text-delta batching, reduced motion, Stop, and Retry. Add preloading, memoization, or virtualization only for a measured cost, without dropping content or keyboard access.

### Accessibility

- Minimum active hit area: 32px; retain the larger component sizes above. Keep back buttons 44px with 20px arrows.
- Preserve visible keyboard focus. Use inset paint on edge-to-edge scrollers and 4px vertical scroll clearance in workspaces. Do not clip focus inside disclosure masks.
- Keep modal traversal and return focus limited to visible, enabled elements, including native summaries; exclude inert and aria-hidden content. Restore a visible fallback if deletion or responsive layout removes the trigger.
- Preserve nested drawer/account Escape and Tab behavior, shared body-scroll ownership, and out-of-order modal closure. Background updates must not steal focus.
- Keep labels, error associations, loading announcements, and source links accessible. Verify physical-device and assistive-technology behavior separately from browser emulation.

### Feature contracts

**Calendar:** Keep the 20rem Upcoming rail, month toolbar, and legend. Upcoming opens first in compact view. The seven-column month retains a 36rem width and 6rem compact/8rem wide week minima. Compact day cells use 44px agenda actions. Preserve cursor/filter cache keys, explicit refresh/retry, stale-response rejection, and distinct empty/error states.

**Course lookup:** Keep search, session, sort, and inline filters above one results canvas. Exact codes use structured lookup; filter changes update results directly. Preserve pagination and stale/error states for signed-in and guest browsing. Detail routes at `/app/tools/courses/:code` keep header-level Back and Session controls. Results retain a 16rem minimum; grade charts use a named horizontal scroller with a 16rem inner axis/plot row, fixed 112px plot, and count footer outside that minimum.

**Prerequisites:** Keep search, Show, and Outline/Map controls above a stable canvas. Use equal-width, unwrapped view labels with 44px targets. Below 40rem, open Outline; otherwise open Map with the existing zoom floor. Clearing search returns to guidance; an empty prerequisite set remains a complete result. Preserve rooted `/app/tools/prereq/:code` URLs, Back navigation, choice state, body-portaled suggestions, and Outline fallback on graph failure. Embedded search stays below the titlebar with 16px side insets and an 8px result gap. Graph wrappers/edges stay outside the tab order; explicit controls own focus.

**Degree planner:** Keep equal 320px Requirements/Find Courses rail regions and the scrollable year board. Terms retain a 16rem minimum, 9rem course viewport, and 18rem year-column minimum. Summer expansion uses the existing 300ms region animation; reduced motion updates immediately. Course chips keep two rows, 8px horizontal/4px vertical padding, labeled actions, native destination selectors, and unchanged undo/drag semantics. Hide the source row during drag, reuse its geometry for an inert ghost, and remove it after a successful drop. Use Aspekta throughout. Requirement controls keep 36px checkbox geometry, textual completion distinctions, 50% automatic-check opacity, sticky year headings, and unwrapped credit totals. Compact additions return to Plan.

**Schedules:** Follow the schedule brief for `/app/tools/schedule` and `/app/pulse/schedule` behavior, grid geometry, imports, notifications, and responsive state. Preserve read-only sharer details and explicit planner selection; use Aspekta throughout.

**Map:** Tools uses a 20rem Explore rail; AI uses the full-bleed Answer Canvas map and transient building popup. Compact Explore uses the existing nonmodal sheet with a 64px handle, 120px top clearance, and a route-summary peek. Keep attribution clearance tied to that sheet height. Discovery uses Saved/curated rows; building detail headers stay fixed over one scroller. Reset scroll on a new building, not same-building updates. Preserve source-specific freshness, source links, official image fallback, and the distinction between descriptions and live availability.

Directions use two editable fields in one scrolling region; selecting a result commits and removes the suggestion list. Preserve 44px compact map controls, inherited map clipping, and zoom-frame corners. Walking routes retain the 0.2m offset, 9px/5px visible strokes, and 9px alpha-77 occluded stroke with their existing depth tests and label ordering. Entrance markers use verified current points projected within 4m of footprint segments; show all valid markers from zoom 16 and selected-building markers at its focused camera. Preserve the existing ground/door geometry and depth bias. Missing or ambiguous evidence produces no marker or accessibility claim.

**Chat and Markdown:** Reuse `ChatFrame`, `ChatComposerFrame`, and `AssistantIdentity`. Keep the named keyboard-scrollable message region, 60px header, and fixed composer. Preserve GFM and source attribution. Sources stay outside prose spacing, with an 8px top gap, 6px rows, and 256px bound. Task-list checkboxes remain read-only and inline with their text. Follow the existing prose stylesheet rather than inventing another Markdown theme.

**Onboarding:** `/onboarding` presents Welcome, About you, and Preferences one card at a time, with a named progress list and focus on the current heading. Reuse `ProfileFields`, `ThemeToggle`, and `AudioVolumeControl`. Keep Next/Back drafts, Skip, retry feedback, and optional fields. Disable save actions during submission and remove spatial transitions under reduced motion.

**Account and Settings:** Use one shared workspace and inset canvas with a centered, readable column. Account separates identity, Student profile, and Activity with thin rules and stacks definition-list fields on phones. Open Edit profile in place after loading; Cancel discards the draft. Saving retains values and disables fields and Cancel. Preserve completion state and retry failures; restore focus to Edit profile after success without taking it from another control. Keep Sign out available during loading/recovery and show guests a sign-in prompt without fetching private details. Settings contains Appearance and Sound, with profile editing on Account. Match loading and loaded insets.

**About and account popup:** About uses The creators subtitle, two raised 16px-radius cards with square initial placeholders, linked-name footers with 8px insets, and the coffee link below. The nonmodal account popup starts with Appearance, then General links to Settings, Account, and About, followed by Version. Keep About outside Unity, nested Escape/Tab dismissal, and Sign out on Account.

**Announcements:** Place the feed first in Unity navigation. Use dated full-card links to `/app/pulse/announcements/:slug`, a readable article column, and a named Back to Announcements control. Keep wide Markdown tables and code keyboard-scrollable, preserve visible focus, and omit raw HTML.

**Pulse:** Retain native 44px Agree/Disagree controls alongside swipe. Follow horizontal pointer movement and use the directional 220ms swish only after a committed vote. Return incomplete drags without sound; cancelled gestures remain silent. Preserve vertical touch scrolling and reduced-motion voting without spatial travel.

## Do's and Don'ts

### Do:

- **Do** reuse shared components, material recipes, and the applicable surface brief.
- **Do** preserve the 32px minimum, larger documented targets, 44px back controls, and visible keyboard focus.
- **Do** keep mobile main views flat and preserve independent card/overlay roles.
- **Do** match loading geometry, distinguish empty/error states, and retain user-owned state.
- **Do** measure loading and resource cleanup before claiming a performance improvement.
- **Do** update design metadata with changes to its source guidance.

### Don't:

- **Don't** duplicate component styling, token values, or surface instructions in another document.
- **Don't** use outline colors for text, large decorative primary fills, or weights above 600.
- **Don't** mix utility and composed shadows on one element or add decorative glass to page content.
- **Don't** move buttons on hover, retain obsolete content for an animation, or animate viewport resizing.
- **Don't** discard mounted workspace state, weaken accessibility, truncate content, or bypass freshness checks for a performance result.
