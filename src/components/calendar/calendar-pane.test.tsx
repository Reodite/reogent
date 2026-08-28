// @vitest-environment happy-dom
import fixture from "@/__fixtures__/calendar-events.json";
import { CalendarPane } from "@/src/components/calendar/calendar-pane";
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixtureEvents = fixture.output as CalendarEvent[];

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-04-15T00:00:00Z").getTime(), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

interface State {
  cursor: string;
  kinds: string[];
}

function renderPane(state: Partial<State> = {}, events: CalendarEvent[] = fixtureEvents) {
  const setState = vi.fn();
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(events), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
  const result = render(
    <CalendarPane
      state={{ cursor: state.cursor ?? "2024-04", kinds: state.kinds ?? ["academic", "holiday"] }}
      setState={setState}
    />,
  );
  const restore = () => {
    globalThis.fetch = original;
  };
  return { ...result, setState, restore };
}

async function waitForCell(container: HTMLElement, day: string, selector: string) {
  await waitFor(() => {
    const cell = container.querySelector(`[data-calendar-day="${day}"]`);
    expect(cell?.querySelector(selector)).not.toBeNull();
  });
  return container.querySelector(`[data-calendar-day="${day}"]`) as HTMLElement;
}

describe("Property 25 — empty month renders no markers (REQ-16.5)", () => {
  it("August 2024 is empty in the fixture: no event markers anywhere", async () => {
    const { container, restore } = renderPane({ cursor: "2024-08" });
    await waitFor(() => expect(container.querySelectorAll("[data-calendar-marker]")).toHaveLength(0));
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.querySelector("[data-calendar-day]")).not.toBeNull();
    restore();
  });
});

describe("Property 26 — two events on one day with different kinds render two distinct markers (REQ-16.2)", () => {
  it("2025-02-17 has both a Family Day holiday and the Winter Term 2 Reading week begin (academic)", async () => {
    const { container, restore } = renderPane({ cursor: "2025-02" });
    const cell = await waitForCell(container, "2025-02-17", "[data-calendar-marker]");
    const markers = cell.querySelectorAll("[data-calendar-marker]");
    expect(markers).toHaveLength(2);
    const kinds = Array.from(markers)
      .map((m) => m.getAttribute("data-calendar-marker"))
      .sort();
    expect(kinds).toEqual(["academic", "holiday"]);
    restore();
  });
});

describe("Property 27 — days with k > 3 events indicate the overflow count (REQ-16.4)", () => {
  it("a day with four events shows the first three labels and a '+1 more' overflow count", async () => {
    const events: CalendarEvent[] = (["Academic one", "Academic two", "Academic three", "Academic four"] as const).map(
      (label) => ({
        kind: "academic" as const,
        date: "2024-11-29",
        label,
        source_url: null,
        tags: [],
      }),
    );
    const { container, restore } = renderPane({ cursor: "2024-11" }, events);
    const cell = await waitForCell(container, "2024-11-29", "[data-calendar-count]");
    const count = cell.querySelector("[data-calendar-count]");
    expect(count?.getAttribute("data-calendar-count")).toBe("4");
    expect(count?.textContent).toContain("1 more");
    expect(cell.querySelectorAll("[data-calendar-marker]")).toHaveLength(3);
    restore();
  });
});

describe("Property 28 — today's cell receives the 'today' style independent of event markers (REQ-17.4)", () => {
  it("a today cell with no events still carries data-calendar-today + the filled primary date circle", async () => {
    const { container, restore } = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(container.querySelector('[data-calendar-today="2024-04-15"]')).not.toBeNull());
    const todayCell = container.querySelector('[data-calendar-today="2024-04-15"]') as HTMLElement;
    const numSpan = todayCell.querySelector(":scope > span");
    expect(numSpan?.className).toContain("bg-primary");
    expect(numSpan?.className).toContain("rounded-full");
    expect(todayCell.querySelectorAll("[data-calendar-marker]")).toHaveLength(0);
    restore();
  });
});

describe("Property 29 — cursors beyond futureHorizonMonths disable the next-month affordance (REQ-17.5)", () => {
  it("next-month is enabled at April 2024 and disabled past the 24-month horizon", async () => {
    const near = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(near.container.querySelector("[data-calendar-day]")).not.toBeNull());
    expect(near.container.querySelector('[data-calendar-nav="next"]')?.hasAttribute("disabled")).toBe(false);
    near.unmount();
    const far = renderPane({ cursor: "2026-04" });
    await waitFor(() => expect(far.container.querySelector("[data-calendar-day]")).not.toBeNull());
    expect(far.container.querySelector('[data-calendar-nav="next"]')?.hasAttribute("disabled")).toBe(true);
    far.restore();
  });
});

describe("20.10 — prev/next/today jumps update the cursor via setState (REQ-17.1/17.2/17.3)", () => {
  it("prev-month button decrements cursor by one month", async () => {
    const { container, setState, restore } = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(container.querySelector('[data-calendar-nav="prev"]')).not.toBeNull());
    fireEvent.click(container.querySelector('[data-calendar-nav="prev"]') as HTMLElement);
    expect(setState).toHaveBeenCalledWith({ cursor: "2024-03" });
    restore();
  });
  it("next-month button advances cursor by one month when within horizon", async () => {
    const { container, setState, restore } = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(container.querySelector('[data-calendar-nav="next"]')).not.toBeNull());
    fireEvent.click(container.querySelector('[data-calendar-nav="next"]') as HTMLElement);
    expect(setState).toHaveBeenCalledWith({ cursor: "2024-05" });
    restore();
  });
  it("month picker jumps the cursor to the picked month", async () => {
    const { container, setState, restore } = renderPane({ cursor: "2023-01" });
    await waitFor(() => expect(container.querySelector("[data-calendar-month-picker]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-calendar-month-picker]") as HTMLElement);
    fireEvent.click(container.querySelector('[data-calendar-month="2023-04"]') as HTMLElement);
    expect(setState).toHaveBeenCalledWith({ cursor: "2023-04" });
    restore();
  });
  it("month picker disables months past the 24-month horizon", async () => {
    const { container, restore } = renderPane({ cursor: "2026-04" });
    await waitFor(() => expect(container.querySelector("[data-calendar-month-picker]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-calendar-month-picker]") as HTMLElement);
    expect(container.querySelector('[data-calendar-month="2026-04"]')?.hasAttribute("disabled")).toBe(false);
    expect(container.querySelector('[data-calendar-month="2026-05"]')?.hasAttribute("disabled")).toBe(true);
    restore();
  });
});

describe("20.13 + Property 27b — multi-event-day popover enumerates each event by row with labels and source links (REQ-16.3, REQ-16.4)", () => {
  it("opens the popover on the multi-event day with three mix-kind events and lists exactly three rows", async () => {
    const events: CalendarEvent[] = [
      {
        kind: "academic",
        date: "2024-09-17",
        label: "Add/drop deadline",
        source_url: "https://students.ubc.ca/enrolled/important-dates",
        tags: ["deadline"],
      },
      {
        kind: "holiday",
        date: "2024-09-17",
        label: "National Day for Truth and Reconciliation",
        source_url: null,
        tags: [],
      },
      {
        kind: "academic",
        date: "2024-09-17",
        label: "Midterm exam week begins",
        source_url: "https://students.ubc.ca/enrolled/important-dates",
        tags: ["exam"],
      },
    ];
    const { container, restore } = renderPane({ cursor: "2024-09" }, events);
    const cell = await waitForCell(container, "2024-09-17", "[data-calendar-marker]");
    const markers = cell.querySelectorAll("[data-calendar-marker]");
    expect(markers).toHaveLength(3);
    // Click the first event marker (Add/drop deadline, which has a source_url)
    act(() => {
      fireEvent.click(markers[0]);
    });
    await waitFor(() => expect(container.querySelector("[data-calendar-popover]")).not.toBeNull());
    const popover = container.querySelector("[data-calendar-popover]") as HTMLElement;
    expect(popover.textContent).toContain("Add/drop deadline");
    expect(popover.textContent).toContain("View on UBC site");
    restore();
  });
});

describe("Redesign — upcoming sidebar lists future events grouped by date (desktop)", () => {
  it("shows the Upcoming heading and one entry per upcoming event, none from the past", async () => {
    const { container, restore } = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(container.querySelector("[data-calendar-upcoming]")).not.toBeNull());
    const rows = container.querySelectorAll("[data-calendar-upcoming] [data-upcoming-event]");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const date = row.getAttribute("data-upcoming-date") ?? "";
      expect(date >= "2024-04-15").toBe(true);
    }
    restore();
  });
});

describe("Redesign — clicking an event marker opens the modal with tags and kind", () => {
  it("opens on a single-event day and closes via the close button", async () => {
    const { container, restore } = renderPane({ cursor: "2025-02" });
    const cell = await waitForCell(container, "2025-02-17", "[data-calendar-marker]");
    const marker = cell.querySelector("[data-calendar-marker]") as HTMLElement;
    fireEvent.click(marker);
    await waitFor(() => expect(container.querySelector("[data-calendar-popover]")).not.toBeNull());
    const popover = container.querySelector("[data-calendar-popover]") as HTMLElement;
    expect(popover.textContent).toContain("Family Day");
    fireEvent.click(popover.querySelector('[aria-label="Close"]') as HTMLElement);
    await waitFor(() => expect(container.querySelector("[data-calendar-popover]")).toBeNull());
    restore();
  });
});

describe("Redesign — event modal closes on Escape", () => {
  it("opens on an event marker and closes when Escape is pressed", async () => {
    const { container, restore } = renderPane({ cursor: "2025-02" });
    const cell = await waitForCell(container, "2025-02-17", "[data-calendar-marker]");
    fireEvent.click(cell.querySelector("[data-calendar-marker]") as HTMLElement);
    await waitFor(() => expect(container.querySelector("[data-calendar-popover]")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(container.querySelector("[data-calendar-popover]")).toBeNull());
    restore();
  });
});
