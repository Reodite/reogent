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
  on-primary-container: "#1a1d3a"
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
    lineHeight: 1.5
  body-sm:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
  title:
    fontFamily: "Aspekta, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
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
    fontWeight: 450
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
    rounded: "{rounded.xl}"
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
    rounded: "{rounded.xl}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.xl}"
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
---

# Design System: Reodite

## Overview

**Creative North Star: "The Whisper Instrument"**

Every surface carries dimension at rest, but gently — barely-there shadows that register subconsciously rather than announcing themselves. Raised means interactive. Recessed means input. Flat means content. One material, shaped into different forms for different functions. No decoration, no illustration, no ornament. Quality lives in restraint: the lightest possible shadow that still communicates depth.

Shadows are whisper-quiet: tiny offsets (2-3px), minimal blur (4-8px), near-transparent opacity (4-6%). The light source never moves. You can feel what is pressable, what is a well, what is content — but you have to look closely. Physical metaphor at a murmur.

The character is calm and precise. Every radius, shadow recipe, and spacing value repeats from a finite set. Nothing is approximate. The system is small. Its application is rigorous. The landing page breaks this restraint intentionally — larger type, spring physics, blur reveals — to create contrast between marketing energy and in-app calm.

**Key Characteristics:**

- Whisper-level dimension on every surface at rest — felt, not seen
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

- **Title** (500, 1.25rem/text-xl, -0.02em): Page titles, panel headers, greeting text. One per visible viewport. Line-height varies by context: Tailwind default for text-xl or `leading-tight` (1.25) in compact headings.
- **Brand Title** (500, text-base, -0.025em): The "Reodite" wordmark in the sidebar brand header. Uses tighter tracking than standard Title.
- **Heading** (500, 1rem/text-base, -0.01em): Card titles, session names, route info primary values. Uses `leading-tight` (1.25) or `leading-snug` (1.375) in space-constrained contexts.
- **Body** (400, 0.875rem/text-sm, 1.5): Chat messages, descriptions, button labels. Base size. 14px for information density. Uses `leading-relaxed` (1.625) in chat bubbles and descriptions for extra breathing room.
- **Body Small** (400, 0.8125rem/text-body-sm, 1.5): Secondary info, timestamps, tool badge content, sidebar session previews.
- **Caption** (450-500, 0.75rem/text-xs, 1.4): Labels, metadata, navigation group headers, category names.
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

**The Mono-for-Data Rule.** Structured identifiers (course codes, times, building codes, distances, dollar amounts) render in Commit Mono. Data has a different texture than prose. Enforced in tool renderers and message formatting.

**The 14px-Base Rule.** Body text is 0.875rem (14px). Information-dense tool UI needs tighter text than a reading experience. More content visible without scrolling. Line-height stays at 1.5 for readability.

**The Landing Exception Rule.** The landing page uses text-4xl through text-6xl, custom line-heights (1.05), and tighter tracking (-0.035em). These values are exclusive to the marketing surface and never appear in the app shell.

## Layout

Flexbox with spring-driven width animations:

**Desktop (>=1024px):** `shell-body` is flex row. Sidebar (`sessions-aside`) animates width between 3.75rem (collapsed) and 17rem (expanded) via spring physics (stiffness: 300, damping: 30). Chat workspace (`chat-workspace`) is a flex row containing chat panel (flex-1) and map aside (50% when open, 3.75rem collapsed rail when closed). Map width animates with the same spring config. Content layers crossfade with 200ms CSS opacity transitions (75ms delay on reveal, immediate on hide).

**Tablet (640-1024px):** Sidebar is a drawer (slide-over with backdrop scrim), not a persistent column. Chat + map share the workspace as flex row. Map collapse supported.

**Mobile (<640px):** Single column. Chat full-width. Sidebar is a slide-over drawer with `bg-scrim` backdrop at z-40/z-50. Map becomes an 80vh bottom sheet (`fixed inset-x-0 bottom-0`) with touch drag-to-dismiss (20% of height threshold). Safe-area inset padding via `env(safe-area-inset-bottom)`.

**Spacing rhythm:** 8px grid with 6px sub-grid for tight icon gaps. Common values: `gap-1.5` (6px icon-to-label), `gap-2` (8px), `gap-2.5` (10px), `gap-3` (12px inter-panel), `gap-6` (24px message spacing). Panel padding: `p-2` (8px) sidebar outer, `p-3` (12px) workspace gaps around all panels, `px-4 py-3` (16/12px) header sections, `p-4 sm:p-6` (16/24px) chat message well. Panel and section headers (chat title, answer-canvas titlebar, sidebar top row) share one height: `h-15` (60px), `items-center px-4` on panels, `px-2` inside the sidebar, flush with the panel top edge so all header baselines align. Sidebar collapsed rail: 3.75rem (60px). Sidebar expanded: 17rem (272px).

**Canvas treatment:** `app-shell-canvas` sets flat `var(--background)` color. No gradients in the production app shell.

## Elevation & Depth

Two tiers of shadow. The defining characteristic is extreme subtlety — shadows function as a whisper, not a statement.

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

The `.neu-primary-button` rest shadow (`0 3px 8px rgba(74,78,122,0.1), -2px -2px 6px var(--neu-highlight)`) is its own inline recipe rather than referencing `--elevation-glow`. The two values differ by 1px Y-offset; they serve the same visual intent but the button recipe is authoritative.

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

**The Whisper-Dimension Rule.** Neumorphic surfaces carry depth at rest, but at minimal intensity (4-6% opacity shadows). The depth is felt rather than seen. Hover/active states modify the shadow recipe (expand or invert to `--neu-inset-shadow`).

## Shapes

**Form language:** Rounded, consistent per element size. Radius increases with element size.

- **Major panels** (chat panel, map panel, sidebar, bottom sheets): `rounded-2xl` (16px)
- **Action buttons, icon buttons, collapse/expand controls**: `rounded-xl` (12px)
- **Inner controls** (session items, details blocks, tool cards, nav items, thinking blocks): `rounded-lg` (8px)
- **Small elements** (inline code, small badges, icon containers in tool results): `rounded-md` (6px)
- **Pills** (action chips, suggestion pills, avatars, dots, credit badges): `rounded-full` (9999px)
- **Panel-level inputs** (chat composer): `rounded-2xl` (16px) — matches its parent panel radius rather than pill category
- **Landing outer frame**: `rounded-[1.75rem]` (28px) — exclusively for the product mock container
- **Chat bubbles**, asymmetric corners signal direction:
  - User (right-aligned): `16px 16px 5px 16px`, flat bottom-right means "from me"
  - Assistant (left-aligned): `16px 16px 16px 5px`, flat bottom-left means "from them"

**Border treatment:** `.neu-button` elements carry 1px `border-subtle` to enhance the sculpted edge. `.glass-neu` carries 1px `border-subtle` as its glass edge. All other `.neu-*` surfaces have no border — the shadow alone defines the edge. Borders appear on:

- Section dividers (`border-t`/`border-b` hairlines between content sections)
- Outline-style interactive pills (`border border-primary` for action chips)
- State indicators (`ring-error/30 ring-2` for validation errors)
- Content separators in assistant markdown (pre blocks get `border border-border-subtle`)

## Components

### Buttons

State changes through shadow transformation + press scale. Buttons never translate on hover or active; the surface stays put and only the shadow, filter, or scale changes.

- **Primary** (`.neu-primary-button`): `bg-primary text-on-primary rounded-xl h-9 px-4 text-sm font-medium`. Shadow: colored glow underneath (primary at 10%) + highlight behind. Hover: brightness(1.03), slightly expanded glow. Active: inset shadow (dark + light), scale(0.985).
- **Primary Large**: Same as primary but `h-12 px-8 text-base`. Used on landing CTAs and auth submit.
- **Primary Prominent**: `h-10 px-4` — slightly taller than standard for emphasis in error recovery states. Same shadow recipe.
- **Secondary** (`.neu-button`): `bg-surface text-on-surface rounded-xl h-9 px-4 border-subtle text-sm font-medium`. Shadow: surface shadow. Hover: expanded shadow. Active: inset shadow, scale(0.98).
- **Secondary Compact**: `h-9 px-3` — reduced horizontal padding for tight layouts (retry buttons, inline actions).
- **Ghost**: `bg-transparent text-on-surface-variant rounded-xl`. No shadow at rest (the one exception to whisper dimension). Hover: subtle surface background appears. Landing sign-in link uses `text-on-surface-variant hover:text-on-surface` for a softer secondary feel.
- **Icon Button**: `size-9` (36px) standard. Uses `neu-button` or `neu-panel` shadow. Contains centered icon.
- **Compact Pill** (inline tool cards): `border border-primary text-primary rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px]`. Smaller padding than suggestion pills; used inside tool result cards where space is tight. Focus: `ring-primary/40 ring-2 ring-offset-2`. Active: `scale-95`.
- **Sizes**: Standard 36px (h-9), Prominent 40px (h-10), Compact 32px (h-8), Large 48px (h-12, landing/auth only), Icon 36px.
- **Transitions**: `color`, `background-color`, `box-shadow`, `transform` at 150ms ease-out.
- **Disabled**: `disabled:pointer-events-none disabled:opacity-45` (send) or `disabled:opacity-60` (forms). Cursor: `disabled:cursor-not-allowed` on form submits.

### Cards / Containers

- **Standard panel** (`.neu-panel`): `bg-surface rounded-2xl` + surface shadow. No border, no blur. Padding: 12-16px. Used for: chat panel, map panel, sidebar, building popup, map controls.
- **Chat panel**: `.neu-panel rounded-2xl`. Internal: title bar (transparent bg, `px-4 py-3`), message well (`.chat-message-well`, recessed with deep inset shadows at `inset 0 10px 24px -22px`, 72% surface-container-low mixed with background), composer area at bottom.
- **Sidebar** (`.neu-panel rounded-2xl p-2`): Standard panel material. Anatomy, top to bottom: brand header (logo tile `size-9` + `Reodite` wordmark on the left; collapse chevron, and the close button in the mobile drawer, on the right; collapsed rail shows the tile only), mode content (session list in AI, tool list in Tools, community links in Unity) in a recessed well (`bg-surface-container-low/60 rounded-xl p-2`), then a footer stack with the AI/Tools/Unity mode toggle and account row (avatar + username, full width). The footer has no divider; spacing separates it from the rounded content well. The account menu portals out of the sidebar's `overflow-hidden` card and anchors 8px above the trigger, spanning the trigger's full width (collapsed rail: flyout to the right, 224px). It contains username, the theme radiogroup, sign out, and the version badge. The shell has no top bar. The Tools sidebar becomes a drawer below 1280px to preserve working width; other modes switch at 1024px.
- **Tool result cards**: `bg-surface-container-low rounded-lg p-3`. Flat within the message bubble. Icon containers use `bg-secondary-container text-on-secondary-container size-9 rounded-lg` (or `size-8 rounded-md` for compact variants).

### Inputs / Fields

- **Chat composer** (`.neu-inset .chat-composer`): `bg-surface-container-low rounded-2xl p-1.5`. Recessed at rest via `--neu-inset-shadow`. Focus-within: inset shadow + 2px outline ring glow (primary at 28% opacity, -2px offset). Internal: textarea (transparent bg, `px-3 py-2 text-sm`, no outline) + send button (`.neu-primary-button rounded-xl size-11 sm:size-9`, right-aligned).
- **Auth input** (`.neu-inset`): `bg-surface-container-low text-on-surface h-11 rounded-lg px-3 text-sm`. Focus: `ring-primary/40 ring-2 ring-offset-1`. Error: `ring-error/30 ring-2`.
- **Thinking state**: Animated conic-gradient border mask (2px pseudo-element with mask-composite) at 2.4s linear infinite. Send button replaced by a stop button (`.neu-button bg-surface text-on-surface-variant rounded-xl`) during generation, allowing the user to abort.

### Degree Planner

- **Composition**: Operate-mode workbench with 24px desktop padding, 16px region gaps, and 8px internal gaps. The top bar places the title above one shared toolbar row, with visible-label program selectors on the left and labeled actions on the right. The body places a fixed 320px Requirements and Find Courses rail to the left of the horizontally scrollable year board.
- **Rail**: Requirements and Find Courses are separate `.neu-panel bg-surface rounded-2xl` cards in equal grid rows. Both use `min-w-0 min-h-0`, stable scrollbar gutters, and internal scrolling; neither card shrinks to make room for the other. The rail stays visible and has no collapse control. Find Courses lists only courses not already planned. Its source row hides during drag, a successful drop removes it from the results, and lookup drags never animate back to the source.
- **Material**: Planner surfaces use neutral background, surface, and container tokens only. Primary color is limited to true affordances and state indicators such as Ask AI, focus, links, add controls, progress, and checkbox completion; errors use the error family. Study terms use tonal inset depth, course chips use tonal raised depth, and drag ghosts reuse that same elevation rather than `shadow-xl`.
- **Terms**: Every study term keeps one anatomy: header, scrollable course region, and optional full-width `Mark as co-op work term` action. Co-op cards center the icon, title, and months inside the available body with 16px side padding, omit generic placement copy, and use the inverse full-width `Switch to study term` action. Without summer, the two winter terms split all available height. Adding summer grows a second equal flex region from zero while fading in over 300ms with `--neu-ease`; removal reverses the transition. Reduced-motion users switch immediately. Summer controls remain full-width at the bottom of each year.
- **Course chips**: A fixed top row holds the course code and two 28px actions; a fixed bottom row holds the full title zone and credits. Actions never overlay or mask the course identity. On pointer drag, the overlay starts at the picked-up position, then its top-center springs under the cursor; velocity tilt pivots from that fixed top anchor. The document cursor stays `grabbing` until drop or cancel so crossing tilted surfaces never changes it. Reduced-motion users receive the anchored position immediately.
- **Course details**: Placement issues lead the popup as direct sentences. Each issue owns a separate `bg-error-container text-on-error-container` box; no heading or bullet list delays the explanation.
- **Requirements**: Manual, course, planned, and completed rows share one 36px checkbox geometry. Text captions distinguish automatic completion from manual completion instead of changing the checkmark style. Automatically planned checks retain the primary color at 50% opacity to read as disabled; manually checked requirements remain fully opaque and interactive. Each year heading uses 4px vertical padding and sticks to the top of the Requirements scroller until the next year replaces it. Degree progress owns a 16px top inset.
- **Responsive flow**: Below 768px, the board and rail stack inside one vertical scroll. The board remains keyboard-scrollable, and the two rail cards stay equal height after stacking.

### Schedule Workspaces

- **Calendar alignment**: `/tools/schedule` and `/pulse/schedule` use Calendar’s 24px desktop padding, plain 288px contextual aside, 24px region gap, and flexible data canvas. The full main panel uses the shared `workspace-surface` class for its `surface` background and 16px radius; the aside has no separate background, border, radius, shadow, or shared scrolling. Route content owns its scroll regions. The planner timetable owns its canvas boundary: a 10px `border-subtle` frame with a 2px gutter and 8px surface fields. The sharer also places that frame inside a 12px `surface` card.
- **Host-aware header**: In Answer Canvas, schedule controls portal into the existing titlebar and suppress the duplicate internal title. Full-bleed Tools and Unity use an internal header aligned to the same 288px/24px columns as the body. Tools reserves compact-menu clearance below 1280px; Unity reserves it below 1024px.
- **Planner discovery**: Search is discovery only. Partial and full-code results use one 12px floating combobox overlay; typing never changes terms, courses, or the week. Click or Enter explicitly adds. Off-term results name the switch before commit. Search stays fixed, course modules scroll, and the compact Workday action stays fixed below them.
- **Planner modules**: Selected courses use flat surface modules with 8px radius and a standard 1px border. Known component selectors remain visible. Unrecognized prefixes stay independent under “Additional component types” with a visible count when automatic selection skipped them. A timetable activation focuses the matching selector; drag remains the spatial shortcut.
- **Week canvas**: The grid renders Monday through Friday, adding both weekend columns when needed. A 56px time gutter anchors an 8 AM–10 PM minimum range at 54px per hour. Day headers and the time gutter stay visible while the canvas scrolls. The grid remains visible in loading and empty states.
- **Block anatomy**: Planner blocks center the course code and `section · type` on both axes; meetings below the tall threshold place all three on one line without changing time geometry. Sharer blocks keep course and component at the top left because Workday data carries no section identifier, while avatar footers sit at the bottom right on tall blocks. Full title, time, location, status, and people remain in accessible labels or read-only details. Blocks retain the documented course-color edge and surface mix; conflicts use the error ring.
- **Sharer flow**: Sharer controls remain read-only and follow one order: group, management, people, common free time, Right now, then personal import. People and live status use flat 44px rows without nested panels. Grid, common-free calculations, and Right now share the same enabled-person set. Keyed loading clears old group content before a new selector value appears; Share is the sole header action.
- **Radius hierarchy**: 16px is reserved for protected modals and mobile sheets; 12px for actions and floating search; 10px for the timetable frame; 8px for course modules, fields, rows, and blocks; 6px for selected term/view cells and compact subcontrols; full radius for status pills, avatars, and identity dots only.
- **Typography**: Schedule titles use the 20px title step; section headings and buttons use 14px; helper copy uses 13px; labels and metadata use 12px. Planner and sharer surfaces use Aspekta throughout, including course codes, section identifiers, times, rooms, and counts. Schedule controls use no tracked uppercase labels and no text below 12px.
- **Import**: Both routes parse Workday Excel exports in the browser. Planner imports reconcile term, component, days, and times with catalog identifiers, require a choice for ambiguous matches, list skipped rows, and ask whether to merge or replace before one atomic update. Sharer imports remain read-only calendar data.
- **Responsive flow**: At a 55rem container width, the header stacks and the aside/canvas become explicit Schedule and Controls views. The layout uses 12px padding and gaps, hides the descriptive subtitle, opens Schedule first, renders one day column with 44px tabs, and preserves term, day, and scroll state across view changes.

### Navigation

- **Session sidebar items**: `h-9 px-3 py-2 rounded-lg text-sm`. Active: `neu-inset bg-surface-container text-on-surface`; active navigation and mode controls never use accent-tinted fills. Inactive: `text-on-surface-variant`. Hover: `bg-surface-container-high text-on-surface`. Transition: all 150ms. Focus: `ring-primary/40 ring-2 ring-offset-1`.
- **Session group headers**: `text-muted uppercase text-xs tracking-[0.05em] font-medium px-2 pb-1.5`. Categories: Today, Yesterday, This Week, This Month, Older.
- **Header**: The app shell has no persistent top header. Brand lives in the sidebar (`bg-surface-container-low text-primary size-9 rounded-lg` logo tile + `text-base font-medium tracking-[-0.025em]` wordmark). Panel headers (answer canvas, drawer sections) use `px-4 py-3` flex rows.
- **Collapsed rail** (`.neu-panel`): `w-[3.75rem] rounded-2xl py-3`. Vertical label with `[writing-mode:vertical-rl] text-xs font-medium tracking-[0.06em]`. Expand button: `neu-panel size-9 rounded-xl`.

### Chat Messages

- **User bubble**: `bg-accent-subtle text-on-surface rounded-[16px_16px_5px_16px] px-4 py-3 text-sm leading-relaxed`. Right-aligned, max-width 85%. Flat on the message well surface (no shadow).
- **Assistant bubble**: `bg-surface rounded-[16px_16px_16px_5px] px-4 py-3`. Left-aligned, max-width 88%. Contains: markdown (`.assistant-markdown`), tool badges, thinking blocks (collapsible), warning cards.
- **Assistant avatar**: `bg-primary-container text-on-primary-container size-7 rounded-lg text-[0.6875rem] font-medium`. Placed beside the label row, not inside the bubble.
- **Tool call blocks**: `bg-surface-container-low rounded-lg`. Summary: `px-3 py-2 text-xs font-medium` with icon, text, and chevron/spinner. Collapsible `<details>` element. Result content: `text-muted max-h-40 overflow-auto text-xs` in pre tag.
- **Tool badges** (inline, post-message): `rounded-lg px-2 py-1 font-mono text-xs`. Success: `bg-secondary-container/15 text-on-surface-variant`. Error: `bg-error-container/40 text-on-surface-variant`.
- **Clickable tool widgets** (answer widgets in chat): hover shows `bg-surface-container-high` plus a `ring-primary/40 ring-1` affordance, so the card reads as clickable without moving. Active (the chip that opened the current pane) keeps `bg-accent-subtle ring-primary ring-2`.
- **Suggestion pills** (empty state): `border border-primary text-primary rounded-full text-xs px-4 py-3 min-h-[44px] font-medium`. Hover: `bg-accent-subtle`. Focus: `ring-primary/40 ring-2 ring-offset-2`. Staggered entrance via `animationDelay`.
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
- **Task lists**: no bullet, flex layout with `gap-0.5rem`, checkboxes accent-colored primary.

### Map Controls

- **Floating buttons** (`.neu-panel`): `size-10 rounded-2xl`. Text: `text-on-surface-variant hover:text-primary`. Transition: colors 150ms.
- **Route info card** (`.neu-panel`): `rounded-2xl px-3 py-2`. Contains icon container (`bg-secondary-container text-on-secondary-container size-8 rounded-md`) + text.
- **Zoom controls** (`.neu-panel`): `rounded-xl` containing stacked `size-10` buttons with `bg-border-subtle/60 h-px` divider between them.
- **Bottom sheet** (mobile): `neu-panel bg-surface fixed inset-x-0 bottom-0 h-[80vh] rounded-t-2xl`. Drag handle: `bg-outline/40 h-1.5 w-10 rounded-full`. Header area: cursor-grab touch-none. Dismiss threshold: 20% of height.

### Theme Toggle

Segmented control: `neu-inset bg-surface-container-low grid grid-cols-3 gap-0.5 rounded-xl p-1`. Selected: `neu-raised bg-surface text-primary size-8 rounded-lg`. Unselected: `text-on-surface-variant hover:text-on-surface`. Options: light, system, dark.

View-transition ripple on theme change: `startViewTransition` with `--ripple-x`/`--ripple-y` CSS variables driving `clip-path: circle()` expansion at 400ms ease-in-out.

### Signature: Thinking Orb

Spinning gradient sphere (1.75rem diameter) replacing the send button during agent processing:

- Outer: conic-gradient from primary-container through primary (360 degrees), 1.15s linear infinite
- Inner: surface-colored circle (inset 0.3rem) with inset shadow
- Border: 1px primary/border-subtle mix via `color-mix`
- Shadow: `--neu-surface-shadow`

Reduced-motion: static, frozen at natural angle.

### Building Popup

Aside dialog: `.neu-panel absolute top-3 bottom-6 left-3 w-80 max-w-[calc(100%-1.5rem)] rounded-2xl`. Contains:

- Header: icon (`bg-secondary-container size-8 rounded-md`) + building name/meta/address + close button (`size-9 rounded-md`)
- Scrollable content area with carousel sections
- Carousel: `snap-x snap-mandatory` horizontal scroll with nav buttons (`size-8 min-h-[44px] min-w-[44px] rounded-full` for accessible touch targets)
- Detail cards: `bg-surface-container-low rounded-lg` with image slot (`h-32`) + body text
- Status dots: `size-2 rounded-full bg-secondary` (free) / `bg-error` (busy)

### User Menu

Trigger: `neu-button bg-surface text-primary size-9 rounded-xl` with avatar initial (`bg-primary-container text-on-primary-container size-6 rounded-lg`). The trigger carries `text-primary` so the avatar container inherits the brand accent.

Dropdown: `.glass-neu rounded-2xl p-3 w-64`. Entrance: scale from 0.97 to 1 + opacity + blur(2px) to blur(0) + translateY(-6px to 0). Exit: reverse. Easing: opacity/filter at 180ms ease-out, transform at 240ms `--neu-ease`. Sign-out: `hover:bg-error/10 hover:text-error` destructive pattern.

## Motion

### In-App Motion

- **Spring physics**: Layout state changes (sidebar collapse/expand, map panel collapse/expand) use `type: "spring"` with `stiffness: 300, damping: 30` via the `motion` library. Slightly underdamped for a natural settle.
- **Message entrance**: Spring (stiffness: 400, damping: 25) — opacity 0→1, translateY(6px→0). Quicker than panels, gentle overshoot.
- **Tool badge stagger**: Spring (stiffness: 500, damping: 30) with `delay: i * 0.05`. Snappy, minimal overshoot.
- **Sidebar list stagger** (session items, tool rows, Unity links): opacity fade with spring timing (stiffness: 500, damping: 30) and `delay: min(i * 0.03, 0.3)` — shared component, plays once per list mount. No translate: rows never move, so nothing can read as a layout shift.
- **Suggestion pills / error banners**: CSS `animate-message-in` (200ms ease-out, opacity + translateY) with `animationDelay` for stagger. CSS rather than spring because staggered delay is cleaner for static lists.
- **Button states**: shadow change on hover, inset shadow + scale(0.98) on press. No translate — buttons never shift position on hover or active. 150ms ease-out.
- **Menu entrance**: Anchored menus (account menu) enter with `menu-in` (opacity 0→1, translateY(4px)→0, scale(0.97)→1, 180ms ease-out) from the anchor side. Other popovers: scale(0.97) + opacity(0) + blur(2px) → open. 150-250ms.
- **Details expand**: opacity 0→1, translateY(-4px→0), 200ms `--neu-ease`.
- **Data panel (answer canvas) collapse/entry**: CSS transition (300ms `--neu-ease`) animating `flex-grow`, `margin-left`, `opacity`, and `visibility` from a zero-width, invisible state to a `flex-1` pane, so it slides/fades in and out like the sidebar width animation. The inter-panel gap belongs to the pane's animating margin, so no leftover gap when collapsed.
- **Sidebar/map content crossfade**: CSS opacity transitions (200ms) with 75ms delay on reveal, immediate on hide. Coordinates with the spring settle.
- **Easing fallback**: `--neu-ease` (cubic-bezier 0.16, 1, 0.3, 1) for CSS-only transitions (mobile drawer, bottom sheet, profile menu, button micro-interactions). Duration: 150ms for micro-interactions, 250-300ms for mobile panel slides.

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

`prefers-reduced-motion: reduce` collapses all CSS animations to 0.01ms with single iteration. Spring animations pass `{ duration: 0 }` explicitly when `useReducedMotion()` returns true, resolving to their end state instantly. Scroll reveals show immediately (opacity: 1). Thinking orb freezes. View-transition ripple disabled via `animation: none`.

## Accessibility Patterns

- **Touch targets**: 44x44px minimum on mobile. Achieved via `size-11` on buttons or `min-h-[44px] min-w-[44px]` on visually smaller controls.
- **Focus indicators**: `focus-visible:ring-primary/40 ring-2 ring-offset-1` on inputs, `ring-offset-2` on pills. `.neu-button`/`.neu-primary-button` use a 2px outline at 40% primary opacity with 2px offset (CSS-defined). Never hidden behind mouse-only styles.
- **Safe-area insets**: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` on chat input wrapper, `pb-[env(safe-area-inset-bottom)]` on bottom sheet.
- **Screen reader**: `sr-only` for status announcements, `aria-label` on icon-only buttons, `role="img"` on labeled icons.
- **Keyboard**: Tab through messages, Enter to send, Escape to dismiss overlays. `role="radiogroup"` on theme toggle.

## Do's and Don'ts

### Do:

- **Do** apply `.neu-panel` / `.neu-raised` / `.neu-inset` for composed surfaces. They carry the unified shadow recipe.
- **Do** use `--muted` (`#5a6066`) for all subdued text (placeholders, timestamps, metadata). Never `--outline` or `--outline-variant` for text.
- **Do** use spring physics (via `motion`) for panel/layout state changes (sidebar, map). Config: stiffness 300, damping 30. Use `--neu-ease` (cubic-bezier 0.16, 1, 0.3, 1) for CSS-only transitions (mobile drawer, bottom sheet, menus). Duration: 150-300ms depending on travel distance.
- **Do** respect `prefers-reduced-motion`. All animations collapse to 0.01ms, reveals show at once, the thinking orb freezes.
- **Do** use `[data-theme="dark"]` for theme switching. Never `prefers-color-scheme` media query. The user controls the theme, not the OS.
- **Do** maintain whisper-level dimension on all surfaces at rest. Depth is the resting state, not a hover effect.
- **Do** use asymmetric bubble radii (flat corner on the tail side) to indicate message direction.
- **Do** use opacity modifiers on color tokens for tinted backgrounds and state indicators.
- **Do** enforce 44px minimum touch targets on mobile via `size-11` or `min-h-[44px] min-w-[44px]`.
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
- **Don't** use blur reveals in the app shell. Those belong to the landing page only. In-app springs are for layout state changes; CSS `--neu-ease` handles micro-interactions and gesture-driven slides.
- **Don't** create new shadow recipes without documenting them. Use `--neu-surface-shadow` or `--neu-inset-shadow` from Tier 2, the five elevation utilities from Tier 1, or the sanctioned `.chat-message-well` recipe.
