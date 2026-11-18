disposition: ship

Review scope: source, browser interaction, and computed layout. This adapter omits image pixels from model input, so the review does not claim a visual pixel inspection. The harness has no separate review agent.

## persistence

PRODUCT.md and DESIGN.md exist. DESIGN.md records the carousel hierarchy, responsive controls, and reduced-motion behavior. This change extends the established landing page; it does not introduce a new visual system or generated assets.

## fidelity

| Element          | Result          | Evidence                                                                                                            |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Section order    | Match           | Agent capabilities, Tools, Unity follow the unchanged hero.                                                         |
| Feature coverage | Match           | Three agent examples, six routed Tools, three Unity pages.                                                          |
| Card composition | Match           | Product previews precede named footers with short descriptions. Browser checks confirm the geometry for every card. |
| Controls         | Adaptation      | Desktop arrows flank the strip. Phone arrows flank the dots below it to preserve preview width and touch targets.   |
| Progress         | Match           | Buttons, keyboard input, and native touch scrolling update the current dot and announcement.                        |
| Type             | Match in source | Existing Aspekta hierarchy and data-specific Commit Mono classes.                                                   |
| Material         | Match in source | Shared neutral surfaces, button primitives, course colors, and theme-aware map assets.                              |
| Ground           | Match in source | Existing background and theme tokens remain unchanged.                                                              |

## ceiling

The detector returned no findings. Chromium checks covered 1440px, 768px, 390px, and 320px layouts, including dark mode, without document overflow, clipped preview text, or runtime errors. Image captures exist for each viewport; pixel-level aesthetic review remains outside this adapter's capabilities.

## material_fixes

None from the source and browser checks. The full test suite passes, as do TypeScript and the production build. Lint exits successfully with existing warnings. Changed files pass Prettier; repository-wide formatting reports unrelated existing files.

## keep

Preserve the hero and authentication actions, complete feature coverage, lightweight illustrative previews, and visitor-controlled native scrolling.
