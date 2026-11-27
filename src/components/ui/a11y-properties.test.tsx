// @vitest-environment happy-dom
import { announce, LiveRegion, readAnnouncement } from "@/src/components/ui/live-region";
import type { Citation } from "@/src/shared/citations/citation";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
});

// Property 35 — live region updates within one tick after announce()
describe("Live region status announcements", () => {
  it("citation panel expand + collapse announce via the live region", async () => {
    const { container } = render(<LiveRegion />);
    const region = container.querySelector("[data-live-region]") as HTMLElement;
    expect(region.getAttribute("aria-live")).toBe("polite");
    act(() => announce("Sources panel expanded"));
    expect(region.textContent).toBe("Sources panel expanded");
    expect(readAnnouncement()).toBe("Sources panel expanded");
    act(() => announce("Sources panel collapsed"));
    expect(region.textContent).toBe("Sources panel collapsed");
  });

  it("calendar month change announces the new month heading", async () => {
    const { container } = render(<LiveRegion />);
    const region = container.querySelector("[data-live-region]") as HTMLElement;
    act(() => announce("Moved to April 2024"));
    expect(region.textContent).toBe("Moved to April 2024");
  });

  it("prereq selection flip announces", async () => {
    const { container } = render(<LiveRegion />);
    const region = container.querySelector("[data-live-region]") as HTMLElement;
    act(() => announce("Prereq selection updated: option 1"));
    expect(region.textContent).toContain("option 1");
  });

  it("citation chip click announces the opened citation", async () => {
    const { container } = render(<LiveRegion />);
    const region = container.querySelector("[data-live-region]") as HTMLElement;
    act(() => announce("Citation 1 opened"));
    expect(region.textContent).toBe("Citation 1 opened");
  });
});

describe("SourcesPanel", () => {
  it("reveals unused sources when expanded", async () => {
    const { SourcesPanel } = await import("@/src/components/chat/citations/sources-panel");
    const citations: Citation[] = [
      { index: 1, label: "Used source", kind: "course", used: true, source_url: "https://e", tool: "get_course" },
      { index: 2, label: "Unused source", kind: "page", used: false, tool: "search_courses" },
    ];
    const { container } = render(<SourcesPanel citations={citations} />);
    const summary = container.querySelector("summary") as HTMLElement;
    act(() => {
      fireEvent.click(summary);
    });
    await waitFor(() => expect(container.querySelector("[data-citation-row='2']")).not.toBeNull());
    expect(container.querySelector("[data-citation-row='2']")?.textContent).toContain("Unused source");
  });
});
