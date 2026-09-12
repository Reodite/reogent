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
    padding: "8px 16px"
    height: "36px"
  button-primary-large:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xl}"
    padding: "12px 32px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
    minHeight: "44px"
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

Use restrained depth for controls, contained cards, and overlays. Keep mobile pages flat and edge-to-edge so students can use the available screen for their task. Raised actions, recessed inputs, and flat content share one neutral material. Use the smallest shadow that communicates a boundary.

Use small offsets (2-3px), soft blur (4-8px), and low opacity (4-6%) for composed shadows. Keep the light source at the upper left and use the same recipes across related controls.

Choose spacing, type, and radii from the documented scales. Keep app transitions brief and tied to interaction. Reserve larger type, spring entrances, and blur reveals for the landing page.

**Key Characteristics:**

- Restrained depth for controls and contained surfaces; flat mobile pages
- Minimal shadows with tiny offsets and near-transparent opacity
- Single-material coherence across all elements
- Precision and consistency as the aesthetic itself
- Muted indigo accent, used sparingly, always meaning "interactive"
- Content-forward: the neumorphic frame never competes with chat or map data
- Landing page permitted to be expressive; in-app is disciplined

## Colors

A cool-neutral palette anchored by muted indigo. Warmth comes from the off-white background, not from color. The indigo provides institutional distinction without corporate coldness.

### Primary

- **Muted Indigo** (`#4a4e7a`): Primary actions, focus rings, links, and state indicators. Appears on interactive elements only. Its rarity carries the meaning.
- **Indigo Container** (`#7a7ea8`): Avatar backgrounds, accent surfaces, badge backgrounds. Softer carrier for primary identity in larger areas.

### Secondary

- **Campus Verdant** (`#2d6b47`): Success states, route confirmation, positive feedback, tool result icons. Appears when the system confirms something went right. Reserved for transient confirmations (toasts, route completion) — never used as decorative state on persistent list items, cards, or borders; requirement/progress surfaces use primary and neutral treatments instead.
- **Verdant Container** (`#b0efc2`): Success backgrounds, route info cards, positive notification surfaces.

### Tertiary

- **Warm Bark** (`#7a5733`): Warning states, tertiary accents. Rare. Appears for caution.
- **Bark Container** (`#f4e3cf`): Warning backgrounds, warning cards in assistant messages.

### Neutral

- **Background** (`#f7f7f5`): Page ground. Flat color, no gradients in the app shell.
- **Surface** (`#fafafa`): Default elevated panels. Resting material for cards, chat panel, map panel, assistant bubbles.
- **Surface Container Low** (`#f3f3f5`): Recessed wells: sidebar body, chat message well, input backgrounds, tool detail blocks. Reads as pressed into the background.
- **Surface Container** (`#ededef`): Content wells, loading skeletons, inline code backgrounds, credit pills, hover backgrounds. One step darker for nesting.
- **Surface Container High** (`#e6e6e8`): Hover states, pressed backgrounds. Darkest interactive neutral surface.
- **Surface Bright** (`#ffffff`): Maximum elevation: tooltips, image placeholders. Pure white.
- **On Surface** (`#18191b`): Primary text. Near-black with warm undertone. >=7:1 on all surfaces.
- **On Surface Variant** (`#3e4348`): Secondary text, labels, descriptions, tool call summaries. >=4.5:1 on all light surfaces.
- **Muted** (`#5a6066`): Meta text, timestamps, placeholders, thinking block text, disclaimers. >=4.5:1 on all surfaces.
- **Border** (`#d9d9dd`): Standard dividers, section separators, hairlines between content, inline code borders.
- **Border Subtle** (`#e8e8ea`): Softest separators, button borders, `.glass-neu` edges, pre block borders.
- **Accent Subtle** (`#edeef5`): Active nav item background, user message bubble background. Palest indigo tint.

### Surface separation floors

Contrast between adjacent layers is part of the design, not an accident of it. Violating these floors makes cards dissolve into the page:

- Adjacent surface steps (background → surface → container-low → container → container-high) must stay visually distinct. Never assign two steps the same value; in dark theme each step differs by at least #05 per channel, and every step stays neutral gray — no hue drift.
- Every card, chip, or inset well sits exactly one step away from its parent surface. Nested elements on the same step read as one blob.
- `--border` must remain visible against `--surface` without squinting (dark: `#2c2c31` on `#1a1a1e`). `--border-subtle` is for interior hairlines only, never a card's outer edge.
- Dark-theme shadows and highlights are tonal: darker and lighter shades of the surface color itself (e.g. `#141417` / `#26262c` around `#1a1a1e`), never pure black or white. A shadow you cannot see is not a shadow, and a white glow breaks the monochrome.

### Course Identity Palette

Schedules assign each normalized course code one stable color from a 12-color palette: Cornflower (`#6ea8fe`), Tangerine (`#ffb46b`), Jade (`#62d2a2`), Orchid (`#e886c9`), Amber (`#ffd166`), Ice (`#7ee0e6`), Lavender (`#b69cff`), Pear (`#9bd356`), Salmon (`#ff8f8f`), Lagoon (`#5fd0c0`), Pink Quartz (`#f3a6ff`), and Sandstone (`#d9c79b`). Planner and sharer adapters normalize campus suffixes before hashing, so `CPSC_V 221` and `CPSC 221` keep the same identity.

Course colors appear as a 1px block edge and a low-opacity tint mixed with the active surface. Theme text tokens carry all labels; course color never carries status or required meaning. Conflict rings, participant avatars, and the current-time marker remain separate channels.

### Opacity Modifiers

Color tokens accept Tailwind opacity modifiers for layered effects:

- `bg-surface-container-low/60`: Session list well (layered transparency)
- `bg-secondary-container/15`: Success tool badges (tinted but not opaque)
- `bg-error-container/40`: Error tool badges, error banners
- `border-error/30`: Error state borders (softer than solid)
- `ring-primary/40`: Focus ring glow (semi-transparent)
- `hover:bg-error/10`: Destructive action hover (sign-out)
- `bg-outline/40`: Drag handles (subtle indicator)
- `bg-border-subtle/60`: Hairline dividers within grouped controls

### Named Rules

**The Muted-for-AA Rule.** All subdued text (placeholders, timestamps, metadata, captions) uses `--muted` (`#5a6066`). Never use `--outline` or `--outline-variant` for text. They fail WCAG AA contrast on light surfaces.

**The Indigo Scarcity Rule.** Primary indigo appears on interactive elements and active states. Never on decorative surfaces, background fills, or large areas. Its presence means "actionable" or "current state."

**The Opacity Layering Rule.** Use fractional opacity modifiers (`/15`, `/40`, `/60`) to create tinted surfaces that remain translucent to the layer beneath. Solid token colors for text and borders; opacity modifiers for background tints and state indicators.

**CSS-Only Tokens.** Several frontmatter tokens exist in `:root` and `[data-theme="dark"]` but are consumed only in CSS (never as Tailwind utilities in JSX): `surface-container-lowest` (`.assistant-markdown pre` background), `surface-tint` (same value as primary; reserved), `outline-variant` (available but unused). They remain in the system for completeness.

## Typography

**Display Font:** Aspekta Variable (with ui-sans-serif, system-ui fallback)
**Mono Font:** Commit Mono Variable (with ui-monospace, SF Mono, Menlo, Consolas fallback)

**Character:** Aspekta is a clean geometric sans, precise and legible at small sizes. Commit Mono is neutral and readable for structured identifiers. The pairing is workmanlike.

### In-App Hierarchy

- **Title** (500, 1.25rem/25px, -0.02em): Workspace and authentication page titles, recovery titles, and chat greetings. Use the shared Heading Title role.
- **Brand Title** (500, text-base, -0.025em): The "Reodite" wordmark in the sidebar brand header. Uses tighter tracking than standard Title.
- **Heading** (500, 1rem/24px, -0.01em): Section and dialog titles, chat session headings, and Answer Canvas titles. Use the shared Heading Section role. Dense panel headings use the 14px/20px Subsection role.
- **Body** (400, 0.875rem/20px): Default UI text and control labels. Inherit the Tailwind `text-sm` metrics at the body so unmarked text and explicit controls align. Chat bubbles and longer descriptions use `leading-relaxed` (1.625); assistant Markdown keeps its reading-specific 1.65 line height.
- **Body Small** (400, 0.8125rem/text-body-sm, 1.5): Secondary info, timestamps, tool badge content, sidebar session previews.
- **Caption** (400, 0.75rem/16px): Metadata and secondary facts. Field labels and group headings use medium weight at the same size and line height.
- **Avatar Monogram** (500, text-[0.6875rem]): 11px text for single-character avatar initials. Below caption scale; used exclusively in size-7 avatar containers.
- **Mono** (400, 0.8125rem/text-body-sm, 1.5): Course codes (`CPSC 110`), times (`14:30`), building codes (`ICCS`), inline code, tool parameters, dollar amounts. Structured identifiers render in mono.
- **Uppercase Label** (500, text-xs, tracking-[0.05em] or tracking-[0.06em]): Session group headers and collapsed-rail vertical labels. Positive tracking opens up small caps.

### Landing Page Scale

The landing page uses a larger, more expressive type scale:

- **Hero** (500, text-4xl → sm:text-5xl → lg:text-6xl, 1.05, -0.035em): Main headline.
- **Hero Subtitle** (400, text-base → sm:text-lg, relaxed): Directly below the headline. One step larger than Section Body.
- **Section Heading** (500, text-2xl → sm:text-3xl, -0.02em): Feature section titles.
- **Section Body** (400, text-sm → sm:text-base, relaxed): Feature descriptions. Some instances stay fixed at text-sm or text-base depending on context.

### Named Rules

**The Weight-Not-Bold Rule.** Emphasis uses weight 500-550. Weight 700+ never appears. Maximum is 600, reserved for markdown strong, table headers, and list markers.

**The Mono-for-Data Rule.** Tool renderers and message formatting use Commit Mono for structured identifiers: course codes, times, building codes, distances, and dollar amounts. Degree Planner and Schedule workspaces use Aspekta throughout, including course identifiers and metadata.

**The 14px-Base Rule.** Use 14px/20px for UI body text. Keep relaxed leading in conversation prose and longer descriptions. Phone text-entry controls use 16px to avoid focus zoom, and phone drawer labels use 16px/24px. Bottom mode labels retain the 12px Caption role.

**The Landing Exception Rule.** The landing page uses text-4xl through text-6xl, custom line-heights (1.05), and tighter tracking (-0.035em). These values are exclusive to the marketing surface and never appear in the app shell.

Keep the landing header sticky in document flow. Allow its navigation and action groups to wrap without shrinking the brand, logo, or controls. Give the hero 32px vertical padding and a minimum equal to the dynamic viewport minus the one-row header; wrapped headers and short-screen content may extend the document. Show the header mask only after scrolling. Keep the unfocused skip link outside pointer targeting, with native keyboard activation and anchor clearance below the sticky mask.

## Layout

Flexbox keeps the sidebar and outer workspace stable while destinations replace the content stage.

**Desktop:** AI and Unity show the persistent sidebar at 1024px; Tools shows it at 1280px to protect dense workspaces. The sidebar uses CSS width and content-padding transitions between 3.75rem (collapsed) and 17rem (expanded). The pre-hydration script applies the saved width before first paint. Reserve sidebar padding on the common Chat and Answer Canvas row. Calculate split percentages, pointer positions, and pane floors from its usable content box, preserving the 12px separator allocation. Keep each pane at least 18rem wide from 640px and 22rem from 1024px. Answer Canvas changes desktop geometry immediately and crossfades its contents so delayed flex animation cannot move the composer.

**Tablet:** Below each mode's persistent-sidebar breakpoint, the sidebar becomes a drawer with a backdrop. Chat and Answer Canvas share the workspace from 640px upward.

**Mobile (<640px):** Use the available dynamic viewport (`100dvh`) for Chat, Tools, Unity, and Settings. Remove the shell gutter and the outer page radius and shadow. Keep the main canvas flat and full-width; put 16px side insets on headers, view switches, and command groups. Preserve content padding inside lists, forms, and the degree board. Contextual rail panels become full-width sections with a hairline between stacked sections. Keep the 55rem container-based view switching and mounted state independent of this phone-only material change. From 640px upward, retain the 12px shell gutter and raised page panels.

Phones have a persistent AI, Tools, and Unity mode bar: 60px of icon-and-label navigation plus a hairline and the bottom safe area. Main content fills the space above it. Reserve top and side safe areas in the shell; avoid another bottom safe-area inset in the workspace, composer, or embedded Explore sheet. `useMobileViewport` sizes the live and loading shell to the browser's reported visual viewport at normal scale and exposes that height to the drawer and Answer Canvas. Pinch zoom retains the browser's layout behavior.

Place the 44px ghost menu button inside the shared route header. It has no resting card or shadow and reserves its own width. On phones, use 8px clearance from the usable left and top edges and an 8px gap to the title; keep the 44px hit target and title anchor unchanged. Keep it available during navigation loading while task controls remain inert. On phones, attach the drawer to the left edge at full visible height, with a maximum width of 20rem, at least 3rem of dismissal space, and 16px corners on its free edge. Retain the scrim at z-40 and drawer at z-50. Answer Canvas uses 80% of the reported viewport height with its own bottom safe area and the existing 20% drag threshold. Gate underlying mode links while a drawer or Answer Canvas modal is open.

**Spacing rhythm:** 8px grid with 6px sub-grid for tight icon gaps. Common values: `gap-1.5` (6px icon-to-label), `gap-2` (8px), `gap-2.5` (10px), `gap-3` (12px inter-panel), `gap-6` (24px message spacing). Panel padding: `p-2` (8px) sidebar outer, 12px shell gutters from 640px upward, `px-4 py-3` (16/12px) header sections, `p-4 sm:p-6` (16/24px) chat message content. Mobile main canvases have no outer gutter; headers and commands keep their own 16px insets. Chat and Answer Canvas headers and expanded sidebar brand rows use a 60px band, with `items-center px-4` on panels and `px-2` inside the expanded sidebar. The collapsed sidebar has a 48px visible rail and a 48px brand row: center its 36px logo tile with 6px clearance. Reserve 60px for the rail plus its 12px content gap. The expanded sidebar is 272px wide with a 284px content offset.

**Canvas treatment:** `app-shell-canvas` uses `var(--background)`. The authenticated `app-shell-frame` uses `var(--surface)` below 640px so safe areas, headers, and full-width content share one flat page. Keep gradients out of the production app shell.

## Elevation & Depth

Two tiers of shadow share one defining characteristic: extreme subtlety. Shadows function as a whisper, not a statement.

### Generated surface color pairs

`src/shared/color-tokens.ts` marks each opaque theme color that can sit beneath a neumorphic surface. Run `npm run colors:generate` to write a dark and light pair for each marked color into `app/theme-colors.generated.css`. The generator follows the [reference formula](https://github.com/adamgiebl/neumorphism/blob/master/src/Configuration.js): it adjusts each RGB channel by -15% or +15%, rounds the result, and clamps it to the 8-bit range.

Pair names follow `--neu-<parent-token>-dark` and `--neu-<parent-token>-light`. Choose the pair for the material under the element. For example, a panel raised above `--background` uses the `--neu-background-*` pair, while a control raised inside `--surface` uses the `--neu-surface-*` pair.

The generated colors are raw tonal endpoints. Apply `.neu-shadow-on-<parent-token>` to select a pair for an element and its descendants. Each utility provides precomputed RGBA fallbacks, then replaces them with `color-mix()` inside a feature query. The utility blends the pair through `--neu-context-shadow-weight`, `--neu-context-highlight-weight`, and `--neu-context-deep-weight`, then the composed recipes below provide blur and offset. Unmarked elements retain the default shadow primitives. Translucent scrims, mixed course tints, borders, and text colors do not receive pairs because their visible backdrop depends on composition or they cannot host nested surfaces.

### Tier 1: Utility Elevation (Tailwind-mapped)

Quick-assignment shadows via Tailwind `shadow-*` utilities. Very light, barely visible.

| Token               | Light Value                                                                            | Purpose                    |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| `--elevation-sm`    | `2px 2px 4px rgba(174,174,174,0.04), -1px -1px 3px rgba(255,255,255,0.25)`             | Small controls at rest     |
| `--elevation-md`    | `3px 3px 7px rgba(174,174,174,0.05), -2px -2px 5px rgba(255,255,255,0.3)`              | Tooltips, hovered controls |
| `--elevation-lg`    | `4px 4px 10px rgba(174,174,174,0.06), -3px -3px 8px rgba(255,255,255,0.35)`            | Modals, dropdowns          |
| `--elevation-inset` | `inset 1px 1px 3px rgba(174,174,174,0.05), inset -1px -1px 3px rgba(255,255,255,0.22)` | Recessed inputs, wells     |
| `--elevation-glow`  | `0 2px 8px rgba(74,78,122,0.1)`                                                        | Standalone glow utility    |

### Tier 2: Composed Neumorphic (CSS classes)

Single unified shadow recipe applied through `.neu-*` classes. All composed surfaces share the same shadow — panel and raised are identical. Differentiation comes from background color, not shadow weight.

**Primitives:**

| Primitive           | Light                     | Dark                  |
| ------------------- | ------------------------- | --------------------- |
| `--neu-highlight`   | `rgba(255,255,255,0.2)`   | `rgba(38,38,44,0.55)` |
| `--neu-shadow`      | `rgba(105,112,116,0.045)` | `rgba(16,16,19,0.55)` |
| `--neu-shadow-deep` | `rgba(91,99,104,0.06)`    | `rgba(10,10,12,0.65)` |

**Composed shadows:**

| Recipe                 | Value                                                                           | Use                                           |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `--neu-surface-shadow` | `3px 3px 8px var(--neu-shadow), -2px -2px 6px var(--neu-highlight)`             | All `.neu-panel` and `.neu-raised` surfaces   |
| `--neu-inset-shadow`   | `inset 1px 1px 3px var(--neu-shadow), inset -1px -1px 3px var(--neu-highlight)` | `.neu-inset` surfaces, composer, sidebar body |

**Sanctioned custom recipe:**

| Recipe               | Value                                                           | Use                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.chat-message-well` | `inset 0 10px 24px -22px var(--neu-shadow-deep)` (top + bottom) | Chat scroll well — deep directional inset that reads as a recessed channel. Background: `color-mix(in srgb, var(--surface-container-low) 72%, var(--background))`. |

`.neu-primary-button` uses the same inherited dark and light primitives at rest, hover, and active. Context utilities therefore keep primary and secondary controls aligned with the material beneath them.

### Glass Material

One glass class for overlay surfaces. Used where a panel floats over other content (dropdowns, mobile drawer panels).

| Class        | Background                                            | Blur | Border            | Shadow                        | Use                          |
| ------------ | ----------------------------------------------------- | ---- | ----------------- | ----------------------------- | ---------------------------- |
| `.glass-neu` | `color-mix(in srgb, var(--surface) 50%, transparent)` | 12px | 1px border-subtle | `0 4px 12px rgba(0,0,0,0.06)` | User menu dropdown, overlays |

No gradient overlays, no saturation boost, no multiple glass variants. The glass is minimal: translucency + blur + soft edge.

Fallback: without `backdrop-filter` support, renders as solid `var(--surface)`.

### Named Rules

**The Dual-Tier Rule.** Tier 1 (Tailwind shadow utilities) for one-off depth on small elements. Tier 2 (`.neu-*` classes) for composed surfaces. Never mix on the same element.

**The Light-Source Rule.** Light source is upper-left. Shadows fall bottom-right, highlights sit top-left. Consistent across both tiers.

**The Whisper-Dimension Rule.** Use minimal resting depth on controls, contained cards, desktop panels, and overlays. Mobile page frames and primary workspace regions stay flat. Hover and active states expand or invert the control shadow to `--neu-inset-shadow`.

## Shapes

**Form language:** Choose radii by role. Derive close inset contours from their surrounding frame and actual edge distances.

- **Major peer surfaces** (tablet/desktop workspace panels and canvases, chat, sidebar, bottom sheets): `rounded-2xl` (16px)
- **Mobile pages and primary canvases**: square edges and no outer shadow below 640px; preserve rounded contained cards and overlays
- **Peer controls** (ordinary actions, icon buttons, fields, segmented-control frames): `rounded-lg` (8px). Match sibling contours in the same command row without changing target dimensions.
- **Inset segments**: `rounded-sm` (4px) inside an 8px frame with 4px padding. Derive other close contours from their actual inset.
- **Large auth/marketing actions and floating map-control frames**: `rounded-xl` (12px)
- **Inner content and navigation rows** (session items, details blocks, tool cards, nav items, thinking blocks): `rounded-lg` (8px)
- **Small elements** (inline code, small badges, icon containers in tool results): `rounded-md` (6px)
- **Pills** (action chips, suggestion pills, avatars, dots, credit badges): `rounded-full` (9999px)
- **Panel-level inputs** (chat composer): `rounded-2xl` (16px), including inside flat mobile pages
- **Landing outer frame**: `rounded-[1.75rem]` (28px) — exclusively for the product mock container
- **Chat bubbles**, asymmetric corners signal direction:
  - User (right-aligned): `16px 16px 5px 16px`, flat bottom-right means "from me"
  - Assistant (left-aligned): `16px 16px 16px 5px`, flat bottom-left means "from them"

### Concentric contours and optical anchors

For close parallel corners, use `inner radius = outer radius − inset`. Measure the inset between border-box edges, including real borders and padding. Compare the corresponding corner centers in both axes. Shadows and focus rings do not change that distance. Independent cards, avatars, fields, interior rows, and offset panels do not inherit a concentricity requirement.

| Matched contour                                   | Outer radius | Inset | Inner radius |
| ------------------------------------------------- | ------------ | ----- | ------------ |
| Expanded navigation well and edge row             | 16px         | 8px   | 8px          |
| Collapsed navigation well                         | 12px         | 4px   | 8px          |
| Workspace, prerequisite, term, and theme segments | 8px          | 4px   | 4px          |
| Timetable canvas and grid frame                   | 16px         | 2px   | 14px         |
| Timetable frame and scroll field                  | 14px         | 2px   | 12px         |
| Timetable day strip and selected day              | 12px         | 4px   | 8px          |
| Single-line composer and action, phone            | 16px         | 6px   | 10px         |
| Single-line composer and action, wider screen     | 16px         | 10px  | 6px          |

Keep a 28px title anchor in `WorkspacePage`. Center leading controls on that anchor while preserving their full hit targets and the description below the title. Use the panel header's 16px horizontal inset for plain rail content, discovery searches, and control groups. Default panel bodies use 16px padding; dense lists keep their explicit 8px variant and contained bodies own their internal spacing. Loading search frames match the loaded field's position and responsive height.

Validate computed geometry alongside original-scale screenshots and enlarged details. Resolve contradictory image estimates with measured bounds; do not nudge shared icons from a class-name or screenshot guess.

**Border treatment:** `.neu-button` elements carry 1px `border-subtle` to enhance the sculpted edge. `.glass-neu` carries 1px `border-subtle` as its glass edge. All other `.neu-*` surfaces have no border — the shadow alone defines the edge. Borders appear on:

- Section dividers (`border-t`/`border-b` hairlines between content sections)
- Outline-style interactive pills (`border border-primary` for action chips)
- State indicators (`ring-error/30 ring-2` for validation errors)
- Content separators in assistant markdown (pre blocks get `border border-border-subtle`)

## Components

### Loading states

Use `src/components/ui/skeleton.tsx` for content loading. `Skeleton` supplies the shared neutral material, sheen, and reduced-motion treatment. `SkeletonGroup` announces a loading label and hides decorative content from assistive technology. `SkeletonText`, `SkeletonList`, and `SkeletonFields` compose recurring text, result-row, and labeled-control shapes. Import these components directly; do not add local pulse animations or raw skeleton classes.

Keep the loaded frame mounted: page padding, panel headers, search controls, table columns, calendar dates, and timetable grids. Use `WorkspacePage`, `WorkspacePanel`, and `WorkspaceCanvas` for route fallbacks as well as loaded pages, including host-specific menu clearance and compact views. Match field label line heights and reserve action, feedback, and footer space. `SkeletonList` owns a 16px inset by default; use `padding="none"` inside an already-padded region. Keep feature-specific skeleton compositions beside their content and share them across matching consumers.

Use skeletons only until content arrives. Retain usable data during refresh, show `LoadingStatus` in a fixed header or footer, and distinguish failure from a successful empty result. Saving, sending, importing, route calculation, and authentication redirects keep progress labels because the pending result has no known content layout. Skeletons expose no interactive placeholder controls; loading dialogs retain a real Cancel action and keyboard dismissal. Scrollable calendars and timetables remain keyboard-accessible while loading.

### Shared typography and composition

Group titles or names with their supporting text at a 4px gap. Use 8–16px before related controls or result groups and 16–24px between distinct sections. Give each gap one owner; avoid combining a parent's gap with a child's padding or margin for the same separation. Omit empty metadata groups. Keep the shared form field's 6px label/control gap and the separate marketing and full-page recovery scales.

Use `Heading` from `src/components/ui/heading.tsx` for application headings. Choose `as` for the document level and `size` for the visual role: Title is 20px/25px, Section is 16px/24px, Subsection is 14px/20px, and Label is 12px/16px. Each role uses medium weight. Use `tone="muted"` for group labels; reserve caller classes for layout, truncation, and intentional identifier fonts. Keep the landing hero and section scale in the marketing surface, and keep generated assistant Markdown in its prose stylesheet.

Compose modal content with `DialogPanel`, `DialogHeader`, and `DialogActions`. Use the panel's default 16px compact/24px desktop padding. Choose `padding="none"` for a contained header, scrolling body, and footer, then use the same insets in those regions. Dialog headers use the Section heading, 13px supporting copy, and a 12px gap around leading content and the close action. Dialog actions use an 8px gap and 24px section separation; use `spacing="none"` inside an already-padded footer and `layout="stack"` for compact stacked actions. Callers choose initial-focus targets and dismissal behavior. Use the shared visible, enabled tab stops for modal traversal, including native summary elements; exclude hidden, inert, and aria-hidden content. Apply the same availability rules before restoring focus. Wrap conditional overlay components in `AnimatePresence` outside the condition; shared dialog and floating-panel primitives own entry and exit motion. Treat a lazy profile dialog and its loading fallback as one presence unit. Drawers, sheets, and dialogs share body-scroll ownership; release the original overflow only after the last owner closes. Dialogs also retain inert ownership across out-of-order closure. Restore focus to an available trigger after cleanup, or use the caller's `returnFocusFallback` when responsive layout or deletion removes that target.

Use `InfoChip` for noninteractive metadata and status. Neutral facts use the default tone or stronger neutral emphasis on nested surfaces. Use `tone="caution"` for a required choice and `tone="error"` for conflicts or skipped input. These variants share 12px/16px typography and 8px horizontal/2px vertical padding. Keep identity colors and calendar categories on their domain contracts.

Keep neumorphic material defaults in the CSS components layer so utility colors can express selected and nested surface states without replacing the shared elevation recipe.

### Buttons

Back actions use an icon-only 20px `arrowLeft` in the shared ghost button or link, with the existing 44px square target and the shared 8px control radius. Remove the resting border, background, and shadow; retain hover feedback and visible keyboard focus. Supply a destination-specific `aria-label` and `title`; omit visible Home or Back text. Authentication pages keep this navigation sticky outside animated form content. Workspace navigation stays above the content scroller, and panel-local back controls stay in the panel header with room for focus paint.

Use `src/components/ui/button.tsx` for native action buttons. `Button` owns variant, size, focus, disabled, pressed, and parent-material shadow classes while feature code owns the label, icon, layout, and event handler. Use `InlineAction` for compact link-styled choices inside messages and error text; it retains its 44px mobile target and returns to inline height on larger screens. `RetryAlert` combines the semantic error surface and inline retry action for load failures. Keep links, tabs, radios, menu items, navigation rows, pills, and compound controls on their native contracts.

State changes through shadow transformation + press scale. Buttons never translate on hover or active; the surface stays put and only the shadow, filter, or scale changes.

- **Primary** (`.neu-primary-button`): `bg-primary text-on-primary rounded-lg h-9 px-4 text-sm font-medium`. Shadow: contextual dark and light pair for the parent material. Hover: brightness(1.03) with a wider contextual shadow. Active: contextual inset shadow, scale(0.985).
- **Primary Large**: `h-12 rounded-xl px-8 text-base`. Retains the 12px large-action radius for landing CTAs and auth submit.
- **Primary Prominent**: `h-10 px-4` — slightly taller than standard for emphasis in error recovery states. Same shadow recipe.
- **Secondary** (`.neu-button`): `bg-surface text-on-surface rounded-lg h-9 px-4 border-subtle text-sm font-medium`. Shadow: surface shadow. Hover: expanded shadow. Active: inset shadow, scale(0.98).
- **Danger**: Secondary material with `text-on-surface-variant`; hover uses `bg-error/10 text-error`. Use for destructive native actions after the label names the consequence.
- **Secondary Compact**: `h-9 px-3` — reduced horizontal padding for tight layouts (retry buttons, inline actions).
- **Ghost**: `bg-transparent text-on-surface-variant rounded-lg`. No shadow at rest (the one exception to whisper dimension). Hover: subtle surface background appears. Landing sign-in link uses `text-on-surface-variant hover:text-on-surface` for a softer secondary feel.
- **Icon Button**: `size-9` (36px) standard. Uses `neu-button` or `neu-panel` shadow. Contains centered icon.
- **Compact Pill** (inline tool cards): `border border-primary text-primary rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px]`. Smaller padding than suggestion pills; used inside tool result cards where space is tight. Focus: `ring-primary/40 ring-2 ring-offset-2`. Active: `scale-95`.
- **Sizes**: Standard 36px (h-9), Toolbar 36px (h-9 with 8px radius and caption text), Prominent 40px (h-10), Field Companion 44px (h-11), Compact 32px (h-8), Large 48px (h-12, landing/auth only), Icon 36px. Field Companion aligns an action beside a 44px input. Below 640px, compact, toolbar, standard, prominent, and icon controls retain their existing 44px sizing. The general 32px minimum permits smaller purpose-built controls; it does not shrink these documented sizes.
- **Transitions**: `color`, `background-color`, `box-shadow`, `transform` at 150ms ease-out.
- **Disabled**: Shared buttons keep native disabled semantics, use 45% opacity with a not-allowed cursor, and suppress hover and active visual states.

### Cards / Containers

- **Standard panel** (`.neu-panel`): `bg-surface rounded-2xl` + surface shadow. No border, no blur. Padding: 12-16px. Used for the sidebar, building popup, map controls, and contained cards.
- **Workspace surface** (`.workspace-surface`): Share the live and loading page material across Chat, Tools, Unity, and Settings. Below 640px, use a flat surface with square edges and no shell gutter. From 640px upward, use the standard 16px panel radius and neumorphic shadow. `WorkspacePage` owns 24px wide/16px compact spacing, 16px region gaps, the optional 20rem rail, the 55rem compact threshold, and scroll boundaries. On phones, apply the 16px inset to headers, notices, view switches, and command groups; let the body fill the width and flatten its `WorkspaceCanvas` and `WorkspacePanel` wrappers. Keep a visible inset keyboard-focus outline on edge-to-edge canvases. Reserve 4px of vertical scroll margin for keyboard-focused workspace content so outward focus paint can clear scroll boundaries. Keep the heading and shell/back navigation outside the height-recovery scroller. Place toolbars, filters, view switches, and the 20rem-minimum content region in that scroller so short views can reveal the whole workspace. Render shell navigation in the heading group through `WorkspaceHostContext`; do not reserve empty space for a floating menu. Reuse `WorkspaceRail`, `WorkspacePanel`, and `WorkspaceCanvas`; feature code supplies content rather than another page frame. Embedded Answer Canvas workspaces retain their contained layout.
- **Shell layers**: Keep the shell body at root layer 10, above bottom navigation and below the sidebar scrim/drawer at layers 40/50. Preserve the inner route-stage isolation and keep this body layer stable through sheet entry and exit. Inert navigation must remain behind the sheet's paint.
- **Chat panel**: `ChatFrame` uses `.workspace-surface`, a 60px title bar, one message scroller, and the bottom composer. Below 640px, the message region shares the flat page color and has no inset shadow. At wider sizes, `.chat-message-well` uses the recessed channel with deep inset shadows at `inset 0 10px 24px -22px` and 72% surface-container-low mixed with background. Keep the landing example's recessed treatment independent of the mobile app.
- **Sidebar**: From 640px upward, preserve `.neu-panel rounded-2xl p-2`, the expanded well's 16px radius/8px inset, and the footer's mode toggle and account row. Collapsed wells retain a 12px radius/4px inset around the same 8px-radius rows. Hide the scrollbar gutter only in the collapsed icon list, preserving native keyboard and wheel scrolling; expanded lists and drawers keep their scrollbars. Center the collapsed account control with the mode links, and preserve the expanded footer's full width. Use a square 44px collapsed brand link with a 12px radius and inward keyboard outline around the 36px logo. Boot placeholders match the brand, expand, mode-group, and account geometry. Below 640px, use one edge-attached drawer surface, remove the nested frame and recessed well, and place modes in the bottom bar. Keep the brand header, close action, scrolling destinations, and account footer. Phone destination rows are 48px high with 20px icons and 16px labels; selected rows use a flat neutral fill. Use one compact conversation-action trigger with reserved label clearance. Keep it visible on touch/no-hover devices and for selected or open rows; reveal inactive desktop actions on hover or keyboard focus. The account menu portals outside clipping, matches the trigger width, and retains its overlay material. Drawer Tab navigation stays within the dialog; closing an account popup at its final item returns to the drawer's first control. The Tools sidebar becomes a drawer below 1280px; other modes switch at 1024px.
- **Tool result cards**: `bg-surface-container-low rounded-lg p-3`. Flat within the message bubble. Icon containers use `bg-secondary-container text-on-secondary-container size-9 rounded-lg` (or `size-8 rounded-md` for compact variants).
  Result rows put full key-date text and free-room chips in wrapping metadata below the description. Keep trailing chevrons and compact single-value indicators in their existing column. Event actions wrap within the card; the primary label can grow above its 44px floor while the map action stays square.

- **Full-page recovery**: `FullPageState` fills a parent or viewport minimum with 16px outer padding and the existing centered, 32px-padded card. Let content grow and scroll on short screens so the title stays below the document origin and actions remain reachable.

### Inputs / Fields

Use `TextInput`, `SelectInput`, `SearchInput`, `Field`, and `Checkbox` from `src/components/ui/form-controls.tsx`. Native fields share inset material, 8px radius, focus, invalid, disabled, and parent-material shadow treatment. `SearchInput` owns search and clear chrome with explicit `primary` (44px) and `rail` (36px desktop, 44px compact) densities. `Field` owns the 12px medium label, 6px control gap, and help/error placement. Place related links in `labelAction`, outside the label, and connect control descriptions with `aria-describedby`. `Checkbox` owns the native input and one shared indicator. Domain comboboxes and compound uploads keep their state and behavior outside these primitives.

- **Chat composer** (`.neu-inset .chat-composer`): `bg-surface-container-low rounded-2xl p-1.5`. Recessed at rest via `--neu-inset-shadow`. Focus-within: inset shadow + 2px outline ring glow (primary at 28% opacity, -2px offset). Internal: textarea (transparent bg, `px-3 py-2 text-sm`, no outline) + send button (`.neu-primary-button rounded-xl size-11 sm:size-9`, right-aligned).
- **Auth input** (`.neu-inset`): `bg-surface-container-low text-on-surface h-11 rounded-lg px-3 text-sm`. Focus: `ring-primary/40 ring-2 ring-offset-1`. Error: `ring-error/30 ring-2`.
- **Thinking state**: Animated conic-gradient border mask (2px pseudo-element with mask-composite) at 2.4s linear infinite. Send button replaced by a stop button (`.neu-button bg-surface text-on-surface-variant rounded-xl`) during generation, allowing the user to abort.

### Calendar

- **Composition**: Calendar uses the shared split workspace with a 20rem Upcoming panel and the month inside the inset canvas. The header owns month navigation, legend filters, and the bounded Ask AI action. Upcoming rows and header controls retain their 44px compact targets.
- **Compact month**: Upcoming opens first below the 55rem threshold. The Calendar view retains a horizontally scrollable seven-day month at a 36rem minimum width. Keep the month grid growing and nonshrinking so the 6rem compact and 8rem wide row minima extend the Calendar days scroller. Let the grid fill spare height. Individual event labels become noninteractive color indicators, and each event day exposes one 44px agenda action. The agenda lists 44px event rows before opening shared event details.
- **Request states**: Calendar data is cached per cursor and kind set. Initial loading, successful empty, refreshing, stale-with-data, and failed-without-data remain distinct. Refresh and Retry start real requests, stale responses cannot replace a newer month, and failure never reads as an empty calendar.

### Course Lookup

- **Browse composition**: Course Lookup uses one full-width workspace. The command area keeps Find a course, Session, Sort, and Filters visible above the inset results canvas. Year, Average, Enrollment, Credits, and Faculty appear only in the inline Filters disclosure, which shows its active count and owns one Reset action. Search and filter changes update results directly; no separate Show step or Filters destination remains.
- **Search behavior**: Exact, partial, and subject-shaped course queries use structured catalog parameters before free-text fallback. An exact code resolves to its session record instead of a broad fuzzy list. Loading, stale, error, empty, pagination, and result-count states remain inside the canvas.
- **Detail composition**: Detail routes use the same single workspace. An icon-only Back action sits immediately before the Course lookup heading, while Session remains in the header toolbar and the record fills the scrolling canvas. Term groups progressively disclose section tables, preventing phone records from expanding into a long wrapped list. Missing codes retain one header-level exit plus relevant alternatives.
- **Compact flow**: Search leads at phone widths, followed by Session, Sort, and the Filters disclosure. Keep search and advanced filters inset 16px while the results region spans the page. Results show Code and Course name without document overflow; enrollment and average move into each row's secondary line. Controls and rows retain their 44px targets. Keep the results region at least 16rem tall so expanded filters extend the page scroller and leave the table and footer reachable.

- **Grade charts**: Keep tick labels inside the chart frame. Use a 16rem inner axis/plot/tick row within a named keyboard-scrollable region, with inset focus paint and the count footer outside that horizontal minimum. Preserve bucket values, ratios, highlighting and the 112px plot.

### Prereq Tree

- **Shared node material**: Course and branch-choice nodes share one raised surface recipe and fixed edge attachments. Corequisite columns and branch categories use neutral surfaces; the root and unknown-course states retain their semantic accents. Use full-contrast muted or secondary text for alternatives and supporting details. Selected stacked choices expose `aria-pressed`; keep the existing labels, edge geometry, zoom-bound menus, and course navigation. Use the shared neumorphic shadow without a colored halo. In Outline, keep course codes unwrapped and nonshrinking beside truncated titles; literal notes and branch labels remain wrappable.
- **Tools composition**: Prereq Tree uses one canvas workspace. The root-course combobox and Show action remain above the graph at every size, with loading, catalog failure, and missing-code feedback directly below. Clearing the search returns to the empty route and guidance state, including after an unknown-course error. A course with no listed prerequisites gets a complete result with Course details and Search another course actions.
- **Routes and links**: `/tools/prereq/:code` identifies a rooted graph. Selecting another root pushes its URL; browser Back restores the prior root. Course details link to the rooted tree, and tree courses link to their detail URL. The global Tool list follows the pathname rather than transient pane state.
- **View selection**: Outline and Map stay visible above the canvas at every width. Use equal grid columns sized for unbroken labels, with 44px targets and 16px horizontal padding. Center the search field and switcher controls on the same row at wider widths. Keep 8px between controls and results; remove empty feedback from layout instead of reserving a spacer. Error and missing-course feedback keep their natural height. A graph-renderer failure replaces the graph and its preparing overlay together with the working Outline fallback. Below 40rem, Outline opens first and provides 44px course and prerequisite-choice actions. At wider sizes, Map opens first with a readable zoom floor and pans instead of shrinking every node into one frame. React Flow edges and outer node wrappers stay out of the tab order; explicit node controls own keyboard access.
- **Shared search and Answer Canvas**: The controlled combobox still receives candidates from the loaded local index, preserves uppercase query and exact Show behavior, and matches the shared keyboard contract. A settled rooted value does not reopen suggestions until focus or input changes. Answer Canvas keeps rail-density search in one in-flow command row below its titlebar, with 16px side insets and an 8px gap before feedback or the stable graph region. Suggestions retain their body portal; the search form stays outside the titlebar action outlet. Keep Tools page chrome out of the embedded graph.

### Degree Planner

- **Composition**: Operate-mode workbench with 24px desktop padding, 16px region gaps, and 8px internal gaps. The top bar places the title above one shared toolbar row, with visible-label program selectors on the left and labeled actions on the right. The body places a fixed 320px Requirements and Find Courses rail to the left of the horizontally scrollable year board.
- **Rail**: Requirements and Find Courses use equal `WorkspaceRail` regions: raised cards from 640px upward and flat, full-width sections with a shared divider on phones. Both use `min-w-0 min-h-0`, stable scrollbar gutters, and internal scrolling; neither region shrinks to make room for the other. Find Courses lists only courses not already planned. Its source row hides during drag, a successful drop removes it from the results, and lookup drags never animate back to the source.
- **Material**: Planner surfaces use neutral background, surface, and container tokens only. Primary color is limited to true affordances and state indicators such as Ask AI, focus, links, add controls, progress, and checkbox completion; errors use the error family. Study terms use tonal inset depth, course chips use tonal raised depth, and drag ghosts reuse that same elevation rather than `shadow-xl`.
- **Terms**: Every study term keeps one anatomy: header, scrollable course region, and optional full-width `Mark as co-op work term` action. Co-op cards center the icon, title, and months inside the available body with 16px side padding, omit generic placement copy, and use the inverse full-width `Switch to study term` action. Study and co-op terms share a 16rem minimum. Reserve at least 9rem for the size-contained course scroller, independent of course count and open Move selectors. Propagate these minima through the year and board so short views scroll rather than compressing cards. Without summer, the two winter terms split available height above their minima. Adding summer grows a second flex region from zero while fading in over 300ms with `--neu-ease`; its animated minimum accommodates two terms and their 8px gap. Removal reverses both growth and the minimum. Reduced-motion users switch immediately. Summer controls remain full-width at the bottom of each year.
- **Course chips**: Search results and placed courses share a compact raised two-row card with 8px horizontal and 4px vertical padding. The header pairs a plain-text course code with right-aligned actions: Info and Add in search, Info, Move, and Remove in the plan. Search cards have no remove placeholder. Add and Move use their natural button widths; square icon buttons use centered icons and uniform 4px gaps. Code and title share one left text edge, outside buttons, and serve as drag surfaces. The second row gives the title the remaining width beside unwrapped credits. Desktop controls are 32px high and compact-screen controls retain 44px hit areas. Each drag ghost copies its source card's content, actions, and width under `inert` and `aria-hidden`, without scaling. Year columns retain an 18rem minimum width. Add and Move reveal a non-shrinking native term selector outside the measured card; it omits co-op terms and disables the current move destination. Both commands use the same undoable store operations as drag and drop. Pointer drag retains anchored spring and velocity tilt, with immediate anchored positioning for reduced-motion users.
- **Typography**: Degree Planner uses Aspekta throughout. Course codes use 14px medium text with 20px leading; titles use the 13px Body Small role; credits and actions use 12px Caption text. Titles truncate within their own row, and course details retain the full text. Course identifiers, requirement alternatives, and placement issues use no monospace.
- **Course details**: Placement issues lead the popup as direct sentences. Each issue owns a separate `bg-error-container text-on-error-container` box; no heading or bullet list delays the explanation.
- **Requirements**: Use the feature-local `RequirementRowContent` for course, manual, and completed text, status, and credit columns. Keep native selection and drag wrappers outside that presentation. Manual, course, planned, and completed rows share one 36px checkbox geometry. Text captions distinguish automatic completion from manual completion instead of changing the checkmark style. Automatically planned checks retain the primary color at 50% opacity to read as disabled; manually checked requirements remain fully opaque and interactive. Each year heading uses 4px vertical padding and sticks to the top of the Requirements scroller until the next year replaces it. Degree progress owns a 16px top inset. Give progress-card labels the remaining width and allow wrapping. Keep credit totals unwrapped and nonshrinking, separated by an 8px column gap.
- **Responsive flow**: At the shared 55rem container threshold, 44px Plan and Requirements & Courses controls switch between the still-mounted board and rail. Adding from Find Courses returns to Plan. The board remains keyboard-scrollable, and both rail cards retain equal bounded height.

### Schedule Workspaces

- **Shared workspace alignment**: `/tools/schedule` and `/pulse/schedule` use `WorkspacePage`: 24px wide/16px compact spacing, a 20rem controls panel, a 16px region gap, and one data canvas. From 640px upward, use the canvas's `padding="frame"` 2px surround: 16px canvas radius, 14px timetable frame, then a second 2px painted gutter around the 12px scroll field. Below 640px, flatten the controls and canvas, remove the timetable's outer padding and corner radius, and let the timetable reach both page edges. Keep search fixed, course modules scrolling, and import fixed inside the contained controls body. Reserve a 12rem minimum for the size-contained course list, with the controls minimum propagated through its rail ancestors. On short screens, scroll the workspace content below navigation when the fixed sections and list floor exceed the available height; dense course contents scroll only inside the list. Hidden compact controls contribute no minimum to the Schedule view.
- **Host-aware header**: `WorkspaceHostContext` identifies Chat, Tools, Unity, Answer Canvas, and Settings before rendering, and supplies inline shell navigation. Answer Canvas suppresses the duplicate title immediately, keeps the term toolbar inside the workspace, and portals only bounded actions such as Share. Tools and Unity use the shared page header and reserve compact-menu clearance at their shell breakpoints.
- **Planner discovery**: Search is discovery only. Partial and full-code results use one 12px floating combobox overlay; typing never changes terms, courses, or the week. Click or Enter explicitly adds. Off-term results name the switch before commit. Search stays fixed, course modules scroll, and the Workday drop area stays fixed below them.
- **Planner modules**: Selected courses use flat surface modules with 8px radius and a standard 1px border. Known component selectors remain visible. Unrecognized prefixes stay independent under “Additional component types” with a visible count when automatic selection skipped them. A timetable activation focuses the matching selector; drag remains the spatial shortcut.
- **Week canvas**: The grid renders Monday through Friday, adding both weekend columns when needed. A 56px time gutter anchors an 8 AM–10 PM minimum range at 54px per hour. Day headers and the time gutter stay visible while the canvas scrolls. The grid remains visible in loading and empty states.
- **Block anatomy**: Planner blocks center the course code and `section · type` on both axes; meetings below the tall threshold place all three on one line without changing time geometry. Sharer blocks keep course and component at the top left because Workday data carries no section identifier. On tall blocks, use up to four 16px avatars plus the remaining count when the footer has at least 6rem of content width; otherwise show the total participant count. Keep the footer at the bottom right and the full roster in accessible labels and details. Full title, time, location, status, and people remain in accessible labels or read-only details. Blocks retain the documented course-color edge and surface mix; conflicts use the error ring.
- **Sharer flow**: Sharer controls remain read-only and follow one order: group, management, people, common free time, Right now, then personal import. People and live status use flat 44px rows without nested panels. Render the Right now section only for a live selected term with an enabled person who has a schedule; omit its padding and divider when ineligible. Grid, common-free calculations, and Right now share the same enabled-person set. Name the bounded common-free-time list and keep it keyboard-focusable. Keyed loading clears old group content before a new selector value appears; Share is the sole header action.
- **Radius hierarchy**: 16px for protected modals, mobile sheets, and peer outer panels/canvases; 14px for the inset timetable frame; 12px for its scroll field/day strip and independent floating search; 8px for ordinary actions, course modules, fields, rows, blocks, and selected days; 6px for independent compact subcontrols; 4px for selected term/view/theme cells inside an 8px group with 4px padding. Full radius belongs to status pills, avatars, and identity dots.
- **Notifications**: Keep up to three readable messages in one named keyboard-scrollable stack. Keep the scrollport at least 16px inside its vertical bounds, including above phone navigation, so partially visible messages retain clearance. Include the internal shadow gutter in that bound. Hold expired messages while pointer or keyboard focus remains inside, then remove overdue entries; keep unexpired deadlines. Embedded notifications use the Answer Canvas content bounds and remain inside its focus/inert ownership. Other notification components retain their positioning.
- **Typography**: Schedule titles use the 20px title step; section headings and buttons use 14px; helper copy uses 13px; labels and metadata use 12px. Planner and sharer surfaces use Aspekta throughout, including course codes, section identifiers, times, rooms, and counts. Schedule controls use no tracked uppercase labels and no text below 12px.
- **Import**: Both routes parse Workday Excel exports in the browser. First imports and replacements use the same dashed drop area, with an 80px minimum height, 4px between label and hint, and native file-picker and drag-and-drop access. Matching progress and loading placeholders retain that footprint. Planner imports reconcile term, component, days, and times with catalog identifiers, require a choice for ambiguous matches, list skipped rows, and ask whether to merge or replace before one atomic update. Sharer imports remain read-only calendar data.
- **Responsive flow**: At the shared 55rem container width, the rail and canvas become explicit 44px Schedule and Controls views while both remain mounted. Use 16px spacing and open Schedule first with one day column. Below 640px, retain the header and view-switch insets while making the timetable full-width. Keep day tabs at least 44px wide and horizontally scrollable when weekend tabs do not fit. Preserve term, day, form, and scroll state across view changes.

### Settings

- **Utility route**: Settings renders inside the authenticated shell before mode-dependent content. It keeps the existing AI, Tools, or Unity sidebar and cached workspace state without marking a prior tool row current. Browser Back restores the same route, mode, active pane, query, and scroll position.
- **Composition**: The shared split workspace places Account and Appearance in two equal 20rem rail panels and Student Profile in the inset canvas. Compact users switch between Student profile and Account & appearance through the standard 44px control.
- **Profile safety**: Profile fields do not render until saved defaults load successfully. Failure shows the shared Retry state and keeps editing locked; saving disables the complete fieldset without clearing values. Program, year, and student type use shared labeled fields.

### Map, Pulse, and Creators

- **Campus Map**: Tools uses the shared split workspace with a 20rem Explore rail and one inset map canvas. The rail keeps search fixed, opens with Saved and eight curated buildings, and replaces discovery with focused selected-building details. Compact workspaces keep the map as the main region and place the same Explore rail in a non-modal bottom sheet; the 64px sheet handle expands for search and details, then becomes a route-summary peek when a connected route appears. Bound the expanded sheet to leave 120px above it for layer and reset controls, and position map attribution from the same sheet-height calculation. AI keeps the map full-bleed inside Answer Canvas without the Tools rail. Layer, reset, and zoom controls retain their specialized map contract and 44px compact targets.
- **Pulse**: Pulse uses the shared single workspace and inset scroll canvas. Question cards use the sanctioned raised surface; voted results use the sanctioned inset surface. Swipe remains the pointer shortcut, while native 44px Agree and Disagree buttons provide keyboard and reduced-motion operation. Custom hard-offset card shadows are not permitted.
- **Creators**: Creators uses the same single workspace, title hierarchy, inset canvas, and shared link-button treatment. Its centered people content remains intentionally sparse.

### Navigation

Use `SidebarItemButton` for Tools, Unity, and conversation destinations. It owns 44px compact/36px desktop height, 8px icon gaps, 14px medium labels, neutral selected material, focus, and collapsed labels. The phone drawer adapts these rows to 48px height, 20px icons, and 16px labels. Keep session accessory clearance in its explicit `accessories` variant; callers own navigation, rename, and deletion behavior.

Conversation rows use one ellipsis button: 32px on the desktop sidebar and 44px inside a drawer, aligned 2px from the row's right edge. Reserve 40px desktop/52px drawer text clearance instead of covering titles with a gradient. Keep drawer rows and rename controls at 48px across phone and tablet layouts. The action menu uses a 12px-radius raised frame with 4px padding and 44px labeled Rename/Delete items. Arrow keys, Home, and End move the active menu item; Tab and Escape leave the menu.

Rename uses a labeled, selected inline input, preserves its draft on failure, and retains focus ownership through asynchronous saves. Delete uses a parent-owned shared confirmation dialog with Cancel as initial focus. Commit local title/removal changes after API success, retain retry feedback on failure, and block duplicate submissions. Dialog cancellation returns to the local action trigger; deletion or responsive hiding resolves a visible New conversation or desktop sidebar control after modal cleanup. Background history loads and response completion leave existing focus in place. Late deletion completion must not redirect a different conversation.

Use `ModeToggle` for both sidebar and bottom presentations. Phone mode links stack a 22px icon above a 12px label in a 60px target. Divide the usable bar width into three contiguous hit regions. Paint hover, press, and keyboard-focus feedback on one noninteractive surface inset 8px on all four sides, with an 8px radius. Give this surface a 2px inward CSS outline and suppress the link's global outline. Keep the full hit region clickable, including that inset space. Use primary text for the current mode and muted text for the others. Keep the bar flat and full-width. Use native links with `aria-current`, retain modified-click behavior, and restore each mode's last committed path through the existing sessionStorage pattern. Exclude utility routes such as Settings and reject paths outside the destination's mode. Guest-locked modes show their sign-in hint on tap as well as focus. Touch pointer leave does not dismiss the hint; outside interaction, focus departure, or Escape closes it. Give each mode a distinct hint ID and keep an exiting hint from dismissing its successor.

- **Session sidebar items**: `h-9 px-3 py-2 rounded-lg text-sm`. Active: `neu-inset bg-surface-container text-on-surface`; active navigation and mode controls never use accent-tinted fills. Inactive: `text-on-surface-variant`. Hover: `bg-surface-container-high text-on-surface`. Transition: all 150ms. Focus: `ring-primary/40 ring-2 ring-offset-1`.
- **Session group headers**: `text-muted uppercase text-xs tracking-[0.05em] font-medium px-2 pb-1.5`. Categories: Today, Yesterday, This Week, This Month, Older.
- **Header**: Use each route's own header with an inline ghost menu control. Avoid another branded top bar. Brand stays in the sidebar (`bg-surface-container-low text-primary size-9 rounded-lg` logo tile and the medium wordmark). Chat and Answer Canvas headers retain their 60px band. `WorkspaceHostContext` carries the navigation element through loaded, pending, and recovery frames; full-bleed Tools inherits it, while embedded Answer Canvas clears it.
- **Collapsed rail** (`.neu-panel`): `w-[3.75rem] rounded-2xl py-3`. Vertical label with `[writing-mode:vertical-rl] text-xs font-medium tracking-[0.06em]`. Expand button: `neu-panel size-9 rounded-xl`.

### Chat Messages

- **Shared frame**: Compose live and pending conversations with `ChatFrame` and `ChatComposerFrame`. Keep the 60px header, one padded Conversation messages section, 16px composer side insets, safe-area footer, and reserved caption row. Give the message section `tabIndex={0}` and an inset focus outline so keyboard users can scroll a text-only conversation. Below 640px, use the flat edge-to-edge page material. Below the sidebar breakpoint, render the menu beside the title with an 8px gap. Phone menu effects use 8px outer clearance; wider headers retain their 16px inset. Keep menu access in pending and failed conversations. Reuse `AssistantIdentity` for live, pending, and marketing-example identity rows without importing chat state into the landing page. Tool summary cards use `ToolResultCard` title, metadata, detail, and action slots; format money, distance, and time with the data font. Mapped data-tool badges use native shared pill buttons; unmapped badges remain static.
- **Composer contour**: Keep the single-line field at 44px and its surrounding well at 56px. Phone text uses 16px/24px with 10px block padding; wider screens use 14px/20px with 12px block padding. Send and Stop keep their 44px/36px targets, with composer-local 10px/6px radii and equal 6px/10px top/right/bottom insets. Multiline text grows within the existing 96px cap; its centered action is an independent control once the vertical inset grows. Preserve the thinking ring's 18px outer/16px inner contour.
- **User bubble**: `bg-accent-subtle text-on-surface rounded-[16px_16px_5px_16px] px-4 py-3 text-sm leading-relaxed`. Right-aligned, max-width 85%. Flat on the message well surface (no shadow).
- **Assistant bubble**: `bg-surface rounded-[16px_16px_16px_5px] px-4 py-3`. Left-aligned, max-width 88%. Contains: markdown (`.assistant-markdown`), tool badges, thinking blocks (collapsible), warning cards.
- **Assistant avatar**: `bg-primary-container text-on-primary-container size-7 rounded-lg text-[0.6875rem] font-medium`. Placed beside the label row, not inside the bubble.
- **Thinking disclosure**: Keep native summaries at least 44px high on phones and 32px on wider screens. Give the bounded text paragraph keyboard access and inset focus paint; preserve its node across disclosure toggles and streaming updates.
- **Tool call blocks**: `bg-surface-container-low rounded-lg`. Summary: `px-3 py-2 text-xs font-medium` with icon, text, and chevron/spinner. Collapsible `<details>` element. Result content: `text-muted max-h-40 overflow-auto text-xs` in pre tag.
- **Tool badges** (inline, post-message): `rounded-lg px-2 py-1 font-mono text-xs`. Success: `bg-secondary-container/15 text-on-surface-variant`. Error: `bg-error-container/40 text-on-surface-variant`.
- **Clickable tool widgets** (answer widgets in chat): hover shows `bg-surface-container-high` plus a `ring-primary/40 ring-1` affordance, so the card reads as clickable without moving. Active (the chip that opened the current pane) keeps `bg-accent-subtle ring-primary ring-2`.
- **Canvas handoffs**: Use the shared channel activation for explicit course and event actions, clearing dismissal and showing the phone sheet. Reopen a dismissed sheet on mapped card or badge activation; keep automatic tool activation behind the dismissal guard. Set both root and query when opening prerequisites for a selected course.
- **Suggestion pills** (empty state): `border border-primary text-primary rounded-full text-xs px-4 py-3 min-h-[44px] font-medium`. Hover: `bg-accent-subtle`. Focus: `ring-primary/40 ring-2 ring-offset-2`. Staggered entrance via `animationDelay`. Bound each pill to the available inline width and allow the complete label to wrap.
- **Inline action pills** ("Show on map"): `border border-primary text-primary rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px]`. Compact padding for use within tool result cards. Focus: `ring-primary/40 ring-2 ring-offset-2`. Active: `scale-95`.
- **Warning cards**: `bg-tertiary-container text-on-tertiary-container rounded-xl px-3 py-2 text-body-sm`. Icon + text in flex row.
- **Message entrance**: Spring physics (stiffness: 400, damping: 25) — opacity 0→1, translateY(6px→0). Reduced-motion: instant (`duration: 0`).

### Assistant Markdown (`.assistant-markdown`)

Prose within assistant bubbles at `0.875rem`, `line-height: 1.65` (slightly more open than body for readability in long replies). Element spacing: `0.8rem` between siblings.

- **Headings** (h1-h3): weight 550, tracking -0.02em, `margin-top: 1.2rem; margin-bottom: 0.35rem`. h1 at 1.25rem, h2 at 1rem, h3 at 0.875rem/weight 500.
- **Links**: `text-primary font-medium underline` with `text-decoration-color` at 45% primary opacity, transitioning to full on hover. External links open in new tab.
- **Blockquotes**: `bg-surface-container-low border-left: 1px solid var(--primary) rounded-[0_0.75rem_0.75rem_0]` with inset shadow. Neumorphic recessed treatment.
- **Inline code**: `bg-surface-container border border-border rounded-[0.35rem] font-mono text-[0.875em] px-[0.35rem]`.
- **Code blocks** (`pre`): `bg-surface-container-lowest border border-border-subtle rounded-[0.75rem]` with inset shadow. Code at `0.75rem/1.6` in mono.
- **Tables**: `border-collapse: separate`. Headers: `bg-surface-container-low text-xs font-600`. Cells: `text-on-surface-variant text-body-sm`.
- **Lists**: `padding-left: 1.35rem`. Markers: `color: var(--primary) font-weight: 600`. Nested lists get `0.3rem` top margin.
- **Task lists**: Preserve GFM classes and read-only checkbox state. Use a 0.8125rem checkbox with a 0.5rem hanging gap; keep linked, cited, and formatted text in normal inline or paragraph flow.
- **Sources**: Keep the panel outside the prose wrapper, with its own 8px top spacing, 6px row gaps, and 256px list bound. Align explicit openings after the native expansion's computed resize duration and delay, followed by a layout frame. Cancel pending alignment on further input, scrolling, closing or unmount; reduced motion aligns after layout.

### Map Controls

- **Floating buttons** (`.neu-panel`): `size-10 rounded-xl`. Match the 12px outer radius of the adjacent zoom-control frame. Text: `text-on-surface-variant hover:text-primary`. Transition: colors 150ms.
- **Route info card** (`.neu-panel`): `rounded-2xl px-3 py-2`. Contains icon container (`bg-secondary-container text-on-secondary-container size-8 rounded-md`) + text.
- **Zoom controls** (`.neu-panel`): `rounded-xl` containing stacked 44px phone/40px wider-screen buttons with a `bg-border-subtle/60 h-px` divider. Round the upper and lower button corners separately and keep the well's overflow visible so keyboard focus can paint outside it.
- **Bottom sheet** (mobile): `neu-panel bg-surface fixed inset-x-0 bottom-0 h-[80vh] rounded-t-2xl`. Drag handle: `bg-outline/40 h-1.5 w-10 rounded-full`. Header area: cursor-grab touch-none. Dismiss threshold: 20% of height.

### Theme Toggle

Use an intrinsic-width `w-max shrink-0` grid with three equal tracks, 2px gaps, 4px padding, and the shared 8px control-frame radius. Radios use 44px phone/32px wider-screen squares and a 4px inset radius. The resulting group measures 144px/108px wide; each radio fills its track. Selected: `neu-raised bg-surface text-primary`. Unselected: `text-on-surface-variant hover:text-on-surface`. Options: light, system, dark. Keep the group compact inside Settings as well as the account popup. Let the popup's Appearance row wrap with an 8px row gap when its label and control do not fit; do not squeeze the radio tracks.

View-transition ripple on theme change: `startViewTransition` with `--ripple-x`/`--ripple-y` CSS variables driving `clip-path: circle()` expansion at 400ms ease-in-out.

### Signature: Thinking Orb

Spinning gradient sphere (1.75rem diameter) replacing the send button during agent processing:

- Outer: conic-gradient from primary-container through primary (360 degrees), 1.15s linear infinite
- Inner: surface-colored circle (inset 0.3rem) with inset shadow
- Border: 1px primary/border-subtle mix via `color-mix`
- Shadow: `--neu-surface-shadow`

Reduced-motion: static, frozen at natural angle.

### Building Explorer

Tools places a `WorkspacePanel` titled Explore beside the map. The panel owns three states: discovery, building details, and directions. Discovery uses one fixed rail-density search field followed by Saved and Curated popular rows. Building rows use a 36px neutral icon tile, a 14px name, and mono code plus address metadata; compact rows retain a 44px floor.

Center catalog recovery content within the Explore body using a full-height minimum, with one padding layer and enough scrolling space for the complete message and retry action on short sheets.

Selected details keep the panel header and parent-return action fixed while identity, actions and detail content share one vertical scroller. Reset that body to the top when entering details or selecting another building code. Keep native scroll retention for same-building data and action updates. Directions is the primary action; Save, Share, and Google Maps use labeled shared buttons. The body omits property and construction metadata, then renders only non-empty Address, Rooms & spaces, Food & services, and Sources sections. Verified entrances remain spatial graphics on the map and do not appear as a textual rail section. Sources cites only datasets that supply visible detail fields, so entrance geospatial provenance does not appear in the rail. Official images use a horizontal snap strip and retain the source link if an image fails. The interface identifies spatial POI joins and makes no undocumented entrance-accessibility claim.

Use the map-local `BuildingDetailItem` for room and service listings. It owns the list item surface, title/summary/detail rhythm, and trailing or below-text action placement. Keep room-title truncation and source/freshness statements explicit.

The Building details and Directions panel headers place icon-only parent-return actions immediately before their headings. The raised route card contains only a 16px centered origin-to-destination track, a 12px gutter, and two equal `TextInput` compact fields separated by 8px. Each endpoint is the complete shared input control, so its height, radius, inset surface, typography, padding, and full-control focus outline match other Tools fields. The endpoint editor and results stay in normal flow inside one vertical scroll owner. Native nearest-row alignment uses the available scrollport; wheel or touch gestures over either area move that same list. Results use rounded tonal rows with 36px icon tiles, 8px gaps, an inset selected state, and a thin scrollbar. Choosing a result commits it, resets scroll, removes the list immediately, and starts a route when both endpoints exist. Loading, retry, and route summaries replace the list without retaining search results.

Connected walking routes lift 0.2m above flat ground and draw immediately through three ordered depth passes. One 9px primary stroke at alpha 77 uses `depthCompare: "greater"` to show a single 30%-opacity route where scene geometry is closer. A full-opacity 9px casing and 5px primary trace use `depthCompare: "less-equal"` for visible fragments. Route passes disable depth writes and polygon offset. Building fills, including selected buildings, use alpha 255 with `depthCompare: "less-equal"` and depth writes, so nearer buildings completely occlude farther ones. The shared `beforeId` keeps basemap labels above every pass. Wide Tools keeps the endpoint editor and route summary beside the map. Compact Tools collapses to a time, distance, and endpoint handle after a valid route; reopening restores both editable boxes. AI retains its compact top-left highlight card.

Clip the map, loading surface, and recovery state at `MapSurface` using its inherited host radius. Tools supplies the canvas radius, including square phone edges. Answer Canvas propagates its bottom corners through the content region while keeping the seam below its titlebar flat. Keep floating controls inset enough for keyboard focus paint.

AI building clicks retain the transient raised popup: `.neu-panel absolute top-3 bottom-6 left-3 w-80 max-w-[calc(100%-5rem)] rounded-2xl`. Reserve the map-control column with at least 12px clearance and keep phone controls at 44px. The popup never appears beside the Tools rail.

### Entrance Geometry

Verified entrance points project to the nearest exterior or courtyard footprint segment within 4 metres. The ground layer draws a compact, solid triangular arrowhead with no stem from the non-building side toward the doorway. Arrow vertices stay on the ground plane; `depthCompare: "less-equal"`, disabled depth writes, and a `[-1, -1]` rasterization depth bias prevent basemap z-fighting without lifting the geometry. The 3D layer draws a neutral door outline with width parallel to the wall, height on the vertical axis, and vertices on the matched wall plane. Door strokes use `depthCompare: "less-equal"`, disable depth writes, and apply a `[-1, -1]` rasterization depth bias through `getPolygonOffset`; the marker wins the coplanar depth comparison without exposing a physical gap at oblique angles. Selected-building entrances render at the focused camera; all valid entrances appear at zoom 16 and above. Missing, ambiguous, or undocumented entrance data produces no marker.

### User Menu

Use the full-width avatar and username row, or an icon-only trigger in the collapsed sidebar. The avatar uses the existing primary-container material. Keep the trigger's 44px phone target and neutral hover/press feedback.

The account popover is a labeled non-modal dialog because it combines appearance radios with Settings and Sign out actions. Use native links and buttons inside it, preserve theme-radio arrow keys, and keep Tab order natural. Its `.glass-neu rounded-2xl p-2` material matches the anchor width. Use the shared overlay-presence animation for entry and exit, without a second local keyframe. Show placement visibility immediately so initial focus can enter; never transition that visibility flag. Escape closes the account dialog before the drawer, including when focus rests on its trigger. Sign out retains the error-colored hover treatment.

## Motion

Use movement to acknowledge actions and explain state. The phone mode indicator supplies the focal continuity cue: it moves across the bar while destination content replaces the prior route. Keep static reading content still. Do not add list-wide or page-load choreography merely because a surface renders.

### Shared motion contracts

- **Overlay presence**: `useOverlayPresence` owns 220ms arrivals and 140ms exits using opacity and a small translation/scale. Popovers originate toward their anchor; dialogs enter over an independently fading backdrop. Stop interrupted animations at their current style. Exiting content becomes inert and hidden from assistive technology immediately; release modal focus and page inertness at logical close. Defer synchronous removal until the presence parent has registered the exit, including reduced-motion and unsupported-animation paths.
- **Inline disclosure**: `Disclosure` expands grid rows over 240ms and collapses over 160ms, preserving the closing payload while deactivating its controls. Keep focus immediate and reveal the same focused control after that opening completes and layout settles. Cancel pending reveal on further input, focus departure or a motion-preference change; clean up on close and unmount. Reduced motion and initially visible content settle after layout. Edge-mounted controls use inset focus paint inside the animation mask; padded descendants retain their own treatment. Use it for Filters, Add/Move destinations, course show-more, and common free time. Keep its wrapper outside measured draggable cards and preserve caller-owned values.
- **Native details**: Browsers supporting `::details-content` and intrinsic-size interpolation animate the bounded block size over 240ms and opacity over 160ms. Disable the pseudo-element transition under reduced motion. Other browsers keep the 200ms native-details intro. Keep plain thinking text mounted so native collapse can finish.
- **Arrivals**: `ui-content-enter` gives new data or visible views a 180ms opacity reveal. `ui-notice-enter` adds 4px of travel over 200ms for feedback. `ui-popover-enter` gives unmeasured local presentation layers a 220ms reveal; never animate a positioning layer. `ui-chart-enter` scales grade bars from their bottom edge over 320ms while counts and axes update immediately.
- **Freshness and identity**: Remove invalidated routes, groups, and committed search suggestions immediately. Animate only the successor. Do not replay rich-result arrival on streaming updates, remount graph/camera state, replace the active form while saving, or retain obsolete drop targets. Measure popover layout dimensions rather than its animated bounding rectangle.
- **Notifications**: Keep transient messages above phone navigation through `app-notification-stack`, bounded to the viewport. Retain their existing dismissal timers and item cap; use 200ms entry and 140ms exit.

### In-App Motion

- **Spring physics**: Draggable and gesture-driven surfaces use `type: "spring"` with `stiffness: 300, damping: 30` through the `motion` library.
- **Message entrance**: Spring (stiffness: 400, damping: 25) — opacity 0→1, translateY(6px→0). Quicker than panels, gentle overshoot.
- **Tool badge stagger**: Spring (stiffness: 500, damping: 30) with `delay: i * 0.05`. Snappy, minimal overshoot.
- **Suggestion pills / error banners**: CSS `animate-message-in` (200ms ease-out, opacity + translateY) with `animationDelay` for stagger. CSS rather than spring because staggered delay is cleaner for static lists.
- **Button states**: shadow change on hover, inset shadow + scale(0.98) on press. No translate — buttons never shift position on hover or active. 150ms ease-out.
- **Mode selection**: The 24px phone mode indicator sits 4px below the bar's content top and moves between equal-width mode regions with a 280ms transform transition. Current labels and icons change without waiting for route loading.
- **Menus and dialogs**: Use shared overlay presence. Position and focus the surface immediately, then animate its presentation. Do not transition placement visibility.
- **Details and view changes**: Use native details or `Disclosure` for flow changes. Compact workspace, prerequisite view, and schedule-day switches reveal the incoming region without replacing mounted state.
- **Route navigation**: On click, `ShellNavigationProvider` updates the sidebar selection, shell mode, and destination content in one render before the URL commits. React unmounts the outgoing route tree. Navigations use a 180ms opacity fade. A fixed 2px progress line appears after 120ms and takes no layout space.
- **Route loading**: Shell boot, new chat, conversation history, Answer Canvas, and workspace routes use geometry-matched skeletons. Loading footers and feedback rows reserve the same space as loaded controls. Heavy canvases reveal with opacity after setup.
- **Answer Canvas**: Change desktop geometry immediately while contents crossfade. On phones, retain the 80% viewport height, material, and mounted drag handle through entry and exit. Animate the individual `translate` property and opacity over 300ms with `--neu-ease`. Make opening visibility immediate before focus; retain closing visibility through the fade. Deactivate closing controls and release drag capture at logical close. Reduced-motion users switch immediately.
- **Sidebar/map content crossfade**: CSS opacity transitions use 200ms with a 75ms reveal delay and immediate hide.
- **Easing fallback**: `--neu-ease` (cubic-bezier 0.16, 1, 0.3, 1) serves CSS transitions such as the mobile drawer, bottom sheet, profile menu, and button micro-interactions. Micro-interactions use 150ms; mobile panels use 250–300ms.

### Landing Page Motion

The landing page uses an expressive motion vocabulary distinct from the app:

- **Spring physics**: `type: "spring"` with `stiffness: 80-120, damping: 18-20` for hero elements and hero CTAs. Final CTA section uses timed easing (`[0.16, 1, 0.3, 1]` at 500ms) instead of spring for a calmer re-entrance.
- **Blur reveals**: `filter: "blur(12px)"` → `"blur(0px)"` on hero text entrance.
- **Scroll-driven parallax**: `useScroll` + `useTransform` for z-depth separation on product mock (chat panel vs map panel shift at different rates). Final CTA section has a subtle vertical parallax (40px → -15px).
- **Scroll reveals**: `.reveal[data-inview]` triggers `rise-in` (420ms `--neu-ease`, translateY 24px→0).
- **Product mock perspective**: `perspective: 1200px` with motion z-values on child panels. No rotateX tilt — the depth comes from z-separation alone.
- **Topo drift**: Background texture animates at 30s ease-in-out infinite, translating and rotating subtly.
- **Conditional header**: `neu-panel` class applied on scroll, adding shadow dynamically.
- **Header gradient overlay**: `oklch`-based multi-stop gradient from solid `--background` to transparent over 48px (h-48), masking the fixed header's scroll bleed. Uses `color-mix(in oklch, ...)` for smooth perceptual transitions.
- **Footer**: `mt-32 text-muted text-sm text-center`. Single line of attribution. No decoration.

### Reduced Motion

Under `prefers-reduced-motion: reduce`, use 0.01ms CSS animations with one iteration and disable transitions, including the native details pseudo-element. Keep resulting colors, visibility, and feedback legible. Pass zero duration and no spatial exit target to Motion animations. Shared overlays appear immediately and remove their closing DOM after the parent's layout registration. Graph zoom and locate scrolling apply without travel. Thinking loops and the theme ripple stop. Do not animate browser-driven viewport resizing.

## Accessibility Patterns

- **Touch targets (Impeccable override)**: Use a 32x32px minimum active hit area. This user-approved rule overrides Impeccable's default 44px minimum. Keep larger component dimensions where documented; back buttons retain their existing 44px square targets. Preserve spacing between adjacent targets and visible keyboard focus.
- **Focus indicators**: `focus-visible:ring-primary/40 ring-2 ring-offset-1` on inputs, `ring-offset-2` on pills. `.neu-button`/`.neu-primary-button` use a 2px outline at 40% primary opacity with 2px offset (CSS-defined). Never hidden behind mouse-only styles.
- **Safe-area insets**: Reserve top and side insets in the phone shell and the bottom inset in its mode bar. Keep 12px of composer bottom padding above that bar. Workspace bodies and the embedded Explore sheet add no second bottom inset. Independent drawers, dialogs, and Answer Canvas sheets retain their own safe-area padding. Use the reported visual viewport at normal scale for the shell and its fixed overlays; verify keyboard and notch behavior on physical devices.
- **Screen reader**: `sr-only` for status announcements, `aria-label` on icon-only buttons, `role="img"` on labeled icons.
- **Keyboard**: Tab through messages, Enter to send, Escape to dismiss overlays. `role="radiogroup"` on theme toggle.

## Do's and Don'ts

### Do:

- **Do** apply `.neu-panel` / `.neu-raised` / `.neu-inset` for composed surfaces. They carry the unified shadow recipe.
- **Do** use `--muted` (`#5a6066`) for all subdued text (placeholders, timestamps, metadata). Never `--outline` or `--outline-variant` for text.
- **Do** use spring physics for isolated draggable surfaces and `--neu-ease` (cubic-bezier 0.16, 1, 0.3, 1) for CSS-only transitions such as drawers, sheets, and menus. Keep navigation fades to 180ms and mobile panel travel to 250–300ms.
- **Do** respect `prefers-reduced-motion`. All animations collapse to 0.01ms, reveals show at once, the thinking orb freezes.
- **Do** use `[data-theme="dark"]` for theme switching. Never `prefers-color-scheme` media query. The user controls the theme, not the OS.
- **Do** keep mobile pages and their primary workspace regions flat and edge-to-edge. Use resting depth on controls, contained cards, desktop panels, and overlays.
- **Do** use asymmetric bubble radii (flat corner on the tail side) to indicate message direction.
- **Do** use opacity modifiers on color tokens for tinted backgrounds and state indicators.
- **Do** enforce the 32px minimum touch target through `size-8` or equivalent hit-area dimensions. Preserve larger documented targets, including 44px back controls.
- **Do** use `env(safe-area-inset-bottom)` for bottom-pinned elements on iOS.

### Don't:

- **Don't** mix Tier 1 (`shadow-*` Tailwind utilities) and Tier 2 (`.neu-*` classes) on the same element. One shadow system per element.
- **Don't** add `border` to `.neu-panel` or `.neu-raised` elements. Exception: `.neu-button` uses designed 1px border-subtle. `.glass-neu` uses 1px border-subtle as part of its glass definition.
- **Don't** use pure black in new shadows in light mode. Warm gray (`rgba(91-174,...)`) for composed recipes. Exception: `.glass-neu` drop shadow and `.neu-primary-button:active` inset use `rgba(0,0,0,...)` at very low opacity (6-10%) where the visual difference from warm gray is imperceptible.
- **Don't** apply `backdrop-filter` outside `.glass-neu`. Glass is for overlay surfaces (dropdowns, mobile drawers), never decorative.
- **Don't** animate shadow values directly in new code (expensive repaints). The chat composer focus-within transition and the landing header's conditional shadow are existing exceptions where the transition is on a single element with no alternative.
- **Don't** apply neumorphic depth to text content. Depth frames containers. Content stays flat inside.
- **Don't** use font-weight 700 or above. Maximum is 600 (markdown strong, table headers, list markers).
- **Don't** use primary indigo for background fills, decorative accents, or large surfaces. It means "interactive" or "active state."
- **Don't** retain outgoing route trees or animate layout properties during navigation. Replace stale content with the destination or its matched loading surface, then animate opacity.
- **Don't** use blur reveals in the app shell. Those belong to the landing page only. CSS `--neu-ease` handles micro-interactions and gesture-driven slides.
- **Don't** wrap a phone's main view in a rounded card or restore shell gutters below 640px. Keep content and control padding inside the full-width page.
- **Don't** create new shadow recipes without documenting them. Use `--neu-surface-shadow` or `--neu-inset-shadow` from Tier 2, the five elevation utilities from Tier 1, or the sanctioned `.chat-message-well` recipe.
