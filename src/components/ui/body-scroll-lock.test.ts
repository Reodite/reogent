// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { lockBodyScroll } from "./body-scroll-lock";

const releases: Array<() => void> = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
  document.body.style.removeProperty("overflow");
});

describe("body scroll ownership", () => {
  it("keeps scrolling locked until every owner releases once", () => {
    document.body.style.setProperty("overflow", "auto", "important");
    const first = lockBodyScroll();
    const second = lockBodyScroll();
    releases.push(first, second);

    first();
    first();
    expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");

    second();
    expect(document.body.style.getPropertyValue("overflow")).toBe("auto");
    expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
  });
});
