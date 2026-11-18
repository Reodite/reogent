const { chromium } = require("C:/Users/max/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const label = process.argv.includes("--baseline") ? "baseline" : "fixed";
const report = { label, samples: [], errors: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { name: "desktop", width: 1440, height: 1000, dark: false },
      { name: "tablet", width: 768, height: 1024, dark: false },
      { name: "mobile", width: 390, height: 844, dark: false },
      { name: "narrow-dark", width: 320, height: 844, dark: true },
    ]) {
      const context = await browser.newContext({
        viewport: scenario,
        reducedMotion: "no-preference",
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(error.message));
      await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: scenario.dark ? "Dark" : "Light", exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      for (const title of ["Agent capabilities", "Tools", "Unity"]) {
        const region = page.getByRole("region", { name: title, exact: true });
        const stage = region.getByRole("region", { name: `Browse ${title}` });
        const cards = stage.locator("article");
        for (const index of [0, (await cards.count()) - 1]) {
          await region.locator("fieldset button").nth(index).click();
          await page.waitForFunction(
            (node) => {
              const style = getComputedStyle(node);
              return style.opacity === "1" && Math.abs(new DOMMatrixReadOnly(style.transform).m43) < 0.001;
            },
            await cards.nth(index).elementHandle(),
          );
          await stage.evaluate((node) =>
            window.scrollBy({ top: node.getBoundingClientRect().top - 220, behavior: "instant" }),
          );
          await page.waitForTimeout(100);
          const state = await stage.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            const cards = [...node.querySelectorAll("article")].map((card) => {
              const rect = card.getBoundingClientRect();
              const css = getComputedStyle(card);
              return {
                x: rect.x,
                right: rect.right,
                opacity: Number(css.opacity),
                radius: css.borderRadius,
                shadow: css.boxShadow,
                cornerOverflow: css.overflow,
              };
            });
            node.scrollLeft = 100;
            return {
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              previousOverflow: node.style.overflow,
              scrollLeft: node.scrollLeft,
              scrollbarHeight: node.offsetHeight - node.clientHeight,
              documentOverflow: document.documentElement.scrollWidth > innerWidth,
              rootOverflow: getComputedStyle(node.closest(".landing-root")).overflowX,
              stage: { x: bounds.x, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
              cards,
              clip: { x: 0, y: Math.floor(bounds.top - 24), width: innerWidth, height: Math.ceil(bounds.height + 48) },
            };
          });
          const painted = await page.screenshot({ clip: state.clip });
          await stage.evaluate((node) => {
            node.style.overflow = "visible";
          });
          const unclipped = await page.screenshot({ clip: state.clip });
          await stage.evaluate((node, previous) => {
            node.style.overflow = previous;
          }, state.previousOverflow);
          const original = await sharp(painted).removeAlpha().raw().toBuffer();
          const reference = await sharp(unclipped).removeAlpha().raw().toBuffer();
          let croppedPixels = 0;
          let largestDifference = 0;
          for (let pixel = 0; pixel < original.length; pixel += 3) {
            const difference = Math.max(
              ...[0, 1, 2].map((channel) => Math.abs(original[pixel + channel] - reference[pixel + channel])),
            );
            largestDifference = Math.max(largestDifference, difference);
            if (difference > 2) croppedPixels++;
          }
          const sample = { scenario: scenario.name, title, index, croppedPixels, largestDifference, ...state };
          report.samples.push(sample);
          if (croppedPixels || state.overflowX !== "visible" || state.overflowY !== "visible")
            report.errors.push(`${scenario.name}/${title}/${index}: clipped card paint (${croppedPixels} pixels)`);
          if (state.documentOverflow || state.scrollLeft || state.scrollbarHeight || state.rootOverflow !== "clip")
            report.errors.push(`${scenario.name}/${title}/${index}: horizontal overflow or scrollbar`);
          if (state.cards.some((card) => card.radius !== "16px" || card.cornerOverflow !== "hidden"))
            report.errors.push(`${scenario.name}/${title}/${index}: card corners lost their containment`);
          if (title === "Tools" && index === 0)
            fs.writeFileSync(path.join(__dirname, `landing-edges-${label}-${scenario.name}.png`), painted);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(__dirname, `landing-edges-${label}.json`), JSON.stringify(report, null, 2));
  }
  console.log(
    JSON.stringify(
      {
        label,
        samples: report.samples.length,
        croppedPixels: report.samples.reduce((sum, sample) => sum + sample.croppedPixels, 0),
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  assert.equal(report.errors.length, 0, "Carousel cards or shadows remain clipped");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
