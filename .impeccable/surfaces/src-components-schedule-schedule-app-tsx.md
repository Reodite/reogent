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

Search is discovery only. Partial and full-code results use one anchored combobox overlay; only click or Enter commits. Off-term results name the target and add-and-switch behavior before commit. The planner rail keeps search fixed, course modules scrolling, and the shared Workday drop area fixed. Give the size-contained course list a 12rem minimum and propagate the controls minimum through the rail. Scroll workspace content below the fixed heading and navigation when the fixed sections and list floor exceed available height. Course count must not inflate that allocation or affect the hidden compact Schedule view. Every course module exposes known component selectors inline. Unrecognized prefixes remain independent under “Additional component types” with a visible unselected count. Let its native summary paint focus outside the article; round the closed summary's lower hover corners to the article's inner curve and square them when open. Timetable activation focuses the matching selector; dragging remains the spatial shortcut.

Planner blocks show course, section, and type with a compact one-line form for short meetings. Sharer blocks show course and component because Workday data carries no section identifier. Hidden sharer members leave the grid, free-time, and Right Now together; keyed group loading never mixes a new selector with stale group content. Omit the whole Right now section when the selected term is not live or no enabled person has a schedule. Keep term discovery based on the full roster.

## Visual direction

Use the shared `WorkspacePage` geometry: 24px wide and 16px compact spacing, a 20rem controls region, and a 16px region gap. From 640px upward, keep the raised controls panel and a matching 16px-radius canvas with 2px `frame` padding around the 14px timetable frame; its own 2px gutter surrounds the 12px field. Plain Controls content shares the header's 16px horizontal inset. Below 640px, use a flat edge-to-edge page, retain 16px header and view-switch insets, and remove the timetable's outer padding and rounded frame. Present Controls as a full-width section with the same fixed 48px header, fixed search/import controls, and module scroller. Day tabs retain 44px minimum width and scroll horizontally when weekend tabs do not fit. Host context suppresses duplicate Answer Canvas titles before paint, keeps the term toolbar inside the workspace, and portals only bounded actions such as Share.

Type uses the documented 20/14/13/12 hierarchy with mono only for identifiers and measurements. Radius follows hierarchy: square mobile page and timetable edges; 16px peer panels/canvases and protected modals/sheets; 14px inset timetable frame; 12px timetable field/day strip and floating overlays; 8px ordinary actions, modules, fields, rows, blocks and selected days; 6px independent compact subcontrols; 4px selected term/view/theme segments within 8px groups with 4px padding; full only for pills/avatars/dots. Course colors keep the documented 1px edge and low-opacity surface mix. Tall sharer footers show up to four 16px avatars with the exact remainder at or above a 6rem footer-content threshold; narrower footers show the total participant count. Preserve time geometry, overlap columns, full accessible rosters and the independent People/Now avatar sizes. Loading Group fields use the same 16px controls inset as their loaded counterparts.

Keep schedule notifications in one named, bounded keyboard scroller with up to three messages. Preserve each message's material and at least 16px clearance above phone navigation at any scroll position. Bound the scrollport itself and include its internal shadow gutter in the height allowance. Retain the original expiry deadline while holding overdue messages during pointer or focus reading. Remove overdue messages after both leave. Inside Answer Canvas, anchor to its content bounds and retain modal focus/inert ownership.

## Motion direction

Animate common-free-time expansion through shared `Disclosure`, keep selected day columns mounted, and reveal new course modules and free-time bands without changing timetable geometry. Toasts use brief entry/exit above the phone mode bar. Wrap conditional dialogs in keyed presence, treating the profile Suspense fallback and loaded form as one unit. Invalidate old group details immediately rather than retaining them for exit. Reduced-motion users keep immediate state and focus changes.

## Boundaries

Preserve planner persistence, hydration journals, Workday reconciliation, section drag physics, sharer groups, imports, people toggles, free-time computation, and read-only details. The shared course combobox keeps explicit inline/overlay presentation and primary/rail density choices. No new palette, font, or animation vocabulary.

## Verification

Measure zero search layout shift; explicit full-code commit; active/off-term/duplicate/stale/error paths; inline known and additional selectors; compact/tall blocks; hidden-person derivations; keyed group switching; all three host contexts; the shared 20rem/16px workspace geometry; 55rem view switching; flat primary regions below 640px and preserved panels above it; 1440, constrained, 768, 390, and 320 widths; short viewports, safe areas, keyboard scrolling, and empty and populated axe checks. Browser emulation does not verify physical device behavior.
