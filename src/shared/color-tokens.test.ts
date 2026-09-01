import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { adjustHexLuminance, COLOR_TOKENS, renderColorTokensCss, type ColorToken } from "./color-tokens";

const EXPECTED_SURFACE_TOKENS = [
  "background",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface",
  "surface-bright",
  "primary",
  "primary-container",
  "secondary",
  "secondary-container",
  "tertiary",
  "tertiary-container",
  "event-academic",
  "event-academic-container",
  "event-holiday",
  "event-holiday-container",
  "error",
  "error-container",
  "accent-subtle",
];

describe("adjustHexLuminance", () => {
  it("matches the reference formula for known colors", () => {
    expect(adjustHexLuminance("#e0e0e0", -0.15)).toBe("#bebebe");
    expect(adjustHexLuminance("#e0e0e0", 0.15)).toBe("#ffffff");
    expect(adjustHexLuminance("#4a4e7a", -0.15)).toBe("#3f4268");
    expect(adjustHexLuminance("#4a4e7a", 0.15)).toBe("#555a8c");
    expect(adjustHexLuminance("#f4e3cf", 0.15)).toBe("#ffffee");
  });

  it("matches the reference formula for every channel value", () => {
    for (const luminance of [-0.15, 0.15]) {
      for (let channel = 0; channel <= 255; channel += 1) {
        const source = channel.toString(16).padStart(2, "0");
        const expected = Math.round(Math.min(Math.max(0, channel + channel * luminance), 255))
          .toString(16)
          .padStart(2, "0");

        expect(adjustHexLuminance(`#${source}${source}${source}`, luminance)).toBe(
          `#${expected}${expected}${expected}`,
        );
      }
    }
  });

  it("supports shorthand colors and rejects invalid input", () => {
    expect(adjustHexLuminance("#abc", -0.15)).toBe("#919fad");
    expect(adjustHexLuminance("#abc", 0.15)).toBe("#c4d7eb");
    expect(() => adjustHexLuminance("transparent", 0.15)).toThrow(/hex color/i);
    expect(() => adjustHexLuminance("#ffffff", Number.NaN)).toThrow(/finite/i);
  });
});

describe("renderColorTokensCss", () => {
  it("resolves aliases against each theme before generating pairs", () => {
    const tokens: ColorToken[] = [
      { name: "base", light: "#808080", dark: "#202020", surface: true },
      { name: "alias", alias: "base", surface: true },
    ];

    const css = renderColorTokensCss(tokens);

    expect(css).toContain("--alias: var(--base);");
    expect(css).toContain("--neu-base-dark: #6d6d6d;");
    expect(css).toContain("--neu-base-light: #939393;");
    expect(css).toContain("--neu-alias-dark: #6d6d6d;");
    expect(css).toContain("--neu-alias-light: #939393;");
    expect(css).toContain("--neu-base-dark: #1b1b1b;");
    expect(css).toContain("--neu-base-light: #252525;");
    expect(css).toContain("--neu-alias-dark: #1b1b1b;");
    expect(css).toContain("--neu-alias-light: #252525;");
  });

  it("rejects missing aliases, cycles, and duplicate names", () => {
    expect(() => renderColorTokensCss([{ name: "alias", alias: "missing", surface: true }])).toThrow(/missing/i);

    expect(() =>
      renderColorTokensCss([
        { name: "first", alias: "second", surface: true },
        { name: "second", alias: "first", surface: true },
      ]),
    ).toThrow(/cycle/i);

    expect(() =>
      renderColorTokensCss([
        { name: "same", light: "#000000", dark: "#000000" },
        { name: "same", light: "#ffffff", dark: "#ffffff" },
      ]),
    ).toThrow(/duplicate/i);
  });

  it("generates pairs for the complete opaque surface palette", () => {
    const surfaceTokens = COLOR_TOKENS.filter((token) => token.surface).map((token) => token.name);
    expect(surfaceTokens).toEqual(EXPECTED_SURFACE_TOKENS);

    const css = renderColorTokensCss();
    for (const name of EXPECTED_SURFACE_TOKENS) {
      expect(css.match(new RegExp(`--neu-${name}-dark:`, "g"))).toHaveLength(2);
      expect(css.match(new RegExp(`--neu-${name}-light:`, "g"))).toHaveLength(2);
    }
    expect(css).not.toContain("--neu-scrim-dark:");
    expect(css).not.toContain("--neu-border-dark:");
  });

  it("emits exact light and dark background pairs", () => {
    const css = renderColorTokensCss();
    expect(css).toContain("--neu-background-dark: #d2d2d0;");
    expect(css).toContain("--neu-background-light: #ffffff;");
    expect(css).toContain("--neu-background-dark: #0f0f11;");
    expect(css).toContain("--neu-background-light: #151517;");
  });

  it("generates a contextual shadow utility for every surface token", () => {
    const css = renderColorTokensCss();

    for (const name of EXPECTED_SURFACE_TOKENS) {
      expect(css.match(new RegExp(`^\\.neu-shadow-on-${name} \\{`, "gm"))).toHaveLength(1);
      expect(css).toContain(`--neu-context-dark: var(--neu-${name}-dark);`);
      expect(css).toContain(`--neu-context-light: var(--neu-${name}-light);`);
    }
    expect(css.match(/--neu-surface-shadow:/g)).toHaveLength(1);
    expect(css.match(/--neu-inset-shadow:/g)).toHaveLength(1);
    expect(css).toContain("--neu-context-shadow-fallback: rgba(213, 213, 213, 0.17);");
    expect(css).toContain("--neu-context-highlight-fallback: rgba(255, 255, 255, 0.2);");
    expect(css).toContain("--neu-context-shadow-fallback: rgba(22, 22, 26, 0.55);");
    expect(css).toContain("@supports (color: color-mix(in srgb, black, transparent))");
    expect(css).toContain("--neu-context-shadow-weight: 17%;");
    expect(css).toContain("--neu-context-shadow-weight: 55%;");
    expect(css).not.toContain(".neu-shadow-on-scrim {");
    expect(css).not.toContain(".neu-shadow-on-border {");
  });

  it("keeps the committed stylesheet and import in sync", async () => {
    const [generatedCss, globalsCss] = await Promise.all([
      readFile(new URL("../../app/theme-colors.generated.css", import.meta.url), "utf8"),
      readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
    ]);

    expect(generatedCss).toBe(renderColorTokensCss());
    expect(globalsCss).toContain('@import "./theme-colors.generated.css";');
    expect(globalsCss).toContain(".neu-button:not(:disabled):hover");
    expect(globalsCss).toContain(".neu-primary-button:not(:disabled):hover");
    expect(globalsCss).toContain(".neu-button:not(:disabled):active");
    expect(globalsCss).toContain(".neu-primary-button:not(:disabled):active");
    expect(globalsCss).not.toContain(".neu-button:hover");
    expect(globalsCss).not.toContain(".neu-primary-button:hover");
    for (const token of COLOR_TOKENS) {
      expect(globalsCss).not.toMatch(new RegExp(`^\\s*--${token.name}:`, "m"));
    }
  });
});
