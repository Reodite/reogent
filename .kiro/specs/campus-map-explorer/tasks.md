# Implementation Plan: Campus Map Explorer

## Overview

Implement the feature in TypeScript by establishing trustworthy public map contracts first, then account favorites, entrance geometry, the Tools-only explorer, and additive AI widgets. Each unit includes its smallest regression checks before integration. Existing `MapArea`, `CampusMap`, workspace primitives, `ChatApi`, building sources, routing, and `show_widget` stay in place and gain the minimum new behavior. No new package is required.

## Tasks

- [ ] 1. Establish public building and entrance contracts
  - [x] 1.1 Add sanitized building catalog models and pure search helpers
    - Extend shared API types with `BuildingSummary`, source provenance, freshness, photo, entrance, and expanded `BuildingDetails` contracts.
    - Add pure catalog projection, acronym generation, deterministic ranking, 20-result cap, eight-code curated list validation, and building URL parse/format helpers.
    - Add fast-check properties for deterministic bounded search and selected-building URL round trips.
    - _Requirements: 2.1–2.7, 3.6–3.7, 4.1–4.7, 12.2, 12.8_
  - [x] 1.2 Sanitize public building and entrance GeoJSON
    - Extend the existing geo artifact contract with a concrete loader path for transformed collections.
    - Return only documented public building properties and current entrance points joined to official building codes.
    - Permit guest reads for buildings, entrances, and walking paths while keeping unknown artifacts rejected.
    - Add route tests for public access, property allowlists, invalid geometry filtering, and unknown artifacts.
    - _Requirements: 8.1, 8.5–8.10, 11.2, 11.7, 12.1–12.3_
  - [x] 1.3 Implement entrance marker geometry
    - Add pure Polygon and MultiPolygon boundary-ring projection in local metre coordinates.
    - Generate ground arrows and vertical door outlines only for verified entrances within 4 metres of a wall.
    - Derive wall tangent, exterior normal, bounded dimensions, and outward z-fighting offset without using undocumented source rotation.
    - Add fast-check properties and examples for exterior rings, courtyard holes, MultiPolygons, invalid coordinates, distance rejection, arrow direction, vertical planes, and dimensions.
    - _Requirements: 8.1–8.10_

- [ ] 2. Expand trustworthy building details and public routing
  - [ ] 2.1 Build the reusable Building Record loader
    - Refactor existing room, POI, and availability assembly into `loadBuildingDetails` reusable by HTTP and widgets.
    - Add documented building metadata, official addresses, verified entrance summaries, section provenance, source status, and three-state availability freshness.
    - Join POIs by official address first and spatial containment second; label the association and exclude heuristic event, person, food, and department claims.
    - Validate official image records and omit expiring or unclassified URLs.
    - Add unit tests proving field coverage, provenance, freshness, partial-source behavior, photo filtering, and unknown buildings.
    - _Requirements: 4.1–4.8, 5.1–5.9, 11.3–11.5, 12.2–12.7_
  - [ ] 2.2 Expose public detail and honest route APIs
    - Make building detail and walking route reads available to guest Tools users through the public request path.
    - Add abort signals to detail and route client methods.
    - Preserve `network` versus `estimate`; keep estimate distance text but omit drawable route geometry.
    - Add API and client tests for guest reads, network routes, estimate responses, aborts, invalid codes, and partial detail sections.
    - _Requirements: 3.8, 6.1–6.5, 11.3–11.5, 12.1–12.3_

- [ ] 3. Add account-scoped building favorites
  - [ ] 3.1 Add favorite schema and store functions
    - Add the user/building join table, uniqueness constraint, cascade behavior, and recent-save ordering.
    - Implement idempotent list, save, and remove functions with user-qualified queries.
    - Add model and database tests for repeated writes, repeated deletes, ordering, and two-user isolation.
    - _Requirements: 7.1–7.4, 7.7_
  - [ ] 3.2 Add authenticated favorite API and client methods
    - Validate requested building codes against the current catalog.
    - Add authenticated list and set-state operations to `ChatApi` without browser-local fallback.
    - Add tests for unauthorized guests, invalid codes, idempotent responses, and user isolation.
    - _Requirements: 7.1–7.7, 12.2_

- [ ] 4. Render selected buildings and verified entrances on the map
  - [ ] 4.1 Make CampusMap selection controllable without breaking AI popup behavior
    - Add controlled selected-building callbacks for Tools and retain internal cached selection plus popup for AI.
    - Frame controlled selection, keep map camera persistence, and preserve existing building, POI, route, and label layers.
    - Expose `resize()` and call MapLibre resize after a compact hidden map becomes visible.
    - Add component-level tests around controlled/uncontrolled selection state and map control wiring.
    - _Requirements: 1.1–1.4, 3.1–3.4, 10.3–10.4_
  - [ ] 4.2 Add ground-arrow and 3D door layers
    - Load the sanitized entrance collection through the cached public map API.
    - Build marker geometry once, index by building code, and display selected-building markers at focused extent or all valid markers at zoom 16 and above.
    - Render ground arrows below labels and vertical door outlines above building sides with theme tokens and no undocumented accessibility styling.
    - Add layer-descriptor tests for zoom filtering, selected-building override, theme colors, and empty/error entrance data.
    - _Requirements: 8.1–8.10, 9.4, 11.7_
  - [ ] 4.3 Prevent estimated or failed routes from drawing straight lines
    - Carry route method through map state and draw route geometry only for network paths.
    - Keep labeled estimate distance and retry state outside the path layer.
    - Add the route-projection property and representative map-layer tests.
    - _Requirements: 6.2–6.5, 9.9_

- [ ] 5. Build the Tools-only Building Rail
  - [ ] 5.1 Implement discovery, search, and directions states
    - Build one bounded `WorkspacePanel` with fixed search, Saved and Curated sections, deterministic results, keyboard listbox behavior, no-results recovery, and route-origin search.
    - Use the existing input, button, feedback, and chip primitives; keep compact targets at least 44 by 44 pixels.
    - Add component tests for initial popular state, favorites ordering, ranking, keyboard selection, query restoration, guest Save, and route-origin state.
    - _Requirements: 2.1–2.8, 3.5, 6.1–6.5, 7.4, 7.6, 10.2, 10.6–10.7_
  - [ ] 5.2 Implement comprehensive building detail content and actions
    - Render every displayable building field once under identity, address, physical building, services, rooms and spaces, entrances, and sources.
    - Add source-aware photo, room booking, dated availability, partial retry, honest empty, and broken-image states.
    - Add labeled Directions, Share, Save, Open in Google Maps, and Show on map actions with optimistic favorite rollback and accessible status announcements.
    - Add component tests for full, sparse, stale, partial-error, photo-failure, share fallback, Google URL, favorite rollback, and room booking states.
    - _Requirements: 4.1–4.8, 5.1–5.9, 6.1–6.10, 7.1–7.7, 11.3–11.6, 12.4–12.8_
  - [ ] 5.3 Compose CampusMapExplorer in MapArea
    - Render `WorkspacePage` split only in Tools and keep AI on the existing map-only surface.
    - Synchronize rail selection, map clicks, compact Map/Explore view, URL search parameter, catalog/detail request generations, favorites, share, and routes.
    - Keep both compact regions mounted; switch footprint selections to Explore and successful network routes to Map.
    - Remove the duplicate Tools popup while retaining the AI popup.
    - Add host integration tests for Tools-only rail, AI map-only rendering, deep-link reload, Back, rapid selection, stale response rejection, compact resize, and focus.
    - _Requirements: 1.1–1.4, 3.1–3.8, 10.1–10.10, 11.1–11.8_

- [ ] 6. Add backward-compatible rich AI map widgets
  - [ ] 6.1 Add exact-code widget execution
    - Preserve stored `building` widget input and output contracts.
    - Add `building_detail`, `building_entrances`, and `building_spaces` with one exact `building_code` already returned by `find_building`.
    - Reuse `loadBuildingDetails`, return type-specific subsets where appropriate, and update agent recipes and activity labels.
    - Add contract tests for legacy history, missing prior code, unknown code, rich results, and exact widget registration.
    - _Requirements: 9.1–9.3, 9.6, 9.9–9.11_
  - [ ] 6.2 Map and render rich widget results
    - Extend `MapHighlight` additively with entrance and detail flags.
    - Map valid rich widgets to building focus, entrance visibility, or room summaries while rejecting malformed coordinates.
    - Add section-aware Response Widget cards and preserve the raw-details crash fallback.
    - Add fast-check mapping properties plus click, keyboard, active-state, history restoration, and malformed-result tests.
    - _Requirements: 9.2–9.9_

- [ ] 7. Harden guest, responsive, and failure behavior
  - [ ] 7.1 Complete guest and trust-boundary coverage
    - Verify public map facts work with no account while favorites remain authenticated.
    - Verify allowlisted fields, links, photos, finite coordinates, bounded result counts, and source labels at each API and UI boundary.
    - _Requirements: 7.6, 11.2, 12.1–12.8_
  - [ ] 7.2 Complete responsive and accessibility coverage
    - Verify wide 20rem rail geometry and compact Map/Explore switching without WebGL remount, page overflow, stale detail, or lost focus.
    - Verify headings, listbox semantics, statuses, text alternatives, keyboard map access, 44px compact targets, and zero-duration reduced motion.
    - Add layout and accessibility regression tests for required viewports and both themes.
    - _Requirements: 10.1–10.10, 11.1–11.8_

- [ ] 8. Checkpoint: complete automated verification
  - Run focused tests, the full Vitest suite, TypeScript, Biome, changed-file Prettier, the UI detector, and the production build. Fix any failures before visual review.

- [ ] 9. Integrate design documentation and retire stale map paths
  - [ ] 9.1 Update product and design contracts
    - Record the Tools-only explorer, AI map-only widget behavior, data provenance, compact composition, entrance grammar, action hierarchy, and photo constraints in `PRODUCT.md` and `DESIGN.md`.
    - _Requirements: 1.1–1.4, 4.1–4.8, 8.1–8.10, 9.1–9.11, 10.1–10.10_
  - [ ] 9.2 Remove superseded popup-only and dead map contracts
    - Remove dead CSS selectors and misleading map comments touched by the feature.
    - Keep AI popup behavior, pane cache compatibility, stored widget compatibility, and raw fallback behavior.
    - Add or update regression tests for retained contracts.
    - _Requirements: 1.2–1.4, 9.7–9.9_

- [ ] 10. Final checkpoint: verify the complete map experience
  - Run the final automated gate and bounded desktop/mobile browser matrix. Confirm search, popular and saved lists, details, rooms, photos, actions, routing, entrances, widgets, guest access, deep links, Back, accessibility, reduced motion, layout stability, console, and network health before the final commit.

## Notes

- All test tasks are required because the feature changes trust boundaries, geometry, persistence, and agent contracts.
- The eight popular building codes are product-curated and validated against the loaded catalog; the UI labels the list Curated rather than claiming measured usage.
- Entrance existence comes from verified source points. Marker orientation derives from nearby footprint walls; undocumented source rotation and accessibility values remain unused.
- `method: "estimate"` supplies labeled distance text only and never a route line.
- Existing `show_widget type: "building"` stays backward compatible for saved Chat history.
- No new runtime or development dependency is planned.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.2"] },
    { "id": 3, "tasks": ["2.2", "4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.2"] },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["9.1", "9.2"] }
  ]
}
```
