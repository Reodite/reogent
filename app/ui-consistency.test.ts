import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const uiFiles = ["app", "src/components"].flatMap((root) => {
  const directory = join(projectRoot, root);
  return readdirSync(directory, { recursive: true })
    .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
    .map((file) => ({
      path: relative(projectRoot, join(directory, file)).replaceAll("\\", "/"),
      source: readFileSync(join(directory, file), "utf8"),
    }));
});

describe("shared UI ownership", () => {
  it("disables transitions in reduced motion so positioned popovers can receive focus", () => {
    const reducedMotion =
      globalsCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reducedMotion).toContain("transition-duration: 0s !important;");
  });

  it("disables native details pseudo-element transitions under reduced motion", () => {
    expect(globalsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*details::details-content\s*\{\s*transition: none;/,
    );
  });

  it("does not delay account popup visibility before initial focus", () => {
    const profileSurface = globalsCss.match(/\.profile-menu-surface\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(profileSurface).not.toContain("visibility");
  });

  it("uses the same body metrics for inherited text and explicit controls", () => {
    expect(globalsCss).toContain("font-size: var(--text-sm);");
    expect(globalsCss).toContain("line-height: var(--text-sm--line-height);");
  });

  it("reserves workspace keyboard scroll clearance for the four-pixel focus outset", () => {
    const focus = globalsCss.match(/:where\(\.workspace-page\) :focus-visible\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(focus).toContain("scroll-margin-block: 4px;");
  });

  it.each([
    "[data-thinking-scroll]",
    "[data-grade-chart-scroll]",
    "[data-course-detail-scroll]",
    "[data-dialog-scroll]",
    ".schedule-toast-stack",
  ])("keeps %s focus paint inside its scroll boundary", (selector) => {
    const rule = globalsCss.match(/\[data-thinking-scroll\]:focus-visible,[\s\S]*?\{([^}]+)\}/)?.[0] ?? "";
    expect(rule).toContain(`${selector}:focus-visible`);
    expect(rule).toContain("outline-offset: -2px;");
  });

  it("insets only edge-mounted Disclosure controls without changing padded descendants", () => {
    const rule = globalsCss.match(/\[data-disclosure-content\] > :focus-visible\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(rule).toContain("outline-offset: -2px;");
    expect(rule).toContain("--tw-ring-inset: inset;");
    expect(rule).toContain("--tw-ring-offset-width: 0px;");
    expect(rule).not.toContain("padding");
    expect(rule).not.toContain("margin");
    expect(globalsCss).not.toContain("[data-disclosure-content] :focus-visible");
  });

  it("uses hanging task checkboxes without splitting inline content into flex children", () => {
    const item = globalsCss.match(/\.assistant-markdown \.task-list-item\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(item).toContain("position: relative;");
    expect(item).toContain("padding-inline-start: calc(0.8125rem + 0.5rem);");
    expect(item).not.toContain("display: flex;");
    expect(globalsCss).toContain(".assistant-markdown .task-list-item > p > input");
  });

  it("uses shared application heading roles outside marketing and the standalone crash fallback", () => {
    const copies = uiFiles.filter(
      ({ path, source }) =>
        path !== "app/global-error.tsx" &&
        !path.startsWith("src/components/landing/") &&
        /<(?:motion\.)?h[1-6]\b/.test(source),
    );
    expect(copies.map(({ path }) => path)).toEqual([]);
  });

  it("keeps raised action styling in Button and documented specialized controls", () => {
    const owners = new Set([
      "src/components/ui/button.tsx",
      "src/components/schedule/avatar-picker.tsx",
      "src/components/landing/product-mock.tsx",
    ]);
    const copies = uiFiles.filter(
      ({ path, source }) => !owners.has(path) && /\bneu-(?:primary-)?button\b/.test(source),
    );
    expect(copies.map(({ path }) => path)).toEqual([]);
  });
});

describe("mobile workspace framing", () => {
  const mobileLayout = globalsCss.match(/@media \(max-width: 639px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const wideLayout = globalsCss.match(/@media \(min-width: 640px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  it("reserves raised page surfaces and shell gutters for wider layouts", () => {
    const surface = globalsCss.match(/\.workspace-surface\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const workspace = globalsCss.match(/\.chat-workspace\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(surface).toContain("border-radius: 0;");
    expect(surface).toContain("box-shadow: none;");
    expect(workspace).toContain(
      "padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);",
    );
    expect(wideLayout).toMatch(/\.chat-workspace\s*\{\s*padding: 0\.75rem;/);
    expect(wideLayout).toMatch(
      /\.workspace-surface\s*\{\s*border-radius: 1rem;\s*box-shadow: var\(--neu-surface-shadow\);/,
    );
  });

  it("bleeds workspace content while preserving command insets and overlay material", () => {
    expect(mobileLayout).toContain('.workspace-page:not([data-workspace-host="answer-canvas"])');
    expect(mobileLayout).toMatch(/\.workspace-page-layout\s*\{\s*padding: 0;/);
    expect(mobileLayout).toMatch(/\.workspace-page-layout\s*>\s*:not\(\.workspace-page-body\)/);
    expect(mobileLayout).toContain("margin-inline: 1rem;");
    expect(mobileLayout).toContain(":is([data-workspace-canvas], [data-workspace-panel])");
    expect(mobileLayout).toContain("border-radius: 0;");
    expect(mobileLayout).toContain("box-shadow: none;");
    expect(mobileLayout).toContain("[data-workspace-canvas]:focus-visible");
    expect(mobileLayout).toContain("outline-offset: -2px;");
  });

  it("assigns phone safe areas to bottom navigation and uses native-size text entry", () => {
    const modeBar = globalsCss.match(/\.mobile-mode-bar\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(modeBar).toContain("env(safe-area-inset-bottom)");
    expect(mobileLayout).toContain('[data-mode-navigation="sidebar"]');
    const phoneFields = mobileLayout.match(/(?:^|\n)\s*:is\(input, textarea, select\)\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(phoneFields).toContain("font-size: 1rem;");
    expect(mobileLayout).toMatch(/\[data-chat-composer-footer\]\s*\{\s*padding-bottom: 0.75rem;/);
  });

  it("insets mobile tab feedback within the full touch target", () => {
    const effect = globalsCss.match(/\.mobile-mode-bar \[data-mode-toggle\]::before\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(effect).toContain("inset: 0.5rem;");
    expect(effect).toContain("pointer-events: none;");
    expect(globalsCss).toContain(".mobile-mode-bar [data-mode-toggle]:active::before");
    expect(globalsCss).toContain(".mobile-mode-bar [data-mode-toggle]:hover::before");
    const focus = globalsCss.match(/\.mobile-mode-bar \[data-mode-toggle\]:focus-visible\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(focus).toContain("outline: none;");
    const focusPaint =
      globalsCss.match(/\.mobile-mode-bar \[data-mode-toggle\]:focus-visible::before\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(focusPaint).toContain("outline: 2px solid color-mix(in srgb, var(--primary) 40%, transparent);");
    expect(focusPaint).toContain("outline-offset: -2px;");
    const marker = globalsCss.match(/\.mobile-mode-indicator\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(marker).toContain("top: 0.25rem;");
    expect(marker).toContain("width: calc(100% / 3);");
  });

  it("balances mobile menu paint clearance without changing its hit target", () => {
    expect(mobileLayout).toMatch(/\.shell-menu-trigger\s*\{\s*margin-inline-start: -0.5rem;/);
  });

  it("keeps drawer session controls touch-sized and reveals actions without hover", () => {
    const drawerRows =
      globalsCss.match(
        /\.shell-sidebar-drawer :where\(\[data-session-item\]\) \[data-sidebar-item\]\s*\{([\s\S]*?)\}/,
      )?.[1] ?? "";
    expect(drawerRows).toContain("height: 3rem;");
    expect(drawerRows).toContain("padding-right: 3.25rem;");
    expect(globalsCss).toMatch(/\.shell-sidebar-drawer \[data-session-editor-controls\]\s*\{\s*min-height: 3rem;/);
    const actions = globalsCss.match(/\[data-session-actions\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(actions).toContain("opacity: 1;");
    expect(globalsCss).toMatch(/@media \(min-width: 640px\) and \(hover: hover\)/);
  });

  it("avoids a scrollbar gutter shifting the collapsed icon column", () => {
    expect(globalsCss).toMatch(/\[data-sidebar-list="collapsed"\]\s*\{\s*scrollbar-width: none;/);
    expect(globalsCss).toMatch(/\[data-sidebar-list="collapsed"\]::-webkit-scrollbar\s*\{\s*display: none;/);
    expect(globalsCss).toContain("scrollbar-width: thin;");
  });

  it("insets collapsed brand focus without an outward ring", () => {
    const focus = globalsCss.match(/\[data-sidebar-brand="collapsed"\] a:focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(focus).toContain("outline-offset: -2px;");
    expect(focus).toContain("box-shadow: none;");
  });

  it("keeps collapsed boot branding and footer geometry aligned with the rail", () => {
    const brand = globalsCss.match(/\[data-shell-boot-brand\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(brand).toContain("height: 3rem;");
    expect(brand).toContain("padding-inline: 0;");
    expect(brand).toContain("justify-content: center;");
    const frame = globalsCss.match(/\[data-shell-boot-frame\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(frame).toContain("padding-inline: 0.125rem;");
    expect(globalsCss).toContain("[data-shell-boot-brand] > :where(:last-child)");
    expect(globalsCss).toContain("[data-shell-boot-account]");
    expect(globalsCss).toContain("[data-shell-boot-modes] > [data-skeleton]");
  });

  it("flattens live chat without changing the landing-page example", () => {
    expect(mobileLayout).toContain("[data-chat-frame] > .chat-message-well");
    expect(mobileLayout).toContain("background: var(--surface);");
    expect(mobileLayout).not.toMatch(/(?:^|\n)\s*\.chat-message-well\s*\{/);
  });

  it("keeps map failure notices outside the dedicated control column", () => {
    const map = uiFiles.find(({ path }) => path === "src/components/map/campus-map.tsx")?.source ?? "";
    const notice = map.match(/data-map-entrance-notice\s+className="([^"]+)"/)?.[1] ?? "";
    expect(notice).toContain("right-20");
    expect(notice).toContain("max-w-[min(16rem,calc(100%-6rem))]");
    expect(globalsCss).not.toContain("[data-map-explorer] [data-map-entrance-notice]");
  });

  it("keeps the expanded Explore sheet below the map control stack", () => {
    expect(globalsCss).toContain("--map-explore-sheet-height: min(72%, 36rem, calc(100% - 7.5rem));");
    expect(globalsCss).toContain("height: var(--map-explore-sheet-height);");
    expect(globalsCss).toContain("bottom: calc(var(--map-explore-sheet-height) + 0.5rem);");
  });

  it("keeps the mobile timetable flush and weekend day tabs scrollable", () => {
    expect(mobileLayout).toContain("[data-schedule-canvas]");
    expect(mobileLayout).toContain("[data-schedule-grid-frame]");
    expect(mobileLayout).toContain(".schedule-grid-day-tabs");
    expect(mobileLayout).toContain("overflow-x: auto;");
    expect(mobileLayout).toContain("min-width: 2.75rem;");
  });
});

describe("feature content minima", () => {
  it("bounds only schedule toasts and gives embedded notifications local coordinates", () => {
    const toast = globalsCss.match(/\.schedule-toast-stack\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(toast).toContain("max-width: calc(100vw - 1rem);");
    expect(toast).toContain("var(--app-viewport-height, 100dvh) - 2rem - env(safe-area-inset-top)");
    expect(toast).not.toContain("margin-bottom");
    expect(globalsCss).toContain("- 5.75rem - 1px - env(safe-area-inset-bottom) - env(safe-area-inset-top)");
    const embedded =
      globalsCss.match(/\.schedule-toast-stack\[data-toast-host="answer-canvas"\]\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(embedded).toContain("position: absolute;");
    expect(embedded).toContain("bottom: 1rem;");
    expect(embedded).toContain("max-width: calc(100% - 1rem);");
    expect(embedded).toContain("max-height: max(0px, calc(100% - 2rem));");
    expect(embedded).not.toContain("app-viewport");
    const shared = globalsCss.match(/\.app-notification-stack\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(shared).not.toContain("max-height");
    expect(shared).toContain("bottom: 1rem;");
  });

  it("propagates only the course planner control minimum through its rail ancestors", () => {
    const rule = globalsCss.match(/:where\(([^)]+)\):has\(\s*\[data-planner-controls\]\s*\)\s*\{([^}]+)\}/);
    expect(rule?.[1] ?? "").toContain('[data-workspace-region="rail"]');
    expect(rule?.[1] ?? "").toContain(".workspace-rail");
    expect(rule?.[1] ?? "").toContain("[data-workspace-panel]");
    expect(rule?.[1] ?? "").toContain("[data-workspace-panel-body]");
    expect(rule?.[2] ?? "").toContain("min-height: min-content;");
  });
});

describe("shared surface materials", () => {
  it.each([".neu-panel", ".neu-raised", ".neu-inset"])(
    "keeps %s defaults below theme and state utilities in the cascade",
    (selector) => {
      const componentLayer = globalsCss.match(/@layer components\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
      expect(componentLayer).toContain(selector);
    },
  );
});
