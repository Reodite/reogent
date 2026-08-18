// @vitest-environment happy-dom
import fixtureJson from "@/__fixtures__/agent-turns.json";
import { injectChips } from "@/src/components/chat/citations/chip-injector";
import { CitationChip } from "@/src/components/chat/citations/citation-chip";
import { SourcesPanel } from "@/src/components/chat/citations/sources-panel";
import { createChatApi } from "@/src/lib/api";
import type { Citation } from "@/src/shared/citations/citation";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = fixtureJson as {
  turns: { name: string; providers: { anthropic: string; openai: string; google: string } }[];
};

// happy-dom lacks matchMedia; motion's useReducedMotion queries it.
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

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function makeCitations(n: number, used = false, withUrl = false): Citation[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    kind: "course",
    label: `Source ${i + 1}`,
    used,
    source_url: withUrl ? `https://example.org/${i + 1}` : undefined,
    tool: "search_courses",
  }));
}

describe("Property 22 — out-of-range [k] markers render as the literal [k] (REQ-13.3)", () => {
  const cases: Array<[string, number]> = [
    ["[0]", 3],
    ["[4]", 3],
    ["[99]", 0],
    ["[-1]", 5],
  ];
  for (const [marker, n] of cases) {
    it(`renders literal ${marker} against a ${n}-citation array`, () => {
      const citations = makeCitations(n);
      const out = injectChips(marker, citations);
      const c = render(<div>{out}</div>).container;
      expect(c.querySelectorAll("[data-index]")).toHaveLength(0);
      expect(c.textContent).toBe(marker);
    });
  }
  it("mixes in-range chips and out-of-range literals in the same string", () => {
    const citations = makeCitations(3);
    const out = injectChips("see [1] and [99] plus [3] then [0]", citations);
    const c = render(<div>{out}</div>).container;
    expect(c.querySelectorAll("[data-index]")).toHaveLength(2);
    expect(c.querySelectorAll('[data-index="1"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-index="3"]')).toHaveLength(1);
    expect(c.textContent).toContain("[99]");
    expect(c.textContent).toContain("[0]");
  });
});

describe("Property 23a — in-range [N] becomes a chip at every injected leaf string (REQ-13.4)", () => {
  const stems = [
    "Intro [1].",
    "Take [2] or [3].",
    "Multi [1] [2] [3] [4].",
    "Edge case at end [10]",
    "Repeated [2] [2] [2]",
  ];
  for (const stem of stems) {
    it(`injects chips for every in-range marker in ${JSON.stringify(stem)}`, () => {
      const n = (stem.match(/\[(\d+)\]/g) ?? []).map((m) => Number(m.slice(1, -1)));
      const max = Math.max(...n);
      const citations = makeCitations(max);
      const out = injectChips(stem, citations);
      const c = render(<div>{out}</div>).container;
      expect(c.querySelectorAll("a[data-index], span[data-index]")).toHaveLength(n.length);
    });
  }
});

describe("Property 23b — chip sequence is invariant under re-rendering (REQ-13.4)", () => {
  it("re-rendering the same injected children yields identical data-index sequences", () => {
    const citations = makeCitations(4);
    const renderIds = () =>
      Array.from(render(<div>{injectChips("[1][2][3][4]", citations)}</div>).container.querySelectorAll("[data-index]"))
        .map((el) => el.getAttribute("data-index"))
        .join(",");
    const first = renderIds();
    const second = renderIds();
    expect(second).toBe(first);
    expect(first).toBe("1,2,3,4");
  });
});

describe("Property 24 — source_url absent renders no anchor and exposes label as tooltip (REQ-13.2)", () => {
  it("renders a span with the label as title and no <a> when source_url is absent", () => {
    const citation: Citation = {
      index: 7,
      kind: "course",
      label: "MATH 200 — Calculus III",
      used: true,
      tool: "get_course",
    };
    const c = render(<CitationChip citation={citation} />).container;
    const chip = c.querySelector("[data-index='7']");
    expect(chip?.tagName).toBe("SPAN");
    expect(chip?.getAttribute("title")).toBe("MATH 200 — Calculus III");
    expect(c.querySelector("a")).toBeNull();
  });
  it("renders an anchor with href when source_url is present", () => {
    const citation: Citation = {
      index: 7,
      kind: "page",
      label: "UBC Calendar",
      used: true,
      source_url: "https://students.ubc.ca/calendar",
      tool: "search_ubc_pages",
    };
    const c = render(<CitationChip citation={citation} />).container;
    const anchor = c.querySelector("a[data-index='7']");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("https://students.ubc.ca/calendar");
    expect(anchor?.getAttribute("title")).toBe("UBC Calendar");
    expect(anchor?.getAttribute("target")).toBe("_blank");
  });
});

describe("17.8 — Sources panel two-list rendering edge cases", () => {
  it("splits used and unused rows under a 'Sources used' summary when both lists are non-empty", () => {
    const citations = [
      ...makeCitations(3, true, true),
      ...makeCitations(2, false, true).map((c) => ({ ...c, index: c.index + 3 })),
    ];
    const c = render(<SourcesPanel citations={citations} />).container;
    expect(c.querySelector("[data-sources-panel]")).not.toBeNull();
    expect(c.querySelectorAll('[data-used="true"]')).toHaveLength(3);
    expect(c.querySelectorAll('[data-used="false"]')).toHaveLength(2);
    expect(c.querySelector("summary")?.textContent).toContain("Sources used (3)");
    // Unused rows carry the reduced-opacity label class.
    const unusedRow = c.querySelector('[data-used="false"]');
    expect(unusedRow?.innerHTML).toContain("opacity-60");
  });
  it("falls back to 'Other retrieved context (M)' when no citations are stamped used", () => {
    const citations = makeCitations(4, false, true);
    const c = render(<SourcesPanel citations={citations} />).container;
    expect(c.querySelector("summary")?.textContent).toBe("Other retrieved context (4)");
  });
  it("renders only the 'Sources used' list when every citation is used", () => {
    const citations = makeCitations(2, true, true);
    const c = render(<SourcesPanel citations={citations} />).container;
    expect(c.querySelector("summary")?.textContent).toBe("Sources used (2)");
    expect(c.querySelectorAll('[data-used="false"]')).toHaveLength(0);
  });
});

describe("17.9 — Sources panel collapses by default and scrolls into view on expand", () => {
  it("renders a closed <details> element initially", () => {
    const citations = makeCitations(2, true, true);
    const c = render(<SourcesPanel citations={citations} />).container;
    const details = c.querySelector("details");
    expect(details?.open).toBe(false);
  });
  it("scrolls the panel into view when the user expands the summary", () => {
    const citations = makeCitations(2, true, true);
    const calls: HTMLElement[] = [];
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: HTMLElement) {
      calls.push(this);
      return undefined;
    });
    const { container } = render(<SourcesPanel citations={citations} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].closest("[data-sources-panel]")).not.toBeNull();
    spy.mockRestore();
  });
});

describe("Property 41 (15.11) — renderer tolerates null/undefined/non-array citations (REQ-13.1)", () => {
  const bad: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["empty array", []],
    ["non-array object", { broken: true }],
    ["non-array string", "nope"],
  ];
  for (const [label, value] of bad) {
    it(`SourcesPanel renders nothing for ${label}`, () => {
      const c = render(<SourcesPanel citations={value as Citation[] | null | undefined} />).container;
      expect(c.querySelector("[data-sources-panel]")).toBeNull();
    });
  }
  it("injectChips returns children untouched when citations is null or non-array", () => {
    expect(injectChips("see [1]", null)).toBe("see [1]");
    expect(injectChips("see [1]", { broken: true } as unknown as Citation[])).toBe("see [1]");
  });
});

describe("17.10 — Sources panel renders against the fixture NDJSON stream as citations fill (REQ-13.5)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockStream(body: string): { fetch: typeof globalThis.fetch; controller: AbortController } {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(body.endsWith("\n") ? body : `${body}\n`));
        c.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    return { fetch: vi.fn(async () => response) as unknown as typeof globalThis.fetch, controller };
  }

  it("fires onCitations once per 'citations' event and once on 'done' for the overflow turn (8 → 8 stamped)", async () => {
    const ndjson = fixture.turns[2].providers.anthropic;
    const { fetch } = mockStream(ndjson);
    globalThis.fetch = fetch;
    const api = createChatApi({ getToken: async () => "test-token" });
    const snapshots: Array<{ count: number; usedCount: number }> = [];
    const response = await api.chat("session", [], {
      onCitations(citations) {
        snapshots.push({ count: citations.length, usedCount: citations.filter((c) => c.used).length });
      },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toEqual({ count: 8, usedCount: 0 });
    expect(snapshots[1]).toEqual({ count: 8, usedCount: 3 });
    expect(response.citations).toHaveLength(8);
    expect(response.citations?.filter((c) => c.used).map((c) => c.index)).toEqual([1, 2, 7]);
  });

  it("passes the empty-citations turn without emitting chips or panel", async () => {
    const ndjson = fixture.turns[1].providers.anthropic;
    const { fetch } = mockStream(ndjson);
    globalThis.fetch = fetch;
    const api = createChatApi({ getToken: async () => "test-token" });
    const seen: number[] = [];
    const response = await api.chat("session", [], {
      onCitations(citations) {
        seen.push(citations.length);
      },
    });
    expect(seen).toEqual([0, 0]);
    expect(response.citations).toEqual([]);
  });

  it("renders the SourcesPanel against the superseding stamped array from 'done'", async () => {
    const ndjson = fixture.turns[2].providers.anthropic;
    const { fetch } = mockStream(ndjson);
    globalThis.fetch = fetch;
    const api = createChatApi({ getToken: async () => "test-token" });
    let latest: Citation[] = [];
    await api.chat("session", [], {
      onCitations(citations) {
        latest = citations;
      },
    });
    const c = render(<SourcesPanel citations={latest} />).container;
    expect(c.querySelectorAll("[data-citation-row]")).toHaveLength(8);
    expect(c.querySelectorAll('[data-used="true"]')).toHaveLength(3);
  });
});
