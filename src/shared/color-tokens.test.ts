import { describe, expect, it } from "vitest";
import { adjustHexLuminance, renderColorTokensCss } from "./color-tokens";

describe("adjustHexLuminance", () => {
  it("rejects invalid colors and non-finite adjustments", () => {
    expect(() => adjustHexLuminance("transparent", 0.15)).toThrow(/hex color/i);
    expect(() => adjustHexLuminance("#ffffff", Number.NaN)).toThrow(/finite/i);
  });
});

describe("renderColorTokensCss", () => {
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
