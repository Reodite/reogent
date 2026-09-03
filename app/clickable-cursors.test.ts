import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function layerContents(css: string, name: string): string {
  const marker = `@layer ${name}`;
  const markerIndex = css.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing ${marker}`);

  const openingBrace = css.indexOf("{", markerIndex + marker.length);
  if (openingBrace === -1) throw new Error(`Missing opening brace for ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) {
      return css
        .slice(openingBrace + 1, index)
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .replace(/\s*,\s*/g, ",");
    }
  }

  throw new Error(`Missing closing brace for ${marker}`);
}

function cursorFor(window: Window, markup: string): string {
  const host = window.document.createElement("div");
  host.innerHTML = markup;
  window.document.body.append(host);
  const target = host.querySelector<HTMLElement>("[data-target]");
  if (!target) throw new Error("Cursor fixture needs a data-target element");
  return window.getComputedStyle(target).cursor;
}

const interactiveRoles = [
  "button",
  "link",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "checkbox",
  "treeitem",
] as const;

describe("clickable cursor policy", () => {
  it("uses a pointer for enabled semantic and ARIA controls", () => {
    const window = new Window();
    const style = window.document.createElement("style");
    style.textContent = layerContents(globalsCss, "base");
    window.document.head.append(style);

    const fixtures = [
      '<a data-target href="/tools">Tools</a>',
      "<button data-target>Save</button>",
      "<details><summary data-target>Details</summary></details>",
      '<input data-target type="checkbox">',
      "<select data-target><option>One</option></select>",
      "<select><option data-target>One</option></select>",
      '<label data-target><input type="checkbox"> Include</label>',
      ...interactiveRoles.map((role) => `<div data-target role="${role}">Control</div>`),
    ];

    for (const fixture of fixtures) expect(cursorFor(window, fixture), fixture).toBe("pointer");
    window.close();
  });

  it("uses a non-pointer cursor for disabled controls", () => {
    const window = new Window();
    const style = window.document.createElement("style");
    style.textContent = layerContents(globalsCss, "base");
    window.document.head.append(style);

    const fixtures = [
      "<button data-target disabled>Save</button>",
      '<a data-target href="/tools" aria-disabled="true">Tools</a>',
      '<details><summary data-target aria-disabled="true">Details</summary></details>',
      '<input data-target type="checkbox" disabled>',
      "<select data-target disabled><option>One</option></select>",
      "<select><option data-target disabled>One</option></select>",
      '<label data-target><input type="checkbox" disabled> Include</label>',
      ...interactiveRoles.map((role) => `<div data-target role="${role}" aria-disabled="true">Control</div>`),
    ];

    for (const fixture of fixtures) expect(cursorFor(window, fixture), fixture).toBe("not-allowed");
    window.close();
  });

  it("leaves noninteractive and specialized cursor targets alone", () => {
    const window = new Window();
    const style = window.document.createElement("style");
    style.textContent = `${layerContents(globalsCss, "base")}
      .test-text { cursor: text; }
      .test-pan, .test-drag { cursor: grab; }
      .test-resize { cursor: ew-resize; }
    `;
    window.document.head.append(style);

    expect(globalsCss).toContain(":not([inert], [inert] *)");
    expect(cursorFor(window, "<a data-target>Anchor</a>")).not.toBe("pointer");
    expect(cursorFor(window, "<div data-target>Panel</div>")).not.toBe("pointer");
    expect(cursorFor(window, '<input data-target class="test-text">')).toBe("text");
    expect(cursorFor(window, '<div data-target class="test-pan">Map</div>')).toBe("grab");
    expect(cursorFor(window, '<button data-target class="test-drag">Drag</button>')).toBe("grab");
    expect(cursorFor(window, '<div data-target role="button" class="test-resize">Resize</div>')).toBe("ew-resize");
    window.close();
  });
});
