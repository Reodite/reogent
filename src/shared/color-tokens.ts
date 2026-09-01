type ColorTheme = "light" | "dark";
type HexColor = `#${string}`;

type DirectColorToken = {
  name: string;
  light: string;
  dark: string;
  surface?: boolean;
};

type AliasColorToken = {
  name: string;
  alias: string;
  surface?: boolean;
};

/** Defines a theme color and whether it can host neumorphic surfaces. */
export type ColorToken = DirectColorToken | AliasColorToken;

export const NEUMORPHIC_COLOR_DIFFERENCE = 0.15;

export const COLOR_TOKENS = [
  { name: "background", light: "#f7f7f5", dark: "#121214", surface: true },
  { name: "surface-container-lowest", light: "#ffffff", dark: "#0e0e10", surface: true },
  { name: "surface-container-low", light: "#f3f3f5", dark: "#202024", surface: true },
  { name: "surface-container", light: "#ededef", dark: "#26262b", surface: true },
  { name: "surface-container-high", light: "#e6e6e8", dark: "#2e2e33", surface: true },
  { name: "surface", light: "#fafafa", dark: "#1a1a1e", surface: true },
  { name: "surface-bright", light: "#ffffff", dark: "#36363c", surface: true },

  { name: "primary", light: "#4a4e7a", dark: "#b0b4d8", surface: true },
  { name: "primary-container", light: "#7a7ea8", dark: "#363a5e", surface: true },
  { name: "on-primary", light: "#ffffff", dark: "#0f1128" },
  { name: "on-primary-container", light: "#1a1d3a", dark: "#d4d6ef" },

  { name: "secondary", light: "#2d6b47", dark: "#98d4a9", surface: true },
  { name: "secondary-container", light: "#b0efc2", dark: "#155130", surface: true },
  { name: "on-secondary", light: "#ffffff", dark: "#001f0e" },
  { name: "on-secondary-container", light: "#001f0e", dark: "#b0efc2" },

  { name: "tertiary", light: "#7a5733", dark: "#ebbe92", surface: true },
  { name: "tertiary-container", light: "#f4e3cf", dark: "#4a3623", surface: true },
  { name: "on-tertiary-container", light: "#4a3010", dark: "#f7dfc3" },

  { name: "event-academic", alias: "secondary", surface: true },
  { name: "on-event-academic", alias: "on-secondary" },
  { name: "event-academic-container", alias: "secondary-container", surface: true },
  { name: "event-holiday", alias: "tertiary", surface: true },
  { name: "on-event-holiday", light: "#ffffff", dark: "#161310" },
  { name: "event-holiday-container", alias: "tertiary-container", surface: true },

  { name: "error", light: "#9c4040", dark: "#e0a3a3", surface: true },
  { name: "error-container", light: "#ffdad6", dark: "#93000a", surface: true },
  { name: "on-error-container", light: "#6e2c2c", dark: "#ffdad6" },

  { name: "on-surface", light: "#18191b", dark: "#e3e2e4" },
  { name: "on-surface-variant", light: "#3e4348", dark: "#c2c7cc" },
  { name: "muted", light: "#5a6066", dark: "#a6adb3" },
  { name: "outline", light: "#6e747a", dark: "#8c9297" },
  { name: "outline-variant", light: "#bfc4c9", dark: "#42484c" },
  { name: "border", light: "#d9d9dd", dark: "#2c2c31" },
  { name: "border-subtle", light: "#e8e8ea", dark: "#242428" },
  { name: "accent-subtle", light: "#edeef5", dark: "#1e1f2a", surface: true },
  { name: "surface-tint", alias: "primary" },
  { name: "scrim", light: "rgba(0, 0, 0, 0.3)", dark: "rgba(0, 0, 0, 0.5)" },
] as const satisfies readonly ColorToken[];

const COLOR_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const THEMES: readonly ColorTheme[] = ["light", "dark"];

/** Scales each RGB channel by the requested amount, then rounds and clamps it to eight bits. */
export function adjustHexLuminance(hex: string, luminance: number): HexColor {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    throw new Error(`Expected a three- or six-digit hex color, received "${hex}".`);
  }
  if (!Number.isFinite(luminance)) {
    throw new Error("Luminance must be finite.");
  }

  const source = hex.slice(1);
  const normalized = source.length === 3 ? [...source].map((digit) => digit.repeat(2)).join("") : source;
  const adjusted = [0, 2, 4]
    .map((offset) => {
      const channel = Number.parseInt(normalized.slice(offset, offset + 2), 16);
      const value = Math.round(Math.min(Math.max(0, channel + channel * luminance), 255));
      return value.toString(16).padStart(2, "0");
    })
    .join("");

  return `#${adjusted}`;
}

function indexColorTokens(tokens: readonly ColorToken[]): Map<string, ColorToken> {
  const indexed = new Map<string, ColorToken>();

  for (const token of tokens) {
    if (!COLOR_NAME_PATTERN.test(token.name)) {
      throw new Error(`Invalid color token name "${token.name}".`);
    }
    if (indexed.has(token.name)) {
      throw new Error(`Duplicate color token name "${token.name}".`);
    }
    indexed.set(token.name, token);
  }

  return indexed;
}

function resolveColor(
  name: string,
  theme: ColorTheme,
  indexed: ReadonlyMap<string, ColorToken>,
  path: readonly string[] = [],
): string {
  if (path.includes(name)) {
    throw new Error(`Color token alias cycle: ${[...path, name].join(" -> ")}.`);
  }

  const token = indexed.get(name);
  if (!token) {
    throw new Error(`Missing color token "${name}".`);
  }

  if ("alias" in token) {
    return resolveColor(token.alias, theme, indexed, [...path, name]);
  }

  const value = token[theme];
  if (!value || /[;{}]/.test(value)) {
    throw new Error(`Invalid ${theme} value for color token "${name}".`);
  }
  return value;
}

function renderTheme(tokens: readonly ColorToken[], theme: ColorTheme, indexed: ReadonlyMap<string, ColorToken>) {
  const selector = theme === "light" ? ":root" : '[data-theme="dark"]';
  const baseDeclarations = tokens.map((token) => {
    const value = "alias" in token ? `var(--${token.alias})` : resolveColor(token.name, theme, indexed);
    return `  --${token.name}: ${value};`;
  });
  const pairDeclarations = tokens
    .filter((token) => token.surface)
    .flatMap((token) => {
      const value = resolveColor(token.name, theme, indexed);
      if (!/^#[0-9a-f]{6}$/i.test(value)) {
        throw new Error(`Neumorphic surface token "${token.name}" must resolve to a six-digit hex color.`);
      }
      return [
        `  --neu-${token.name}-dark: ${adjustHexLuminance(value, -NEUMORPHIC_COLOR_DIFFERENCE)};`,
        `  --neu-${token.name}-light: ${adjustHexLuminance(value, NEUMORPHIC_COLOR_DIFFERENCE)};`,
      ];
    });

  return `${selector} {\n${baseDeclarations.join("\n")}\n\n${pairDeclarations.join("\n")}\n}`;
}

/** Renders deterministic theme variables and contextual neumorphic pairs. */
export function renderColorTokensCss(tokens: readonly ColorToken[] = COLOR_TOKENS): string {
  const indexed = indexColorTokens(tokens);

  for (const theme of THEMES) {
    for (const token of tokens) {
      resolveColor(token.name, theme, indexed);
    }
  }

  const themes = THEMES.map((theme) => renderTheme(tokens, theme, indexed)).join("\n\n");
  return `/*\n * Generated from src/shared/color-tokens.ts by npm run colors:generate.\n * Direct edits are overwritten.\n */\n\n${themes}\n`;
}
