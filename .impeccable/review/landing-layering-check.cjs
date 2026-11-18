const { chromium } = require("C:/Users/max/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const label = process.argv.includes("--baseline") ? "baseline" : "fixed";
const report = { label, samples: [], failures: [], runtimeErrors: [] };
const titles = ["Agent capabilities", "Tools", "Unity"];

async function settle(page, region, index) {
  await page.waitForFunction(
    (card) => {
      const style = getComputedStyle(card);
      const matrix = new DOMMatrixReadOnly(style.transform);
      return Number(style.opacity) === 1 && Math.abs(matrix.m43) < 0.01;
    },
    await region.locator("article").nth(index).elementHandle(),
  );
}

async function inspectOverlap(page, region, scenario, phase) {
  const stage = region.getByRole("region", { name: `Browse ${await region.locator("h2").innerText()}` });
  await region.locator("fieldset button").first().click();
  await settle(page, region, 0);
  await stage.scrollIntoViewIfNeeded();
  const rect = await stage.boundingBox();
  const width = await stage
    .locator("article")
    .first()
    .evaluate((node) => node.offsetWidth);
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - phase * width * 0.64, start.y, { steps: 8 });
  await page.waitForTimeout(80);
  const sample = await stage.evaluate((node) => {
    const cards = [...node.querySelectorAll("article")];
    const state = cards.map((card, index) => {
      const style = getComputedStyle(card);
      return {
        index,
        opacity: Number(style.opacity),
        z: new DOMMatrixReadOnly(style.transform).m43,
        layer: style.zIndex,
      };
    });
    const front = state.reduce((near, card) => (card.z > near.z ? card : near));
    cards.forEach((card, index) => {
      if (state[index].opacity > 0.001) card.style.pointerEvents = "auto";
    });
    const bounds = cards[front.index].getBoundingClientRect();
    const viewport = node.getBoundingClientRect();
    const left = Math.ceil(Math.max(bounds.left + 10, viewport.left + 2));
    const right = Math.floor(Math.min(bounds.right - 10, viewport.right - 2));
    const y = Math.round(bounds.top + bounds.height / 2);
    const hits = [];
    for (let x = left; x < right; x += 8) {
      const card = document.elementFromPoint(x, y)?.closest('article[aria-roledescription="slide"]');
      hits.push({ x, card: cards.indexOf(card) });
    }
    cards.forEach((card) => card.style.removeProperty("pointer-events"));
    return {
      front,
      state,
      hits,
      clip: { x: left, y: y - 2, width: right - left, height: 5 },
      transformStyle: getComputedStyle(node).transformStyle,
    };
  });
  const all = await page.screenshot({ clip: sample.clip });
  await stage.evaluate((node, front) => {
    [...node.querySelectorAll("article")].forEach((card, index) => {
      if (index !== front) card.style.visibility = "hidden";
    });
  }, sample.front.index);
  const alone = await page.screenshot({ clip: sample.clip });
  await stage.evaluate((node) => {
    node.querySelectorAll("article").forEach((card) => card.style.removeProperty("visibility"));
  });
  const a = await sharp(all).removeAlpha().raw().toBuffer();
  const b = await sharp(alone).removeAlpha().raw().toBuffer();
  let changedPixels = 0;
  let largestDifference = 0;
  for (let index = 0; index < a.length; index += 3) {
    const difference = Math.max(
      Math.abs(a[index] - b[index]),
      Math.abs(a[index + 1] - b[index + 1]),
      Math.abs(a[index + 2] - b[index + 2]),
    );
    largestDifference = Math.max(largestDifference, difference);
    if (difference > 2) changedPixels++;
  }
  const wrongHits = sample.hits.filter((hit) => hit.card !== sample.front.index);
  const title = await region.locator("h2").innerText();
  report.samples.push({ scenario, title, phase, ...sample, changedPixels, largestDifference });
  if (sample.front.opacity !== 1 || wrongHits.length || changedPixels) {
    report.failures.push({
      scenario,
      title,
      phase,
      frontOpacity: sample.front.opacity,
      wrongHits: wrongHits.length,
      changedPixels,
      largestDifference,
    });
  }
  if (title === "Tools" && phase === 0.48) {
    const file = path.join(__dirname, `landing-layering-${label}-${scenario}.png`);
    await stage.screenshot({ path: file });
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { name: "desktop", width: 1440, height: 1000, dark: false },
      { name: "mobile", width: 390, height: 844, dark: false },
      { name: "narrow-dark", width: 320, height: 844, dark: true },
    ]) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: 1,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.runtimeErrors.push(error.message));
      await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: scenario.dark ? "Dark" : "Light", exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      for (const title of titles) {
        const region = page.getByRole("region", { name: title, exact: true });
        for (const phase of [0.48, 0.52, -0.48, -0.52]) await inspectOverlap(page, region, scenario.name, phase);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(__dirname, `landing-layering-${label}.json`), JSON.stringify(report, null, 2));
  }
  console.log(
    JSON.stringify(
      { label, samples: report.samples.length, failures: report.failures, runtimeErrors: report.runtimeErrors },
      null,
      2,
    ),
  );
  assert.equal(report.failures.length + report.runtimeErrors.length, 0, "Foreground card layering or opacity failed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
