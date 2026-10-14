// @vitest-environment happy-dom
import { TOOL_SLUG_TO_PANE_ID } from "@/src/lib/pane-route";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureShowcase } from "./feature-showcase";

const motionPreference = vi.hoisted(() => ({ reduced: true }));
vi.mock("motion/react", () => ({ useReducedMotion: () => motionPreference.reduced }));

let resizeCallbacks: (() => void)[];
const disconnect = vi.fn();

beforeEach(() => {
  motionPreference.reduced = true;
  resizeCallbacks = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function carousel(title: string) {
  const region = screen.getByRole("region", { name: title });
  const viewport = within(region).getByRole("region", { name: `Browse ${title}` });
  const slides = Array.from(viewport.querySelectorAll<HTMLElement>("article"));
  let step = 600;
  function resize(width = 800, cardWidth = 576, gap = 24) {
    step = cardWidth + gap;
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: width });
    for (const [index, slide] of slides.entries()) {
      Object.defineProperties(slide, {
        offsetLeft: { configurable: true, value: (width - cardWidth) / 2 + index * step },
        offsetWidth: { configurable: true, value: cardWidth },
      });
    }
  }
  resize();
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    viewport.scrollLeft = Math.max(0, Math.min(options.left ?? 0, (slides.length - 1) * step));
    fireEvent.scroll(viewport);
  });
  Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scrollTo });
  return {
    region,
    viewport,
    slides,
    resize,
    scrollTo,
    previous: within(region).getByRole<HTMLButtonElement>("button", { name: `Previous ${title} card` }),
    next: within(region).getByRole<HTMLButtonElement>("button", { name: `Next ${title} card` }),
    dots: within(within(region).getByRole("group", { name: `${title} progress` })).getAllByRole("button"),
    status: within(region).getByRole("status"),
  };
}

describe("Feature carousels", () => {
  it("includes a preview and caption for each registered tool without interactive mock controls", () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    const paneIds = Object.values(TOOL_SLUG_TO_PANE_ID);
    expect(tools.slides).toHaveLength(paneIds.length);
    for (const id of paneIds) expect(tools.viewport.querySelector(`[id$="-${id}"]`)).not.toBeNull();

    for (const slide of document.querySelectorAll<HTMLElement>('article[aria-roledescription="slide"]')) {
      const visual = slide.firstElementChild!;
      const footer = slide.lastElementChild!;
      expect(visual.getAttribute("aria-hidden")).toBe("true");
      expect(visual.textContent).toContain("Example");
      expect(visual.querySelector("button, a, input, [tabindex]")).toBeNull();
      expect(footer.tagName).toBe("FOOTER");
      expect(within(footer as HTMLElement).getByRole("heading", { level: 3 }).textContent).toBeTruthy();
      expect(footer.querySelector("p")?.textContent).toBeTruthy();
    }
  });

  it("moves between cards and disables arrows at the ends", () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    expect(tools.previous.disabled).toBe(true);
    expect(tools.next.disabled).toBe(false);
    expect(tools.dots[0].getAttribute("aria-current")).toBe("true");

    fireEvent.click(tools.next);
    expect(tools.scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "instant" });
    expect(tools.status.textContent).toBe("2 of 6: Course lookup");
    expect(tools.dots[1].getAttribute("aria-current")).toBe("true");
    expect(tools.previous.disabled).toBe(false);

    fireEvent.click(tools.previous);
    expect(tools.status.textContent).toBe("1 of 6: Campus map");
    expect(tools.previous.disabled).toBe(true);
    fireEvent.click(tools.dots[5]);
    expect(tools.status.textContent).toBe("6 of 6: Calendar");
    expect(tools.next.disabled).toBe(true);
    expect(tools.dots.filter((dot) => dot.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("keeps each carousel independent when navigating with progress dots", () => {
    render(<FeatureShowcase />);
    const agent = carousel("Agent capabilities");
    const tools = carousel("Tools");
    const unity = carousel("Unity");
    fireEvent.click(unity.dots[2]);

    expect(unity.status.textContent).toBe("3 of 3: Schedule sharing");
    expect(agent.status.textContent).toBe("1 of 3: Grounded answers");
    expect(tools.status.textContent).toBe("1 of 6: Campus map");
    expect(agent.scrollTo).not.toHaveBeenCalled();
    expect(tools.scrollTo).not.toHaveBeenCalled();
  });

  it("synchronizes dots, announcements and arrow availability after native scrolling", () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    tools.viewport.scrollLeft = 1810;
    fireEvent.scroll(tools.viewport);
    expect(tools.dots[3].getAttribute("aria-current")).toBe("true");
    expect(tools.status.textContent).toBe("4 of 6: Degree planner");
    expect(tools.previous.disabled).toBe(false);
    expect(tools.next.disabled).toBe(false);

    tools.viewport.scrollLeft = 3000;
    fireEvent.scroll(tools.viewport);
    expect(tools.next.disabled).toBe(true);
  });

  it("supports arrow, Home and End keys without moving keyboard focus", () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    tools.viewport.focus();
    for (const [key, expected] of [
      ["End", "6 of 6: Calendar"],
      ["ArrowRight", "6 of 6: Calendar"],
      ["ArrowLeft", "5 of 6: Course schedule"],
      ["Home", "1 of 6: Campus map"],
      ["ArrowLeft", "1 of 6: Campus map"],
      ["ArrowRight", "2 of 6: Course lookup"],
    ]) {
      fireEvent.keyDown(tools.viewport, { key });
      expect(tools.status.textContent).toBe(expected);
      expect(document.activeElement).toBe(tools.viewport);
    }
    tools.scrollTo.mockClear();
    expect(fireEvent.keyDown(tools.viewport, { key: "Tab" })).toBe(true);
    expect(tools.scrollTo).not.toHaveBeenCalled();
  });

  it.each([true, false])("honors reduced motion: %s", (reduced) => {
    motionPreference.reduced = reduced;
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    fireEvent.click(tools.next);
    expect(tools.scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: reduced ? "instant" : "smooth" });
  });

  it("preserves the selected card across responsive resizing and disconnects observers", () => {
    const view = render(<FeatureShowcase />);
    const tools = carousel("Tools");
    fireEvent.click(tools.dots[4]);
    tools.resize(360, 352, 16);
    act(() => resizeCallbacks[1]());

    expect(tools.scrollTo).toHaveBeenLastCalledWith({ left: 1472, behavior: "instant" });
    expect(tools.status.textContent).toBe("5 of 6: Course schedule");
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(3);
  });
});
