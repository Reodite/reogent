# Requirements Document

## Introduction

This document captures the requirements for redesigning the **Reogent dashboard** — the `/chat` workspace shell that merges **reogent's** agentic chat with **reoditetools'** standalone non-AI tools behind a single mode toggle.

The current shell is incoherent and partially non-functional. The tool rail vanishes the moment a pane opens, so desktop users cannot close or switch panes; the map — this product's central answer surface — is treated as a 50% side pane that competes with chat; and mobile is split across overlapping bottom sheets with no consistent entry pattern.

This redesign replaces the ambiguous single-mode shell with a **dual-mode workspace**:

- **AI Mode (default)** — conversational. The left sidebar lists chat sessions; the center is the chat; the right is an **Answer Canvas** the agent drives live. Each tool the agent invokes during a response embeds a **Response Widget** in that response message that summarizes the result it showed. The agent controls the canvas as it responds; the user stays in control by activating any earlier widget to re-display that view. The conversation thus becomes a replayable timeline of every view the agent presented.
- **Tools Mode** — no chat. The left sidebar lists tools. The selected tool fills the **entire workspace** (the area AI Mode splits into chat and canvas), giving standalone tool use the full screen.

The Response Widget mechanism dissolves the separate preempt-and-restore flow the old shell needed: the prior view is never lost, it is one message-scroll-and-click away, and it survives reloads because widgets live in the persisted message history.

**Scope (the Visual Shell):**

- The Mode Toggle, its persistence, and its effect on the left sidebar.
- The AI-mode region model: Session List, Chat Surface, Answer Canvas.
- The Response Widget: agent-driven canvas switching and user-driven revisit.
- The Tools-mode region model: Tool List and Full-Bleed Tool.
- Responsive behavior per mode; wayfinding; keyboard, screen-reader, and reduced-motion access; non-regression.

**Preserved as canonical (no behavior change):**

- Reogent's server-side streaming tool-calling agent (NDJSON event stream, 20 tools across 12 modules), the LLM adapter (`LLM_API_TYPE`), and the agent's `showOnMap` contract for emitting map answers.
- The four tool features' internals — Course Lookup, Prereq Tree, Calendar, Campus Map — including their components and data. This redesign rearranges their *hosts*, not their contents.
- JWT auth, the `RequireAuth` gate, Postgres + Meilisearch data layer, MapLibre GL + deck.gl map internals, the Whisper-Neumorphic design tokens, and the theme system (`data-theme`, View Transitions ripple).
- Session persistence and optimistic session operations (add / rename / remove).

**Explicitly excluded from scope:**

- Tool contents: course-card fields, prereq-tree graph rendering, calendar month grid, map layer composition — those belong to their feature specs.
- Agent tool definitions, tool-selection logic, and server-side streaming protocol.
- Auth flows (login/signup), marketing landing, and account-menu internals.
- New tool types. The redesign works with the four existing tools; adding a tool later must not require changing the shell.

## Glossary

- **Reogent Shell**: the `/chat` workspace UI. Encompasses every region defined here across both modes.
- **Mode Toggle**: the "AI mode" switch rendered at the bottom of the left sidebar. Selects between AI Mode and Tools Mode, persists to `localStorage`, and restores on load. AI Mode is the default.
- **AI Mode**: the conversational mode. Left sidebar = Session List; center = Chat Surface; right = Answer Canvas.
- **Tools Mode**: the direct-use mode. Chat is absent. Left sidebar = Tool List; the selected tool is a Full-Bleed Tool across the workspace.
- **Top Bar**: the persistent header. Holds the brand, the below-Wide Map entry in AI Mode, the theme toggle, and the account menu. Stays mounted across both modes.
- **Left Sidebar**: the persistent column left of the workspace. Contains the Session List in AI Mode or the Tool List in Tools Mode, plus the Mode Toggle at its bottom.
- **Session List**: the left-sidebar contents in AI Mode — conversation history, the new-conversation action, and the footer Mode Toggle.
- **Tool List**: the left-sidebar contents in Tools Mode — entry points for Course Lookup, Prereq Tree, Calendar, and Campus Map, plus the footer Mode Toggle.
- **Chat Surface**: the center region in AI Mode that renders the message list and the input composer. Sits in the `#main-content` focus target and skip-link destination.
- **Answer Canvas**: the right region in AI Mode that renders one tool's result at a time. Driven by the Agent during a streaming response; revisitable by activating Response Widgets.
- **Response Widget**: an inline, keyboard-activatable card embedded in an assistant response message. Identifies the tool the Agent invoked, summarises the result it showed in the Answer Canvas, and, when activated, loads that tool's result back into the Answer Canvas.
- **Active Tool View**: the tool result currently rendered in the Answer Canvas; corresponds to the most recently activated Response Widget.
- **Idle Map Overview**: the Answer Canvas state shown when no Response Widget has been activated — a non-interactive campus map at a default extent.
- **Full-Bleed Tool**: in Tools Mode, the selected tool rendered across the entire workspace area (the area AI Mode splits into Chat Surface and Answer Canvas).
- **Agent**: the server-side streaming tool-calling agent. Emits tool results during a response.
- **Wide Viewport**: a viewport at least `1024px` wide (`lg`). Regions sit side by side.
- **Medium Viewport**: a viewport at least `768px` and below `1024px` (`md`, below `lg`). The left sidebar collapses to a drawer; overlays surface the map and panes.
- **Narrow Viewport**: a viewport below `768px` (`md`). The Chat Surface is primary; the Answer Canvas and the Full-Bleed Tool surface via Bottom Sheets or full-screen takeovers.
- **Bottom Sheet**: a viewport-bottom overlay used on below-Wide viewports, with a scrim, a grabber, a header Close Control, and dismissal on scrim tap or Escape.
- **Inert Management**: applying the `inert` attribute to regions behind an open drawer or sheet so they are removed from the tab order and the accessibility tree.
- **Reduced-Motion Preference**: the OS-level `prefers-reduced-motion: reduce` signal. Shell animations collapse to near-zero duration when active.
- **showOnMap Contract**: the Agent's existing entry point for emitting a map answer (building highlight, walking route). Preserved unchanged by this redesign.

## Requirements

### Requirement 1: Mode System

**User Story:** As a UBC student, I want to switch between chatting with the agent and using standalone tools, so that each mode fits a different task.

#### Acceptance Criteria

1. THE Shell SHALL render a Mode Toggle labeled "AI mode" at the bottom of the Left Sidebar.
2. WHEN the Mode Toggle is enabled, the Shell SHALL enter AI Mode.
3. WHEN the Mode Toggle is disabled, the Shell SHALL enter Tools Mode.
4. WHEN the Mode Toggle changes, the Shell SHALL swap the Left Sidebar contents between the Session List and the Tool List.
5. THE Shell SHALL set AI Mode as the default on first load.
6. WHEN the user toggles the mode, the Shell SHALL persist the choice to `localStorage` and restore the chosen mode on the next load.
7. THE Mode Toggle SHALL remain visible at the bottom of the Left Sidebar in both modes on every viewport.

### Requirement 2: AI Mode Region Layout

**User Story:** As a student chatting with the agent, I want the conversation and the agent's results side by side, so that I read messages and see their answers together.

#### Acceptance Criteria

1. WHILE in AI Mode on a Wide Viewport, the Shell SHALL render the Session List, the Chat Surface, and the Answer Canvas as distinct, non-overlapping regions side by side.
2. WHILE in AI Mode, the Shell SHALL keep the Chat Surface mounted and never collapse it behind another region.
3. WHEN no Response Widget has been activated in the current session, the Shell SHALL render the Idle Map Overview in the Answer Canvas.
4. WHILE in AI Mode on a below-Wide viewport, the Shell SHALL present the Chat Surface as the primary region and surface the Answer Canvas via a Bottom Sheet opened from the Top Bar.
5. WHEN the Answer Canvas opens as a Bottom Sheet on a below-Wide viewport, the Shell SHALL apply a scrim behind the sheet, set `inert` on the underlying content, and dismiss the sheet on a scrim tap or an Escape keypress.

### Requirement 3: Response Widgets and the Agent-Driven Answer Canvas

**User Story:** As a student, I want the agent's tool results to appear on the right as it answers, and earlier results to remain clickable cards in the chat, so the conversation is a replayable timeline of views.

#### Acceptance Criteria

1. WHEN the Agent invokes a tool during a streaming response in AI Mode, the Shell SHALL render that tool's result in the Answer Canvas as the Active Tool View.
2. WHEN the Agent invokes a tool during a streaming response, the Shell SHALL embed a Response Widget in the assistant's response message that summarises the result the Agent showed in the Answer Canvas.
3. THE Response Widget SHALL identify the tool it represents, carry a short summary of the result, and be keyboard-activatable.
4. WHEN the user activates a Response Widget from any response in the history, the Shell SHALL load that widget's tool result into the Answer Canvas as the Active Tool View.
5. WHILE the Answer Canvas shows an Active Tool View, the Shell SHALL keep the Chat Surface scrollable so the user can browse Response Widgets without losing the active view.
6. WHEN the Agent invokes a new tool while the user is viewing an earlier Response Widget's Tool View, the Shell SHALL replace the Answer Canvas with the new tool's result; the user's prior view SHALL remain reachable by activating its Response Widget.
7. IF the Agent invokes a tool the Answer Canvas cannot render, the Shell SHALL embed the Response Widget anyway and show a fallback message in the Answer Canvas.
8. WHEN the Shell reloads a session in AI Mode, the Shell SHALL re-activate the most recent Response Widget's Tool View in the Answer Canvas, or render the Idle Map Overview when no widget exists.

### Requirement 4: Tools Mode Region Layout

**User Story:** As a student who wants to use a tool directly, I want a clean tool list and the tool filling the screen, so that I get the full workspace for that tool without chat in the way.

#### Acceptance Criteria

1. WHILE in Tools Mode, the Shell SHALL not render the Chat Surface or the input composer.
2. WHILE in Tools Mode, the Shell SHALL render the Tool List in the Left Sidebar.
3. WHEN the user selects a tool from the Tool List, the Shell SHALL render that tool as a Full-Bleed Tool across the workspace area that AI Mode splits into the Chat Surface and the Answer Canvas.
4. THE Full-Bleed Tool SHALL occupy the full width and height of that workspace area.
5. WHEN the user selects a different tool from the Tool List, the Shell SHALL swap the Full-Bleed Tool to the newly selected tool.
6. WHILE in Tools Mode on a below-Wide viewport, the Shell SHALL collapse the Tool List into a drawer and keep the selected tool Full-Bleed.

### Requirement 5: Switching and Closing Overlays

**User Story:** As a student, I want to change what I am viewing and dismiss overlays without getting stuck, so the shell never traps me.

#### Acceptance Criteria

1. WHEN the user activates a Response Widget different from the Active Tool View, the Shell SHALL switch the Answer Canvas to that widget's tool result in a single action.
2. WHEN a Bottom Sheet for the Answer Canvas is open on a below-Wide viewport, the Shell SHALL expose a Close Control in the sheet header that dismisses the sheet.
3. WHEN the user activates the Close Control on an Answer Canvas Bottom Sheet, the Shell SHALL dismiss the sheet and return focus to the control that opened it.
4. WHILE in Tools Mode, the Shell SHALL render exactly one Full-Bleed Tool at all times, so that selecting another tool replaces rather than stacks.
5. THE Shell SHALL support keyboard activation for every Mode Toggle, tool selection, Response Widget, and Close Control.

### Requirement 6: Wayfinding

**User Story:** As a student, I want to reach the mode toggle, sessions, tools, the map, theme, and my account from any state, so that I never get stranded inside one view.

#### Acceptance Criteria

1. THE Top Bar SHALL remain mounted across both modes and expose the theme toggle and the account menu.
2. THE Mode Toggle SHALL remain visible at the bottom of the Left Sidebar in both modes and on every viewport.
3. WHILE in AI Mode, the Shell SHALL expose the new-conversation action in the Session List.
4. WHILE in Tools Mode, the Shell SHALL expose the Tool List as the sole Left Sidebar contents above the Mode Toggle.
5. WHILE in AI Mode on a below-Wide viewport, the Shell SHALL expose a single Map entry in the Top Bar that opens the Answer Canvas as a Bottom Sheet.
6. WHEN the Agent shows a result on a below-Wide viewport in AI Mode and the Answer Canvas sheet is not open, the Shell SHALL raise a visual cue on the Map entry indicating a result is waiting.

### Requirement 7: Responsive Arrangement

**User Story:** As a student, I want the layout to adapt coherently to my screen, so the app is usable on phone, tablet, and desktop without confusion.

#### Acceptance Criteria

1. WHILE the viewport crosses a breakpoint boundary, the Shell SHALL transition each region to its arrangement for the new viewport without losing the active mode, the Active Tool View, or the current session.
2. WHEN the mode changes, the Shell SHALL apply the new mode's region arrangement for the current viewport.
3. THE Shell SHALL place Chat Surface and Answer Canvas side by side on the Wide Viewport in AI Mode and surface the Answer Canvas as an overlay below it.
4. THE Shell SHALL render the Full-Bleed Tool at full workspace size in Tools Mode on every viewport.

### Requirement 8: Keyboard, Screen Reader, and Reduced-Motion Access

**User Story:** As a student who navigates by keyboard or screen reader, I want to toggle modes, open and revisit tool views, and dismiss overlays without a pointer.

#### Acceptance Criteria

1. WHEN the Answer Canvas or a Bottom Sheet opens, the Shell SHALL move keyboard focus into it; WHEN it closes, the Shell SHALL return focus to the control that opened it.
2. THE Shell SHALL expose ARIA roles and labels identifying the Top Bar as `banner`, the Chat Surface as `main`, the Answer Canvas as a labelled region, the Tool List as `navigation`, the Session List as `navigation`, and each Response Widget as a button.
3. THE Shell SHALL manage `inert` so that regions behind an open drawer, sheet, or modal are removed from the tab order and the accessibility tree.
4. WHERE the Reduced-Motion Preference is active, the Shell SHALL collapse every animated transition to a near-zero duration.

### Requirement 9: Non-Regression of Existing Behaviors

**User Story:** As a student, I want the agent's tool streaming, session management, and auth to keep working exactly as before the redesign, so that the redesign changes only the layout.

#### Acceptance Criteria

1. WHEN the user sends a chat message in AI Mode that triggers an agent tool, the Shell SHALL preserve the NDJSON streaming behavior and the Agent's ability to drive the Answer Canvas via tool invocation.
2. WHILE a session is active, the Shell SHALL preserve session switching, optimistic rename, and optimistic delete against the Session List.
3. THE `RequireAuth` gate, the theme toggle, and the account menu SHALL continue to operate across both modes.
4. WHEN the Shell re-renders across a session swap, the Shell SHALL preserve Answer Canvas state — camera, highlights, and the Active Tool View — without resetting it.
5. WHEN the Agent invokes a tool whose result maps to the existing `showOnMap` contract, the Shell SHALL render that result on the map surface as before.
