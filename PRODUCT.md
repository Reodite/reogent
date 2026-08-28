# Reodite

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

UBC Vancouver undergraduate and graduate students. They use Reodite during two windows: (1) course registration periods (mid-March for summer, mid-June for fall, mid-October for spring) to search courses, check prerequisites, and compare tuition costs, and (2) the first two weeks of each term when campus is unfamiliar and they need walking directions between buildings.

Secondary context: mid-term schedule crunches when students need study spaces, room availability, or campus services.

They are task-focused and time-pressured, often between classes on a laptop or walking campus on a phone. They want to type a question and get a grounded answer. No exploring, no browsing.

## Product Purpose

Reodite is an AI agent that answers university-specific questions using real UBC data. It replaces checking 4-6 separate university systems (course catalog, tuition calculator, campus map, room finder, academic calendar, grade distributions) with one conversational interface.

The agent calls tools against indexed UBC datasets. When an answer has a spatial or visual dimension (walking routes, building locations, data tables), a right pane opens to show that content. Conversation is the primary surface; visual content is supplementary and agent-triggered.

## Positioning

Every answer is tool-grounded: the agent calls `search_courses`, `get_tuition`, `walking_distance`, etc. against indexed university data, not general LLM knowledge. Walking routes come from Dijkstra shortest-path on the campus pedestrian graph, not estimates. Course data comes from the real UBC course catalog. Tuition rates come from official fee schedules.

The agent calls tools with verifiable data sources. It does not answer factual UBC questions from its training weights.

## Operating Context

### Authentication

Users sign in with username and password. The system issues a JWT (HS256, 7-day expiry) stored in localStorage. All API calls require a Bearer token. No OAuth, no Google sign-in, no Cognito. Self-contained auth.

When `AUTH_ENABLED=false` (development), all requests bypass auth with a default user.

Each signed-in user can save a student profile (program, year, domestic/international) from Settings. It is stored in `user_profiles` and appended to the agent's system prompt as defaults for tuition, cost, and program tools, so the agent stops asking for them.

### Session Model

- Each conversation is a "session" with a UUID identifier
- Sessions persist in PostgreSQL across visits. A student can close the browser and resume later.
- Session title: LLM-generated from the opening exchange (max 60 characters)
- Sessions are listed in the sidebar, grouped by recency: Today, Yesterday, This Week, This Month, Older
- Starting a new conversation mints a fresh UUID and navigates to `/chat/:id`
- Sessions are created server-side on first message (upsert)

### Message Model

Each message has: role (user/assistant), content (text), optional tool_calls (JSONB array of tool invocations and results), optional interstitial (JSONB for thinking blocks and tool execution events shown during streaming).

The server appends messages in pairs (user + assistant) after the agent loop completes.

### App Layout: Three Zones

The app has three zones, left to right:

1. **Sidebar** (left): Session history list. Collapsible on desktop (3.75rem collapsed rail to 17rem expanded). Drawer with backdrop scrim on mobile (<1024px). Contains: new conversation button, session list grouped by recency.

2. **Chat panel** (center): Always visible, full-height. Contains: message history (scrollable), chat input composer (bottom-pinned). The primary and permanent surface. When no visual pane is open, chat stretches to fill the remaining width.

3. **Visual pane** (right): Conditionally visible. Appears when the agent's response includes visual content (map route, building highlight, POI pins). Disappears when dismissed. On desktop: side-by-side flex layout with chat (50% width when open, 3.75rem collapsed rail when closed). On mobile (<640px): a draggable bottom sheet (80vh height, 20% drag threshold to dismiss).

**Critical behavior**: The visual pane is agent-triggered. Users do not toggle it. The pane auto-opens when a tool call returns map-renderable data (walking_distance returns a route, find_building returns a footprint highlight, find_places returns POI pins). Users can dismiss or collapse it. It stays hidden until the next relevant tool call.

### Data Flow

1. User types a message in the chat input
2. Client POSTs to `/api/chat` with session_id and full conversation history
3. Server runs the streaming agent loop (up to 8 tool-calling iterations)
4. Events stream back as NDJSON: thinking, text deltas, tool_start, tool_end, done
5. Client renders the response as it arrives (streaming text, tool execution badges)
6. On "done" event, both messages are persisted to PostgreSQL
7. If tool results contain map-relevant data, the visual pane auto-opens with the route/highlight

### Device Contexts

- **Desktop (>=1024px)**: Sidebar + Chat + Visual Pane (when active). Sidebar is collapsible (flex layout with animated width). Visual pane transitions width.
- **Tablet (640-1024px)**: Sidebar is a drawer (hidden by default, triggered by menu button). Chat + Visual Pane side-by-side.
- **Mobile (<640px)**: Chat full-width. Sidebar is a drawer with backdrop scrim. Visual pane becomes a bottom sheet overlay (80vh, drag-to-dismiss).

## Capabilities and Constraints

### Agent Tools (22 tools across 14 modules)

| Module     | Tools                                                          | Output                                                      |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| buildings  | `walking_distance`, `find_building`                            | Route polyline + distance/time, building location + details |
| courses    | `search_courses`, `get_course`                                 | Course list with filters, full course record with prereqs   |
| tuition    | `get_tuition`                                                  | Per-credit rates by program, student type, cohort year      |
| places     | `find_places`                                                  | Points of interest with locations                           |
| spaces     | `search_study_spaces`, `find_free_rooms`, `get_room_schedule`  | Study space availability, free classrooms, room schedules   |
| admissions | `search_programs`, `get_admission_requirements`                | Program search, admission criteria                          |
| costs      | `get_cost_estimate`, `get_living_costs`, `search_student_fees` | Cost breakdowns, living cost estimates                      |
| calendar   | `get_key_dates`                                                | Academic calendar dates                                     |
| events     | `search_events`                                                | Campus events search                                        |
| parking    | `find_parking`                                                 | Parking lot availability                                    |
| pages      | `search_ubc_pages`                                             | UBC website content search                                  |
| grades     | `get_grades`, `search_grades`                                  | Grade distributions by course/instructor                    |
| people     | `find_person`                                                  | Faculty/staff directory entries, office building location   |
| food       | `find_food`                                                    | UBC Food Services outlets, meal-plan acceptance             |

The Calendar tool pane shows key dates, holidays, and campus events (the same `events` index `search_events` queries) for the visible month and the two after it, one entry per day an event runs. A header legend distinguishes academic dates, deadlines, holidays, and campus events.

### Map Capabilities

- Building footprints rendered as extruded 3D GeoJSON (deck.gl GeoJsonLayer)
- Walking routes computed via Dijkstra on pedestrian graph, rendered as animated PathLayer (2500ms draw-on with ease-out)
- POI pins via ScatterplotLayer + TextLayer labels
- Building click opens popup with details (rooms, POIs, availability)
- Basemap: CARTO Positron (light) / CARTO Dark Matter (dark) tiles via MapLibre GL
- Camera: center [-123.246, 49.2626], zoom 14.4, pitch 40, bearing -8
- Camera flies to highlighted buildings/routes on tool call

### Technical Constraints

- **Sequential tool execution**: Tool results must complete before the next LLM turn.
- **8-iteration limit**: Agent loop stops after 8 tool-calling turns. A nudge message forces a final text response at iteration 8.
- **Data freshness**: Data is as current as the last ingest script run. Not real-time.
- **No file upload**: Text-only input.
- **Single map context**: One set of highlights/routes active at a time. A new tool call replaces the previous one.

### LLM Backend

Multi-provider architecture selected by `LLM_API_TYPE` env var:

- `openai` (default): OpenAI-compatible API, defaults to local Ollama with llama3.1
- `anthropic`: Claude (claude-sonnet-4-20250514)
- `google`: Gemini (gemini-2.0-flash)

All providers implement the same adapter interface with both `converse` (single-shot) and `converseStream` (async generator) methods.

## Brand Commitments

### Visual Quality Standard

A design director at a top-tier product company would have nothing to criticize about the craft. Every pixel is intentional. This is production-grade work, not a prototype.

### Whisper-Neumorphic Depth System

Neumorphism at whisper intensity is the primary visual language:

- **Raised surfaces** (buttons, cards, panels) sit above the background via dual-direction box-shadows: dark shadow bottom-right, light highlight top-left. Light source is upper-left.
- **Recessed surfaces** (input fields, sidebar wells, content areas) sit below the background via inset shadows with the same dual-direction logic.
- **Flat surfaces** (text content, message bubbles, inline elements) have no shadow. They sit on the surface plane.

Shadows use tiny offsets (2-3px), minimal blur (4-8px), and near-transparent opacity (4-6%). Depth communicates function — raised = interactive, recessed = input, flat = content — but registers subconsciously rather than announcing itself. The interface reads as one continuous material shaped into different forms.

### Minimalism

Nothing exists without a reason. No decorative elements, no illustrations, no background patterns, no gradient flourishes. Whitespace creates hierarchy and breathing room. If an element doesn't serve comprehension, interaction, or hierarchy, remove it.

### Precision and Consistency

- Spacing aligns to an 8px grid (with a 6px sub-grid for tight icon-to-label gaps)
- Radius is consistent within element categories (all buttons share one radius, all panels share one radius)
- Two shadow tiers: utility elevation (Tailwind-mapped) and composed neumorphic (.neu-\* classes), never mixed on the same element
- In-app transitions use `cubic-bezier(0.16, 1, 0.3, 1)` for transforms and layout; opacity/filter transitions use ease-out in menus
- Text sizes form a strict hierarchy with no sizes between steps
- Colors come from a defined palette; opacity modifiers create tinted variants

### Material Honesty

Controls feel physical and unambiguous:

- A button looks pressable (raised) and animates inward on press (recessed)
- An input looks like a well you type into (recessed)
- A panel sits on top of the background (raised)
- Hover states are visible but subtle
- Active/pressed states show physical depression (shadow inversion)
- Disabled states flatten and fade, losing their depth

### Self-Teaching

You can see what is interactive and what is content without touching anything. Depth separates interactive elements from content. Element state is visible at rest, not hidden behind hover. Elevation creates hierarchy. The layout is predictable.

### Exclusions

- No corporate/enterprise/dashboard aesthetic
- No decoration, illustration, or branding
- Light mode is primary (dark mode supported via `[data-theme="dark"]` attribute, user-controlled)

### Personality

The interface has warmth and character. Copy is human, varied, and specific to UBC. Loading states, empty states, and transitions carry personality without blocking the task. The landing page is permitted to be expressive (spring animations, blur reveals, scroll-driven parallax); the app shell stays calm and disciplined. Precision and warmth coexist.

## Evidence on Hand

### Data Assets

- **Courses**: Full UBC Vancouver course catalog (subjects, titles, descriptions, credits, prerequisites, corequisites, terms offered)
- **Sections**: Individual class sections with schedules, instructors, seat counts
- **Tuition**: Per-credit rates by program (Arts, Science, Engineering, etc.), student type (domestic/international), cohort year
- **Buildings**: GeoJSON FeatureCollection with building footprints, heights, floor counts, addresses, usage types, building codes
- **Walking routes**: GeoJSON LineStrings, pedestrian-only paths connecting building entrances, with computed distances
- **Building entrances**: Derived coordinates for each building's accessible entrances (Dijkstra graph nodes)
- **Programs**: Academic programs with admission requirements
- **Events**: Campus events with dates, locations, descriptions
- **Study spaces**: Libraries, study rooms, bookable spaces
- **Parking**: Parking lots with locations and types
- **Pages**: Indexed UBC website content
- **Grades**: Historical grade distributions by course and instructor (from UBC Pair)

### Absent

- No logo, wordmark, or brand guidelines
- No design system document from a client or university
- No visual assets (illustrations, photographs, icons beyond mingcute set)
- No user research, analytics, or behavioral data
- No accessibility audit or VPAT

## Product Principles

1. **Grounded answers**: Every response is backed by a tool call to indexed data. The agent does not answer factual UBC questions from training data. The UI shows which tools were called and can display raw results.

2. **Contextual visuals**: The visual pane (map, data display) appears when the agent's response has a spatial or visual dimension. The agent triggers it. When the answer is text-only (tuition rate, course description), no pane appears. Chat fills the full width.

3. **Session continuity**: Conversation history persists across browser sessions. Students can close the tab, return tomorrow, and continue. The sidebar shows all past sessions grouped by recency.

4. **Minimal friction**: Direct to chat. No onboarding flow, no feature tour, no empty state tutorial. Sign in, type, get an answer. The design is self-explanatory.

5. **Single-material coherence**: Every surface, control, and container shares the same neumorphic treatment. Nothing looks bolted on from a different system.

## Accessibility & Inclusion

- WCAG 2.1 AA compliance as baseline (all text meets 4.5:1 contrast on its background; subdued text uses `--muted` #5a6066 which passes AA on all surfaces)
- Map content has text alternatives: when a route is displayed, distance and time are also stated in chat message text
- Chat is keyboard-navigable: Tab through messages, Enter to send, Escape to dismiss overlays
- Reduced-motion preference respected: all animations collapse to 0.01ms duration, reveals show at once, spinning elements freeze
- Screen reader support: messages are announced via sr-only live region, tool execution states communicated, icon buttons have aria-labels
- Focus indicators are visible on keyboard navigation (`ring-primary/40 ring-2` with ring-offset), not hidden behind mouse-only styles
- Interactive elements target 44x44px on mobile via `min-h-[44px]` on pills; some icon buttons remain at 36-40px where density is prioritized over the WCAG minimum
- Safe-area insets respected for bottom-pinned elements on iOS (`env(safe-area-inset-bottom)`)
