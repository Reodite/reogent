// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { lockBodyScroll } from "./body-scroll-lock";

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
  document.body.style.removeProperty("overflow");
});

describe("body scroll ownership", () => {
  it.each([
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ])("releases owners in order %s/%s/%s without unlocking another overlay", (first, second, last) => {
    document.body.style.overflow = "scroll";
    const owners = [lockBodyScroll(), lockBodyScroll(), lockBodyScroll()];
    releases.push(...owners);
    owners[first]();
    owners[first]();
    expect(document.body.style.overflow).toBe("hidden");
    owners[second]();
    expect(document.body.style.overflow).toBe("hidden");
    owners[last]();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores the original inline priority and permits a fresh ownership cycle", () => {
    document.body.style.setProperty("overflow", "auto", "important");
    const release = lockBodyScroll();
    releases.push(release);
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
    document.body.style.removeProperty("overflow");
    const next = lockBodyScroll();
    releases.push(next);
    next();
    expect(document.body.style.overflow).toBe("");
  });
});
