---
version: 1
slug: "src-components-schedule-schedule-app-tsx"
primary_target: "src/components/schedule/schedule-app.tsx"
related_targets: ["src/components/schedule-planner/schedule-planner-pane.tsx"]
---

## Scope and mode

Operate mode for the shared timetable experience in `src/components/schedule/schedule-app.tsx` and `src/components/schedule-planner/schedule-planner-pane.tsx`.

## Audience and job

Planner users explicitly find and add courses, verify automatically chosen component sections, and compare alternatives without losing the week. Sharer users understand group, term, visible people, and free time without seeing editor affordances.

## Interaction direction

Search is discovery only. Partial and full-code results use one anchored combobox overlay; only click or Enter commits. Off-term results name the target and add-and-switch behavior before commit. The planner rail keeps search fixed, course modules scrolling, and Workday import fixed. Every course module exposes known component selectors inline. Unrecognized prefixes remain independent under “Additional component types” with a visible unselected count. Timetable activation focuses the matching selector; dragging remains the spatial shortcut.

Planner blocks show course, section, and type with a compact one-line form for short meetings. Sharer blocks show course and component because Workday data carries no section identifier. Hidden sharer members leave the grid, free-time, and Right Now together; keyed group loading never mixes a new selector with stale group content.

## Visual direction

Use the shared `WorkspacePage` geometry: 24px desktop and 16px compact padding, a raised 20rem controls panel, a 16px gap, and one inset canvas around the 10px timetable frame. The panel owns a fixed 48px header while its contained body preserves fixed search/import controls and the module scroller. Host context suppresses duplicate Answer Canvas titles before paint, keeps the term toolbar inside the workspace, and portals only bounded actions such as Share.

Type uses the documented 20/14/13/12 hierarchy with mono only for identifiers and measurements. Radius is fixed by level: 16px protected modal/sheet, 12px actions and floating overlay, 10px timetable frame, 8px modules/fields/rows/blocks, 6px compact subcontrols, full only for pills/avatars/dots. Course colors keep the documented 1px edge and low-opacity surface mix.

## Boundaries

Preserve planner persistence, hydration journals, Workday reconciliation, section drag physics, sharer groups, imports, people toggles, free-time computation, and read-only details. The shared course combobox keeps explicit inline/overlay presentation and primary/rail density choices. No new palette, font, or animation vocabulary.

## Verification

Measure zero search layout shift; explicit full-code commit; active/off-term/duplicate/stale/error paths; inline known and additional selectors; compact/tall blocks; hidden-person derivations; keyed group switching; all three host contexts; the shared 20rem/16px workspace geometry; 55rem view switching; 1440, constrained, 768, 390, and 320 widths; empty and populated axe passes. Screenshots require human review because this session has no vision model.
