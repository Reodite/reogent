---
version: 1
slug: "src-components-schedule-schedule-app-tsx"
primary_target: "src/components/schedule/schedule-app.tsx"
related_targets: ["src/components/schedule-planner/schedule-planner-pane.tsx"]
---

## Scope and mode

Operate mode for the shared timetable experience used by `src/components/schedule/schedule-app.tsx` and `src/components/schedule-planner/schedule-planner-pane.tsx`.

## Audience and job

UBC students need to read a dense week at a glance, build a conflict-aware personal timetable, or compare a group without learning two calendar interfaces.

## Tasks and states

The week remains visible from the first visit, including an empty grid. Planner users search or import courses, receive automatic section choices, and drag a selected section onto an alternate slot. Sharer users import, filter people, inspect blocks, and share groups without modifying courses. Planner imports ask whether to merge or replace. A compact section picker lives in course details for keyboard, touch, and precise changes.

## Direction

The week owns the workspace. A contextual left rail carries course controls in the planner and people/group controls in the sharer. The header carries title, term, import, and route-specific actions. On narrow screens, Schedule opens first and the rail becomes the second tab.

The memorable interaction is a section drag: alternate slots appear inside the live week, then the selected course springs and tilts into its new section using the degree planner’s drag physics.

## Constraints

Keep Reodite’s established whisper-neumorphic material and course color coding. Use one shared timetable renderer and typography hierarchy. Preserve reduced motion, keyboard access, mobile fit, and existing server persistence.
