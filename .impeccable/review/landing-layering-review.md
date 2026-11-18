# Landing carousel layering review

Target: `src/components/landing/feature-showcase.tsx` on `/`.

## Change

Keep the existing previews, geometry, 3D perspective, looping navigation, and gestures. Assign each card a stacking level from its animated distance to center. Use flat sibling composition so whole cards retain that order. Keep the nearest card opaque until the next card takes the foreground; fade the cards behind it and hide distant cards before wrapping.

## Reproduction and confirmation

- Before the fix, all 36 sampled transition states failed the foreground check. Rear cards covered parts of the front card, and foreground opacity dropped to 0.736 near the midpoint.
- After the fix, all 36 states passed across Agent capabilities, Tools, and Unity at 1440px, 390px, and dark-mode 320px. Check both sides of the midpoint in both directions, including the first-to-last boundary.
- For each held drag, sample hit-testing across the nearest card and compare a screenshot strip with the rear cards visible versus hidden. The fixed version had no incorrect hit targets and no changed pixels above the 2/255 per-channel tolerance. The largest channel difference was 1/255.
- A separate navigation run passed 489 checks at 1440px, 768px, 390px, and 320px. Coverage includes all cards, wrapping, interruption, keyboard focus, trackpad gestures, touch swipes, cancellation, vertical page scrolling, resize preservation, and reduced motion. Animated foreground cards retained full opacity and the highest stacking level throughout sampled navigation frames.
- The regression tests failed before implementation: three foreground-opacity failures and the obsolete `preserve-3d` expectation. After implementation, all 33 focused landing tests passed.
- Full suite: 208 files and 2,677 tests passed. Production build, TypeScript, and repository lint completed with exit 0. Targeted lint reported no diagnostics in the two changed code files. Changed source files pass Prettier.

## Existing findings outside this fix

- Reduced-motion hydration still reports initial-style differences in the unchanged landing hero and closing action. The carousel server-markup test passes across motion preferences.
- Repository-wide Prettier reports 134 unrelated files. No changed source file appears in that list.
- Build output includes filesystem-tracing warnings in `src/server/data.ts`. Repository lint includes existing warnings elsewhere.

## Evidence and limits

See `landing-layering-baseline.json`, `landing-layering-fixed.json`, and `landing-layering-navigation-report.json`; run the adjacent `.cjs` scripts to repeat the browser checks. Screenshots and test/build/lint logs share the `landing-layering-` prefix.

The image adapter does not expose screenshot pixels for visual review. Automated pixel comparisons verify foreground occlusion, and browser checks verify computed styles, geometry, and interaction behavior. They do not establish overall aesthetic quality, other browser engines, or physical-device performance. Stop after the desktop/mobile reproduction and confirmation rounds; no unrelated visual changes.
