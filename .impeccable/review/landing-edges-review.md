# Carousel edge clipping review

Target: `src/components/landing/feature-showcase.tsx` on `/`.

## Fix

Replace the stage's `overflow-clip` with `overflow-visible`. Keep the existing landing-root horizontal clip so neighboring cards can extend through the page gutters without creating a horizontal scrollbar. Preserve the cards' own rounded clipping, dimensions, shadows, depth ordering, opacity, and navigation.

## Evidence

Compare full-width screenshot bands around each stage against the same stage with visible overflow. Cover the first and last card in each carousel at 1440px, 768px, 390px, and dark-mode 320px. Before the fix, all 24 samples showed clipped paint. After the fix, all 24 matched the unclipped reference within a 2/255 per-channel tolerance. No sample introduced document overflow or a carousel scrollbar; card corners retained their 16px radius and internal clipping.

The navigation check passed 489 assertions across the same widths, including all cards, looping, depth, foreground opacity, interrupted animation, controls, keyboard focus, wheel input, touch swipes, cancellation, vertical scrolling, resizing, and reduced motion.

The updated clipping assertion failed before implementation. All 33 focused landing tests passed afterward. The first full-suite run timed out in the unchanged chat test `a mapped tool call loads its canvas view after the stream resolves`. All 58 focused chat/landing tests passed, followed by all 208 test files and 2,677 tests with `npm test -- --maxWorkers=4`. No test timeout or source configuration changed.

Production build, TypeScript, and repository lint completed with exit 0. Changed source files pass Prettier. Repository-wide formatting still reports 134 unrelated files. Existing filesystem-tracing warnings, lint warnings, and reduced-motion hydration differences in the unchanged hero and closing action remain outside this fix.

## Artifacts and limits

Reports, screenshots, scripts, and logs use the `landing-edges-` prefix in this directory. The adapter does not expose images for visual inspection; automated pixel comparisons establish clipping behavior, and browser checks establish geometry and interactions. No physical-device or cross-engine validation. The viewport still bounds off-screen cards on narrow screens; the inner carousel frame no longer cuts them off within the page margins.
