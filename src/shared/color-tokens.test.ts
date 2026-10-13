import { describe, expect, it } from "vitest";
import { adjustHexLuminance, renderColorTokensCss } from "./color-tokens";

describe("adjustHexLuminance", () => {
  it("scales channels and clamps the result to valid hex values", () => {
    expect(adjustHexLuminance("#e0e0e0", -0.15)).toBe("#bebebe");
    expect(adjustHexLuminance("#e0e0e0", 0.15)).toBe("#ffffff");
    expect(adjustHexLuminance("#4a4e7a", -0.15)).toBe("#3f4268");
    expect(adjustHexLuminance("#4a4e7a", 0.15)).toBe("#555a8c");
    expect(adjustHexLuminance("#f4e3cf", 0.15)).toBe("#ffffee");
  });

  it("supports shorthand colors and rejects invalid input", () => {
    expect(adjustHexLuminance("#abc", -0.15)).toBe("#919fad");
    expect(adjustHexLuminance("#abc", 0.15)).toBe("#c4d7eb");
    expect(() => adjustHexLuminance("transparent", 0.15)).toThrow(/hex color/i);
    expect(() => adjustHexLuminance("#ffffff", Number.NaN)).toThrow(/finite/i);
  });
});

describe("color token validation", () => {
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
});
