const { chromium } = require("C:/Users/max/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const out = __dirname;
const titles = ["Agent capabilities", "Tools", "Unity"];
const report = { checks: [], errors: [], knownFindings: [], screenshots: [], motion: [], layouts: [], gestures: [] };
const check = (condition, message) => {
  report.checks.push({ message, pass: !!condition });
  if (!condition) report.errors.push(message);
};

async function settled(page, region, index) {
  const slide = region.locator("article").nth(index);
  await page.waitForFunction(
    (node) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return getComputedStyle(node).opacity === "1" && Math.abs(matrix.m41) < 0.01 && Math.abs(matrix.m11 - 1) < 0.001;
    },
    await slide.elementHandle(),
  );
  return slide;
}

async function activeIndex(region) {
  return region
    .locator("fieldset button")
    .evaluateAll((dots) => dots.findIndex((dot) => dot.getAttribute("aria-current") === "true"));
}

async function inspectCard(region, index, label) {
  const geometry = await region.evaluate((node, index) => {
    const stage = node.querySelector('[aria-label^="Browse"]');
    const card = stage.querySelectorAll("article")[index];
    const bounds = card.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const visual = card.firstElementChild.getBoundingClientRect();
    const footer = card.lastElementChild.getBoundingClientRect();
    const clipped = [];
    const ellipsized = [];
    for (const element of card.querySelectorAll("*")) {
      if (!(element instanceof HTMLElement) || element.children.length || !element.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      for (const rect of range.getClientRects()) {
        if (
          rect.width &&
          (rect.left < bounds.left - 1 ||
            rect.right > bounds.right + 1 ||
            rect.top < bounds.top - 1 ||
            rect.bottom > bounds.bottom + 1)
        ) {
          clipped.push(element.textContent.trim());
          break;
        }
      }
      if (
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 1 &&
        !["visible", "unset"].includes(getComputedStyle(element).overflowX)
      ) {
        if (getComputedStyle(element).textOverflow === "ellipsis") ellipsized.push(element.textContent.trim());
        else clipped.push(`overflow: ${element.textContent.trim()}`);
      }
    }
    const controls = stage.nextElementSibling;
    const previous = controls.firstElementChild.getBoundingClientRect();
    const progress = controls.querySelector("fieldset").getBoundingClientRect();
    const next = controls.lastElementChild.getBoundingClientRect();
    const dots = [...controls.querySelectorAll("fieldset button")].map((dot) => {
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    stage.scrollLeft = 100;
    return {
      title: card.querySelector("h3").textContent,
      width: bounds.width,
      height: bounds.height,
      centerOffset: bounds.left + bounds.width / 2 - (stageBounds.left + stageBounds.width / 2),
      visualHeight: visual.height,
      footerBelowVisual: footer.top >= visual.bottom - 1,
      clipped,
      ellipsized,
      stageOverflow: getComputedStyle(stage).overflowX,
      scrollLeft: stage.scrollLeft,
      scrollbarHeight: stage.offsetHeight - stage.clientHeight,
      previous: { x: previous.x, y: previous.y, width: previous.width, height: previous.height },
      next: { x: next.x, y: next.y, width: next.width, height: next.height },
      controlsBelow: previous.top >= stageBounds.bottom && next.top >= stageBounds.bottom,
      flanksDots: previous.right <= progress.left + 1 && next.left >= progress.right - 1,
      dots,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      perspective: getComputedStyle(stage).perspective,
      transformStyle: getComputedStyle(stage).transformStyle,
      touchAction: getComputedStyle(stage).touchAction,
    };
  }, index);
  report.layouts.push({ label, ...geometry });
  check(Math.abs(geometry.centerOffset) < 1, `${label}: selected card stays centered`);
  check(Math.abs(geometry.visualHeight - 320) < 1 && geometry.footerBelowVisual, `${label}: visual stays above footer`);
  check(geometry.clipped.length === 0, `${label}: preview and caption text fit (${geometry.clipped.join("; ")})`);
  check(
    geometry.stageOverflow === "clip" && geometry.scrollLeft === 0 && geometry.scrollbarHeight === 0,
    `${label}: stage has no scrollbar`,
  );
  check(geometry.controlsBelow && geometry.flanksDots, `${label}: arrows flank dots below cards`);
  check(
    geometry.previous.width >= 43 &&
      geometry.next.width >= 43 &&
      geometry.dots.every((dot) => dot.width >= 32 && dot.height >= 32),
    `${label}: touch targets retain sizes`,
  );
  check(!geometry.documentOverflow, `${label}: no horizontal page overflow`);
  check(
    geometry.perspective === "1200px" && geometry.transformStyle === "preserve-3d",
    `${label}: stage retains 3D perspective`,
  );
}

async function motionSamples(region, direction) {
  return region.evaluate(async (node, direction) => {
    const cards = [...node.querySelectorAll("article")];
    const outgoing = [...node.querySelectorAll("fieldset button")].findIndex(
      (dot) => dot.getAttribute("aria-current") === "true",
    );
    node.querySelector(`[aria-label^="${direction}"]`).click();
    const start = performance.now();
    const frames = [];
    while (performance.now() - start < 550) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames.push({
        time: performance.now() - start,
        cards: cards.map((card) => {
          const style = getComputedStyle(card);
          const matrix = new DOMMatrixReadOnly(style.transform);
          return {
            opacity: Number(style.opacity),
            x: matrix.m41,
            z: matrix.m43,
            scale: Math.hypot(matrix.m11, matrix.m13),
            tilt: matrix.m13,
          };
        }),
      });
    }
    return { outgoing, frames };
  }, direction);
}

async function touchGesture(page, stage, dx, dy = 0, cancel = false) {
  await stage.scrollIntoViewIfNeeded();
  const rect = await stage.boundingBox();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const session = await page.context().newCDPSession(page);
  const beforeScroll = await page.evaluate(() => scrollY);
  const initial = await stage.locator("article").evaluateAll((cards) => cards.map((card) => card.style.transform));
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 8; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8, id: 1 }],
    });
    await page.waitForTimeout(20);
  }
  const during = await stage.locator("article").evaluateAll((cards) => cards.map((card) => card.style.transform));
  await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  const afterScroll = await page.evaluate(() => scrollY);
  await session.detach();
  return { followsDrag: JSON.stringify(initial) !== JSON.stringify(during), scrollDelta: afterScroll - beforeScroll };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { label: "desktop", width: 1440, height: 1000, reduced: false, dark: false },
      { label: "tablet", width: 768, height: 1024, reduced: true, dark: false },
      { label: "mobile", width: 390, height: 844, reduced: false, dark: false },
      { label: "narrow-dark", width: 320, height: 844, reduced: true, dark: true },
    ]) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        reducedMotion: scenario.reduced ? "reduce" : "no-preference",
        isMobile: scenario.width < 600,
        hasTouch: scenario.width < 600,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(`${scenario.label}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (
          text.startsWith("A tree hydrated") &&
          text.includes("<Landing>") &&
          text.includes("<FeatureShowcase>") &&
          !text.includes("<FeatureCard")
        ) {
          report.knownFindings.push({
            label: scenario.label,
            finding: "Unchanged landing hero and CTA initial styles differ on reduced-motion hydration.",
            detail: text,
          });
        } else report.errors.push(`${scenario.label} console: ${text}`);
      });
      await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: scenario.dark ? "Dark" : "Light", exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const sections = page.locator('[aria-roledescription="carousel"]');
      check(
        JSON.stringify(await sections.locator("h2").allTextContents()) === JSON.stringify(titles),
        `${scenario.label}: feature section order`,
      );
      for (const title of titles) {
        const region = page.getByRole("region", { name: title, exact: true });
        const dots = region.locator("fieldset button");
        const count = await dots.count();
        const previous = region.getByRole("button", { name: `Previous ${title} card`, exact: true });
        const next = region.getByRole("button", { name: `Next ${title} card`, exact: true });
        for (let index = 0; index < count; index++) {
          await dots.nth(index).click();
          await settled(page, region, index);
          await inspectCard(region, index, `${scenario.label}/${title}/${index + 1}`);
        }
        await next.click();
        await settled(page, region, 0);
        check(
          (await activeIndex(region)) === 0 && (await previous.isEnabled()) && (await next.isEnabled()),
          `${scenario.label}/${title}: next wraps last to first`,
        );
        await previous.click();
        await settled(page, region, count - 1);
        check((await activeIndex(region)) === count - 1, `${scenario.label}/${title}: previous wraps first to last`);
        await next.click();
        await settled(page, region, 0);
        const file = `landing-depth-${scenario.label}-${title.split(" ")[0].toLowerCase()}.png`;
        await region.screenshot({ path: path.join(out, file) });
        report.screenshots.push(file);

        if (scenario.label === "desktop") {
          for (const direction of ["Previous", "Next"]) {
            const sample = await motionSamples(region, direction);
            const moving = sample.frames.filter(
              (frame) => frame.cards[sample.outgoing].opacity > 0.45 && frame.cards[sample.outgoing].opacity < 0.99,
            );
            check(moving.length > 0, `${title}/${direction}: outgoing card visibly fades during animation`);
            check(
              moving.every(
                (frame) =>
                  frame.cards[sample.outgoing].z < 0 &&
                  frame.cards[sample.outgoing].scale < 1 &&
                  Math.abs(frame.cards[sample.outgoing].tilt) > 0,
              ),
              `${title}/${direction}: outgoing card shrinks, tilts and recedes`,
            );
            check(
              moving.every((frame) =>
                direction === "Previous" ? frame.cards[sample.outgoing].x > 0 : frame.cards[sample.outgoing].x < 0,
              ),
              `${title}/${direction}: wrap preserves travel direction`,
            );
            check(
              sample.frames.every((frame) => frame.cards.filter((card) => card.opacity > 0.001).length <= 3),
              `${title}/${direction}: distant cards stay hidden during looping`,
            );
            report.motion.push({ title, direction, ...sample });
          }
          for (let click = 0; click < 7; click++) {
            await next.click();
            await page.waitForTimeout(20);
          }
          await settled(page, region, 7 % count);
          check(
            (await activeIndex(region)) === 7 % count,
            `${title}: repeated navigation survives animation interruption`,
          );
          const stage = region.getByRole("region", { name: `Browse ${title}` });
          await stage.focus();
          for (const [key, index] of [
            ["End", count - 1],
            ["ArrowRight", 0],
            ["ArrowLeft", count - 1],
            ["Home", 0],
          ]) {
            await page.keyboard.press(key);
            await settled(page, region, index);
            check(
              (await activeIndex(region)) === index &&
                (await stage.evaluate((node) => node === document.activeElement)),
              `${title}: ${key} preserves focus and destination`,
            );
          }
          const focus = await stage.evaluate((node) => ({
            visible: node.matches(":focus-visible"),
            width: getComputedStyle(node).outlineWidth,
            style: getComputedStyle(node).outlineStyle,
          }));
          check(
            focus.visible && focus.width !== "0px" && focus.style !== "none",
            `${title}: keyboard focus stays visible`,
          );
          await stage.hover();
          await page.mouse.wheel(100, 0);
          await settled(page, region, 1);
          check((await activeIndex(region)) === 1, `${title}: horizontal trackpad navigation`);
          await page.mouse.wheel(30, 0);
          await page.waitForTimeout(80);
          check((await activeIndex(region)) === 1, `${title}: trackpad momentum does not skip cards`);
        }
      }
      const tools = page.getByRole("region", { name: "Tools", exact: true });
      if (scenario.width < 600) {
        await tools.locator("fieldset button").first().click();
        await settled(page, tools, 0);
        const stage = tools.getByRole("region", { name: "Browse Tools" });
        const forward = await touchGesture(page, stage, -140);
        check((await activeIndex(tools)) === 1, `${scenario.label}: touch swipe advances`);
        check(forward.followsDrag === !scenario.reduced, `${scenario.label}: drag follows motion preference`);
        await touchGesture(page, stage, 140);
        check((await activeIndex(tools)) === 0, `${scenario.label}: reverse touch swipe`);
        await touchGesture(page, stage, 140);
        check((await activeIndex(tools)) === 5, `${scenario.label}: touch swipe loops`);
        await touchGesture(page, stage, -140, 0, true);
        check((await activeIndex(tools)) === 5, `${scenario.label}: cancelled touch retains selection`);
        const vertical = await touchGesture(page, stage, 0, -140);
        check(
          (await activeIndex(tools)) === 5 && vertical.scrollDelta > 50,
          `${scenario.label}: vertical touch scrolls the page`,
        );
        report.gestures.push({ label: scenario.label, forward, vertical });
      }
      if (scenario.label === "desktop") {
        await tools.locator("fieldset button").nth(4).click();
        await settled(page, tools, 4);
        await page.setViewportSize({ width: 360, height: 800 });
        await inspectCard(tools, 4, "resized desktop/Tools/5");
        check((await activeIndex(tools)) === 4, "resize preserves selection");
      }
      if (scenario.reduced) {
        const sample = await motionSamples(tools, "Next");
        check(
          !sample.frames.some((frame) => frame.cards.some((card) => card.opacity > 0.451 && card.opacity < 0.999)),
          `${scenario.label}: reduced motion skips spatial interpolation`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, "landing-depth-report.json"), JSON.stringify(report, null, 2));
  }
  console.log(
    JSON.stringify(
      {
        passed: report.checks.filter((check) => check.pass).length,
        total: report.checks.length,
        errors: report.errors,
        knownFindings: report.knownFindings.map(({ label, finding }) => ({ label, finding })),
        screenshots: report.screenshots,
        gestures: report.gestures,
      },
      null,
      2,
    ),
  );
  assert.equal(report.errors.length, 0, "Browser verification found failures");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
