// @vitest-environment happy-dom
import { describeToolCall } from "@/src/lib/format";
import { TOOL_SLUG_TO_PANE_ID } from "@/src/lib/pane-route";
import { SEASON_META } from "@/src/lib/planner-model";
import { modules } from "@/src/server/modules";
import { buildMonthGrid, parseISODate, toISODate } from "@/src/shared/calendar/date-math";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { animate, frame, type MotionValue } from "motion/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureShowcase } from "./feature-showcase";

const motionPreference = vi.hoisted(() => ({ reduced: true }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    animate: vi.fn(actual.animate),
    useReducedMotion: () => motionPreference.reduced,
  };
});

beforeEach(() => {
  motionPreference.reduced = true;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function carousel(title: string) {
  const region = screen.getByRole("region", { name: title });
  const viewport = within(region).getByRole("region", { name: `Browse ${title}` });
  const slides = Array.from(viewport.querySelectorAll<HTMLElement>("article"));
  const progress = within(region).getByRole("group", { name: `${title} progress` });
  return {
    region,
    viewport,
    slides,
    progress,
    previous: within(region).getByRole<HTMLButtonElement>("button", { name: `Previous ${title} card` }),
    next: within(region).getByRole<HTMLButtonElement>("button", { name: `Next ${title} card` }),
    dots: within(progress).getAllByRole("button"),
    status: within(region).getByRole("status"),
  };
}

async function nextFrame() {
  await act(() => new Promise<void>((resolve) => frame.postRender(() => resolve())));
}

async function swipe(viewport: HTMLElement, x: number, y = 0, cancel = false) {
  Object.defineProperty(viewport.firstElementChild, "offsetWidth", { configurable: true, value: 576 });
  function pointer(type: string, target: HTMLElement | Window, clientX: number, clientY: number) {
    const event = new PointerEvent(type, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX,
      clientY,
      bubbles: true,
    });
    // Motion reads page coordinates, which Happy DOM does not derive from client coordinates.
    Object.defineProperties(event, { pageX: { value: clientX }, pageY: { value: clientY } });
    fireEvent(target, event);
  }
  pointer("pointerdown", viewport, 300, 200);
  pointer("pointermove", window, 300 + x / 2, 200 + y / 2);
  await nextFrame();
  pointer("pointermove", window, 300 + x, 200 + y);
  await nextFrame();
  pointer(cancel ? "pointercancel" : "pointerup", window, 300 + x, 200 + y);
  await nextFrame();
}

describe("Feature carousels", () => {
  it("keeps server markup stable across motion preferences", () => {
    motionPreference.reduced = false;
    const markup = renderToString(<FeatureShowcase />);
    motionPreference.reduced = true;
    expect(renderToString(<FeatureShowcase />)).toBe(markup);
  });

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

  it("uses registered tools and the conversation's activity labels", () => {
    render(<FeatureShowcase />);
    const research = carousel("Agent capabilities").slides[1];
    const activities = Array.from(research.querySelectorAll("[data-widget]"));
    const registered = modules.flatMap((module) => module.tools ?? []).map((tool) => tool.spec.name);

    expect(activities.map((activity) => activity.getAttribute("data-widget"))).toEqual([
      "get_key_dates",
      "find_events",
    ]);
    for (const activity of activities) expect(registered).toContain(activity.getAttribute("data-widget"));
    expect(activities.map((activity) => activity.textContent)).toEqual([
      describeToolCall("get_key_dates", { query: "Term 1" }),
      describeToolCall("find_events", { from_date: "2026-09-08" }),
    ]);
  });

  it("shows CPSC 210's alternative prerequisites instead of an incomplete required chain", () => {
    render(<FeatureShowcase />);
    const prereqs = within(carousel("Tools").slides[2]);

    for (const label of ["CPSC 210", "one of", "CPSC 107", "CPSC 110", "CPSC 103"]) {
      expect(prereqs.getByText(label)).toBeTruthy();
    }
    expect(prereqs.queryByText("CPSC 221")).toBeNull();
  });

  it("organizes the degree example by the planner's winter terms", () => {
    render(<FeatureShowcase />);
    const planner = within(carousel("Tools").slides[3]);

    for (const season of ["w1", "w2"] as const) {
      expect(planner.getByText(SEASON_META[season].short)).toBeTruthy();
      expect(planner.getByText(SEASON_META[season].months)).toBeTruthy();
    }
    expect(planner.getByText("Year 1")).toBeTruthy();
    expect(planner.getByText("18 cr")).toBeTruthy();
    expect(planner.getByText(/CPSC 210 needs/)).toBeTruthy();
  });

  it("uses the real calendar's Sunday-first grid and marks September 2026 dates by kind", () => {
    render(<FeatureShowcase />);
    const calendar = carousel("Tools").slides[5];
    expect(within(calendar).getByText("September 2026")).toBeTruthy();
    for (const kind of ["Academic", "Holiday", "Campus event"]) {
      expect(within(calendar).getByText(kind)).toBeTruthy();
    }
    const days = Array.from(calendar.querySelectorAll("[data-calendar-day]"));
    expect(days.map((day) => day.getAttribute("data-calendar-day"))).toEqual(
      buildMonthGrid(parseISODate("2026-09-01"))
        .flat()
        .flatMap((day) => (day ? [toISODate(day)] : [])),
    );
    expect(
      Array.from(days[0].parentElement!.children)
        .slice(0, 7)
        .map((day) => day.textContent),
    ).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(days[0].textContent).toBe("30");
    expect(days[2].getAttribute("data-calendar-day")).toBe("2026-09-01");
    const marked = (kind: string) =>
      days.filter((day) => day.querySelector(`[data-calendar-marker="${kind}"]`)).map((day) => day.textContent);
    expect(marked("academic")).toEqual(["8", "21", "28"]);
    expect(marked("holiday")).toEqual(["7", "30"]);
    expect(marked("event")).toEqual(["2", "9", "16", "23", "30"]);
  });

  it("distinguishes Workday group sharing from the course timetable builder", () => {
    render(<FeatureShowcase />);
    const sharing = carousel("Unity").slides[2];
    expect(within(sharing).getByText("Shared schedule")).toBeTruthy();
    expect(within(sharing).getByText("Study group")).toBeTruthy();
    expect(within(sharing).getByText(/Workday/)).toBeTruthy();
    expect(within(sharing).getByText("Common free time · Tue and Thu from 12 PM")).toBeTruthy();
    expect(
      Array.from(sharing.querySelectorAll<HTMLElement>("[data-free-time]")).map(
        (free) => `${free.style.gridColumn} ${free.style.gridRow}`,
      ),
    ).toEqual(["3 8 / 10", "5 8 / 10"]);
    const schedule = carousel("Tools").slides[4];
    expect(within(schedule).getByText("Illustrative class times")).toBeTruthy();
    expect(Array.from(schedule.querySelectorAll("[data-conflict]")).map((block) => block.textContent)).toEqual([
      "CPSC121",
      "CHEM121",
    ]);
  });

  it.each(["Agent capabilities", "Tools"])("avoids invented route measurements in %s", (title) => {
    render(<FeatureShowcase />);
    const card = carousel(title).slides[title === "Tools" ? 0 : 2];
    expect(within(card).getByText("Walking route")).toBeTruthy();
    expect(within(card).getByText("ICCS to AMS Nest")).toBeTruthy();
    expect(card.textContent).not.toMatch(/\d+\s*(min|m)\b/);
  });

  it.each(["Agent capabilities", "Tools", "Unity"])("loops %s arrows in both directions", (title) => {
    render(<FeatureShowcase />);
    const { previous, next, dots, slides, status } = carousel(title);
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(false);
    expect(dots[0].getAttribute("aria-current")).toBe("true");

    fireEvent.click(previous);
    expect(dots.at(-1)?.getAttribute("aria-current")).toBe("true");
    expect(status.textContent).toBe(slides.at(-1)?.getAttribute("aria-label"));
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), -1, expect.anything());

    fireEvent.click(next);
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), 0, expect.anything());
    for (let i = 0; i < slides.length + 2; i++) fireEvent.click(next);
    expect(status.textContent).toBe(slides[2].getAttribute("aria-label"));
    expect(dots[2].getAttribute("aria-current")).toBe("true");
    expect(dots.filter((dot) => dot.hasAttribute("aria-current"))).toHaveLength(1);
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), slides.length + 2, expect.anything());
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(false);
  });

  it("puts arrows around the progress dots below a non-scrolling stage without clipping card edges", () => {
    render(<FeatureShowcase />);
    for (const title of ["Agent capabilities", "Tools", "Unity"]) {
      const { previous, next, progress, viewport } = carousel(title);
      expect(Array.from(progress.parentElement!.children)).toEqual([previous, progress, next]);
      expect(viewport.nextElementSibling).toBe(progress.parentElement);
      expect(viewport.classList.contains("overflow-visible")).toBe(true);
      expect(viewport.classList.contains("overflow-clip")).toBe(false);
      expect(viewport.classList.contains("overflow-x-auto")).toBe(false);
      expect(viewport.style.perspective).toBe("1200px");
      expect(viewport.style.transformStyle).toBe("");
    }
  });

  it("recedes, tilts, shrinks and fades neighboring cards while centering the selected card", async () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    const center = "translateX(0%) translateZ(0px) rotateY(0deg) scale(1)";
    expect(tools.slides[0].style.transform).toBe(center);
    expect(tools.slides[0].style.opacity).toBe("1");
    expect(tools.slides[1].style.transform).toBe("translateX(64%) translateZ(-200px) rotateY(-12deg) scale(0.88)");
    expect(tools.slides[1].style.opacity).toBe("0.45");
    expect(tools.slides[2].style.opacity).toBe("0");
    expect(tools.slides[5].style.transform).toBe("translateX(-64%) translateZ(-200px) rotateY(12deg) scale(0.88)");

    fireEvent.click(tools.next);
    await waitFor(() => expect(tools.slides[1].style.transform).toBe(center));
    expect(tools.slides[0].style.opacity).toBe("0.45");
    expect(tools.slides[1].style.opacity).toBe("1");
    expect(tools.slides[5].style.opacity).toBe("0");

    fireEvent.click(tools.dots[5]);
    await waitFor(() => expect(tools.slides[5].style.transform).toBe(center));
    expect(tools.slides[0].style.opacity).toBe("0.45");
    expect(tools.slides[4].style.opacity).toBe("0.45");
  });

  it.each(["Agent capabilities", "Tools", "Unity"])(
    "keeps the foreground %s card opaque and above its neighbors through travel and wrapping",
    async (title) => {
      render(<FeatureShowcase />);
      const { slides, next } = carousel(title);
      fireEvent.click(next);
      const position = vi.mocked(animate).mock.lastCall![0] as MotionValue<number>;
      await nextFrame();

      for (const [progress, foreground] of [
        [0.48, 0],
        [0.52, 1],
        [-0.48, 0],
        [-0.52, slides.length - 1],
        [slides.length - 0.52, slides.length - 1],
        [slides.length - 0.48, 0],
        [0, 0],
        [1, 1],
        [slides.length - 1, slides.length - 1],
        [slides.length, 0],
      ]) {
        act(() => position.set(progress));
        await nextFrame();
        const front = slides[foreground];
        expect(front.style.opacity).toBe("1");
        for (const card of slides) {
          if (card !== front) expect(Number(card.style.zIndex)).toBeLessThan(Number(front.style.zIndex));
        }
      }
    },
  );

  it("keeps each carousel independent when navigating with progress dots", () => {
    render(<FeatureShowcase />);
    const agent = carousel("Agent capabilities");
    const tools = carousel("Tools");
    const unity = carousel("Unity");
    fireEvent.click(unity.dots[2]);

    expect(unity.status.textContent).toBe("3 of 3: Schedule sharing");
    expect(agent.status.textContent).toBe("1 of 3: Grounded answers");
    expect(tools.status.textContent).toBe("1 of 6: Campus map");
    expect(unity.dots[2].getAttribute("aria-current")).toBe("true");
  });

  it("supports looping arrow, Home and End keys without moving keyboard focus", () => {
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    tools.viewport.focus();
    for (const [key, expected] of [
      ["End", "6 of 6: Calendar"],
      ["ArrowRight", "1 of 6: Campus map"],
      ["ArrowLeft", "6 of 6: Calendar"],
      ["Home", "1 of 6: Campus map"],
      ["ArrowLeft", "6 of 6: Calendar"],
      ["ArrowRight", "1 of 6: Campus map"],
    ]) {
      expect(fireEvent.keyDown(tools.viewport, { key })).toBe(false);
      expect(tools.status.textContent).toBe(expected);
      expect(document.activeElement).toBe(tools.viewport);
    }
    vi.mocked(animate).mockClear();
    expect(fireEvent.keyDown(tools.viewport, { key: "Tab" })).toBe(true);
    expect(animate).not.toHaveBeenCalled();
  });

  it.each([true, false])("honors reduced motion: %s", (reduced) => {
    motionPreference.reduced = reduced;
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    fireEvent.click(tools.next);
    expect(animate).toHaveBeenLastCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ duration: reduced ? 0 : 0.45 }),
    );
  });

  it("advances once per horizontal wheel gesture without trapping page scrolling or zoom", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<FeatureShowcase />);
    const tools = carousel("Tools");
    expect(fireEvent.wheel(tools.viewport, { deltaX: 12, deltaY: 60 })).toBe(true);
    const zoom = new WheelEvent("wheel", { deltaX: 80, cancelable: true });
    // Happy DOM's WheelEvent does not inherit mouse modifiers.
    Object.defineProperty(zoom, "ctrlKey", { value: true });
    expect(fireEvent(tools.viewport, zoom)).toBe(true);
    expect(tools.status.textContent).toBe("1 of 6: Campus map");

    expect(fireEvent.wheel(tools.viewport, { deltaX: 24 })).toBe(false);
    expect(tools.status.textContent).toBe("1 of 6: Campus map");
    fireEvent.wheel(tools.viewport, { deltaX: 30 });
    expect(tools.status.textContent).toBe("2 of 6: Course lookup");
    now += 50;
    fireEvent.wheel(tools.viewport, { deltaX: 100 });
    expect(tools.status.textContent).toBe("2 of 6: Course lookup");

    now += 200;
    fireEvent.wheel(tools.viewport, { deltaX: -4, deltaMode: 1 });
    expect(tools.status.textContent).toBe("1 of 6: Campus map");
    now += 200;
    Object.defineProperty(tools.viewport, "clientWidth", { configurable: true, value: 800 });
    fireEvent.wheel(tools.viewport, { deltaX: -1, deltaMode: 2 });
    expect(tools.status.textContent).toBe("6 of 6: Calendar");
  });

  it.each([true, false])(
    "supports swiping and cancels vertical or interrupted gestures (reduced: %s)",
    async (reduced) => {
      motionPreference.reduced = reduced;
      render(<FeatureShowcase />);
      const tools = carousel("Tools");
      await swipe(tools.viewport, 140);
      expect(tools.status.textContent).toBe("6 of 6: Calendar");
      await swipe(tools.viewport, -140);
      expect(tools.status.textContent).toBe("1 of 6: Campus map");
      await swipe(tools.viewport, -10, 120);
      expect(tools.status.textContent).toBe("1 of 6: Campus map");
      await swipe(tools.viewport, -140, 0, true);
      expect(tools.status.textContent).toBe("1 of 6: Campus map");
      expect(animate).toHaveBeenLastCalledWith(expect.anything(), 0, expect.anything());
    },
  );

  it("preserves selection on resize and stops animation on unmount", () => {
    const view = render(<FeatureShowcase />);
    const tools = carousel("Tools");
    fireEvent.click(tools.dots[4]);
    fireEvent.resize(window);
    expect(tools.status.textContent).toBe("5 of 6: Course schedule");
    const stop = vi.spyOn(vi.mocked(animate).mock.results.at(-1)!.value, "stop");
    view.unmount();
    expect(stop).toHaveBeenCalled();
  });
});
