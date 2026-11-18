# Landing carousel depth review

## Scope

Reviewed `src/components/landing/feature-showcase.tsx`, its tests, and the updated carousel guidance in `DESIGN.md`.

- Cards tilt, shrink, fade, and move backward as visitors navigate.
- The stage uses clipped overflow with no horizontal scrollbar.
- Previous and next arrows flank the progress dots below the cards at each checked width.
- Arrows loop in both directions without reversing travel across the endpoints.
- The Agent capabilities, Tools, and Unity content remains in the requested order. Hero content and authentication actions remain unchanged.

## Verification

- `npm test`: 208 files and 2,674 tests passed with no failures.
- Focused landing and chat checks: 55 tests passed. The first full run timed out in an unchanged chat test while the production build ran. The full suite passed after the build finished.
- `npm run build`: exit 0. Turbopack reports existing filesystem-tracing warnings in `src/server/data.ts`.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0 with existing warnings. The changed TypeScript files have no lint diagnostics.
- Changed source and design files pass Prettier. Repository-wide formatting includes unrelated existing failures.
- Chromium: 483 checks passed at 1440, 768, 390, and 320px, including dark mode, reduced motion, each card, keyboard focus, looping, animation interruption, horizontal wheel gestures, touch swipes, cancellation, vertical page scrolling, and resizing.
- Sampled animation frames confirm translation depth, tilt, scale, opacity, and travel direction during endpoint navigation.
- `landing-depth-check.cjs` reproduces the browser checks. `landing-depth-report.json` stores computed layout and animation evidence.

The image adapter omits screenshot pixels. Review covers source, rendered geometry, computed styles, and browser interactions; it does not establish pixel-level aesthetic quality or physical-device performance.

## Existing findings

Reduced-motion page loads log a hydration warning from the unchanged hero and closing CTA in `src/components/landing/landing.tsx`. Those elements choose different initial styles on the server and client. Git blame attributes the motion-preference setup to `3981685e`. Carousel server markup stays identical across motion preferences, covered by a regression test. The browser report records the existing warning separately.

The unchanged Course lookup preview uses deliberate single-line ellipsis for long course titles on narrow cards. The report distinguishes that treatment from unexpected clipping. Feature names and footer descriptions fit at each checked width.
