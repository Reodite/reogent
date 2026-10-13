// @vitest-environment happy-dom
import fixture from "@/__fixtures__/calendar-events.json";
import { CalendarPane } from "@/src/components/calendar/calendar-pane";
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  hidden: string[];
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
    <CalendarPane state={{ cursor: state.cursor ?? "2024-04", hidden: state.hidden }} setState={setState} />,
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

describe("Property 27 — busy days preserve a readable overflow count (REQ-16.4)", () => {
  it("a day with four events shows two labels and a '+2 more' overflow count", async () => {
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
    expect(count?.textContent).toContain("2 more");
    expect(cell.querySelectorAll("[data-calendar-marker]")).toHaveLength(2);
    restore();
  });
});

describe("Property 28 — today's cell receives the 'today' style independent of event markers (REQ-17.4)", () => {
  it("a today cell and neighboring dates use their readable state tokens", async () => {
    const { container, restore } = renderPane({ cursor: "2024-04" });
    await waitFor(() => expect(container.querySelector('[data-calendar-today="2024-04-15"]')).not.toBeNull());
    const todayCell = container.querySelector('[data-calendar-today="2024-04-15"]') as HTMLElement;
    const numSpan = todayCell.querySelector(":scope > span");
    expect(numSpan?.className).toContain("bg-primary");
    expect(numSpan?.className).toContain("rounded-full");
    expect(todayCell.querySelectorAll("[data-calendar-marker]")).toHaveLength(0);

    const current = container.querySelector('[data-calendar-day="2024-04-01"] > span');
    const adjacent = container.querySelector('[data-calendar-day="2024-03-31"] > span');
    expect(current?.className).toContain("text-on-surface-variant");
    expect(adjacent?.className).toContain("text-muted");
    expect(adjacent?.className).not.toContain("text-muted/40");
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
    const picker = screen.getByRole("dialog", { name: "Pick month and year" });
    expect(container.contains(picker)).toBe(false);
    fireEvent.click(picker.querySelector('[data-calendar-month="2023-04"]') as HTMLElement);
    expect(setState).toHaveBeenCalledWith({ cursor: "2023-04" });
    restore();
  });
  it("month picker disables months past the 24-month horizon", async () => {
    const { container, restore } = renderPane({ cursor: "2026-04" });
    await waitFor(() => expect(container.querySelector("[data-calendar-month-picker]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-calendar-month-picker]") as HTMLElement);
    const picker = screen.getByRole("dialog", { name: "Pick month and year" });
    expect(picker.querySelector('[data-calendar-month="2026-04"]')?.hasAttribute("disabled")).toBe(false);
    expect(picker.querySelector('[data-calendar-month="2026-05"]')?.hasAttribute("disabled")).toBe(true);
    const nextYear = within(picker).getByRole<HTMLButtonElement>("button", { name: "Next year" });
    const previousYear = within(picker).getByRole("button", { name: "Previous year" });
    expect(nextYear.disabled).toBe(true);
    expect(nextYear.className).toContain("size-11");
    expect(nextYear.className).not.toContain("@min-");
    fireEvent.click(previousYear);
    expect(nextYear.disabled).toBe(false);
    fireEvent.click(nextYear);
    expect(nextYear.disabled).toBe(true);
    restore();
  });
  it("legend buttons toggle a kind via setState and hidden kinds drop out of the grid", async () => {
    const on = renderPane({ cursor: "2025-02" });
    const legend = Array.from(on.container.querySelectorAll("[data-calendar-legend]")).map((el) => el.textContent);
    expect(legend).toEqual(["Academic", "Holiday", "Campus event"]);
    const holiday = on.container.querySelector('[data-calendar-legend="holiday"]') as HTMLElement;
    expect(holiday.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(holiday);
    expect(on.setState).toHaveBeenCalledWith({ hidden: ["holiday"] });
    on.restore();
    cleanup();
    const off = renderPane({ cursor: "2025-02", hidden: ["holiday"] });
    const cell = await waitForCell(off.container, "2025-02-17", "[data-calendar-marker]");
    const kinds = Array.from(cell.querySelectorAll("[data-calendar-marker]")).map((el) =>
      el.getAttribute("data-calendar-marker"),
    );
    expect(kinds).toEqual(["academic"]);
    const offButton = off.container.querySelector('[data-calendar-legend="holiday"]') as HTMLElement;
    expect(offButton.getAttribute("aria-pressed")).toBe("false");
    expect(offButton.className).toContain("text-muted");
    expect(offButton.className).not.toContain("text-muted/60");
    off.restore();
  });
});

describe("20.13 + Property 27b — multi-event-day popover enumerates each event by row with labels and source links (REQ-16.3, REQ-16.4)", () => {
  it("opens all three events from the desktop overflow control and selects the hidden event", async () => {
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
    expect(markers).toHaveLength(2);
    const more = within(cell).getByRole("button", { name: "Open all 3 events on Tuesday, September 17, 2024" });
    expect(more.textContent).toContain("+1 more");
    fireEvent.click(more);
    const agenda = await screen.findByRole("dialog", { name: /Events on/ });
    for (const event of events) expect(within(agenda).getByText(event.label)).not.toBeNull();
    fireEvent.click(within(agenda).getByText("Midterm exam week begins"));
    const popover = await screen.findByRole("dialog", { name: "Midterm exam week begins" });
    expect(popover.textContent).toContain("View on UBC site");
    expect(within(popover).getByRole("heading", { level: 2, name: "Midterm exam week begins" }).className).toContain(
      "text-base",
    );
    const source = within(popover).getByRole("link", { name: "View on UBC site" });
    expect(source.getAttribute("href")).toBe(events[2].source_url);
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
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
    await waitFor(() => expect(document.querySelector("[data-calendar-popover]")).not.toBeNull());
    const popover = document.querySelector("[data-calendar-popover]") as HTMLElement;
    expect(popover.textContent).toContain("Family Day");
    fireEvent.click(popover.querySelector('[aria-label="Close"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-calendar-popover]")).toBeNull());
    restore();
  });
});

describe("Redesign — event modal closes on Escape", () => {
  it("opens on an event marker and closes when Escape is pressed", async () => {
    const { container, restore } = renderPane({ cursor: "2025-02" });
    const cell = await waitForCell(container, "2025-02-17", "[data-calendar-marker]");
    fireEvent.click(cell.querySelector("[data-calendar-marker]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-calendar-popover]")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-calendar-popover]")).toBeNull());
    restore();
  });
});

describe("Compact calendar agenda", () => {
  it("keeps month cells and padded upcoming skeletons visible until data arrives", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { container } = render(<CalendarPane state={{ cursor: "2025-03" }} setState={vi.fn()} />);
    expect(container.querySelectorAll("[data-calendar-day] [data-skeleton]").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-calendar-upcoming] [data-skeleton]")).not.toBeNull();
    expect(container.querySelector("[data-workspace-canvas]")?.className).toContain("p-4");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.queryByText("No events upcoming.")).toBeNull();
    await act(async () => {
      resolve(new Response("[]", { status: 200 }));
    });
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    const grid = container.querySelector("[data-calendar-grid]");
    expect(grid).not.toBeNull();
    expect(grid?.classList.contains("grow")).toBe(true);
    expect(grid?.classList.contains("shrink-0")).toBe(true);
    expect(grid?.classList.contains("flex-1")).toBe(false);
    expect(screen.getByText("No events upcoming.")).not.toBeNull();
  });

  it("opens one touch-sized day target and then the selected event", async () => {
    const events: CalendarEvent[] = [
      { kind: "holiday", date: "2025-02-17", label: "Family Day", source_url: null, tags: [] },
      { kind: "academic", date: "2025-02-17", label: "Reading week", source_url: null, tags: [] },
    ];
    const { container, restore } = renderPane({ cursor: "2025-02" }, events);
    const agenda = await waitForCell(container, "2025-02-17", "[data-calendar-day-agenda]");
    const trigger = agenda.querySelector("[data-calendar-day-agenda]") as HTMLElement;
    expect(trigger.className).toContain("min-h-11");
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: /Events on/ });
    const eventButton = within(dialog).getByRole("button", { name: /Family Day/ });
    expect(eventButton.className).toContain("min-h-11");
    fireEvent.click(eventButton);
    expect(screen.queryByRole("dialog", { name: /Events on/ })).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(await screen.findByRole("dialog", { name: "Family Day" })).not.toBeNull();
    restore();
  });

  it("replaces the month and Upcoming immediately while the next cursor loads", async () => {
    const first: CalendarEvent = {
      kind: "academic",
      date: "2025-02-17",
      label: "February deadline",
      source_url: null,
      tags: [],
    };
    let finish!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([first])))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const setState = vi.fn();
    const { container, rerender } = render(<CalendarPane state={{ cursor: "2025-02" }} setState={setState} />);
    await waitFor(() =>
      expect(container.querySelector("[data-upcoming-event]")?.textContent).toContain("February deadline"),
    );
    rerender(<CalendarPane state={{ cursor: "2025-03" }} setState={setState} />);
    expect(container.textContent).not.toContain("February deadline");
    expect(screen.getByText("Loading upcoming events…")).not.toBeNull();
    expect(container.querySelector('[data-calendar-day="2025-03-17"]')).not.toBeNull();
    await act(async () => finish(new Response("[]")));
    expect(screen.getByText("No events upcoming.").className).toContain("ui-content-enter");
    expect(container.querySelector("[data-calendar-grid]")?.parentElement?.className).toContain("ui-content-enter");
  });

  it("distinguishes failed loading from a successful empty calendar and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CalendarPane state={{ cursor: "2025-02" }} setState={vi.fn()} />);

    expect(screen.getByText("Loading upcoming events…")).not.toBeNull();
    expect(screen.getByText("Loading calendar…")).not.toBeNull();
    expect(await screen.findByText("Couldn't load calendar dates.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Couldn't load calendar dates.")).toBeNull());
    expect(screen.getByText("No events upcoming.")).not.toBeNull();
  });
});
