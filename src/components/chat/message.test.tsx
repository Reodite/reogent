// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { AssistantMessage } from "./message";

vi.mock("@/src/components/chat/tool-renderers", () => ({ ResponseWidget: () => null }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

beforeAll(async () => {
  await Promise.all([import("react-markdown"), import("remark-gfm")]);
});

afterEach(cleanup);

it("keeps thinking text mounted across native disclosure toggles and stream updates", () => {
  const view = (content: string) => (
    <AssistantMessage
      message={{ id: "m1", role: "assistant", content: "", activity: [{ type: "thinking", content }] }}
    />
  );
  const { container, getByText, rerender } = render(view("Checking prerequisites"));
  const details = container.querySelector("details")!;
  const body = getByText("Checking prerequisites");
  const summary = details.querySelector("summary")!;
  expect(summary.classList.contains("min-h-11")).toBe(true);
  expect(summary.classList.contains("sm:min-h-8")).toBe(true);
  expect(body.hasAttribute("data-thinking-scroll")).toBe(true);
  expect(body.tabIndex).toBe(0);
  expect(body.parentElement?.classList.contains("overflow-hidden")).toBe(true);
  expect(details.open).toBe(false);
  act(() => {
    details.open = true;
    fireEvent(details, new Event("toggle"));
  });
  expect(getByText("Checking prerequisites")).toBe(body);
  act(() => {
    details.open = false;
    fireEvent(details, new Event("toggle"));
  });
  expect(getByText("Checking prerequisites")).toBe(body);
  rerender(view("Checking prerequisites and credits"));
  expect(getByText("Checking prerequisites and credits")).toBe(body);
  expect(details.open).toBe(false);
});

const citations = [{ index: 1, kind: "course" as const, label: "Course source", used: true, tool: "get_course" }];

it.each([
  {
    name: "tight and nested",
    content:
      "- [x] Read **requirements** [1] and keep the complete linked label.\n- [ ] Check the next course.\n  - [ ] Nested task.",
    count: 3,
  },
  {
    name: "loose",
    content:
      "- [x] Read **requirements** [1].\n\n  Keep the second paragraph with its task.\n\n- [ ] Check the next course.",
    count: 2,
  },
])("preserves safe $name task-list structure and inline content", async ({ content, count }) => {
  const markup = `${content}\n\n| Course | Count |\n| :-- | --: |\n| CPSC 221 [1] | 3 |\n\n[Guide](https://example.org/guide) and \`[1]\`.\n\n<script>alert(1)</script>`;
  const { container } = render(
    <AssistantMessage message={{ id: "tasks", role: "assistant", content: markup, citations }} />,
  );
  const prose = container.querySelector(".assistant-markdown")!;
  await waitFor(() => expect(prose.querySelectorAll('input[type="checkbox"]')).toHaveLength(count));
  for (const input of prose.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    expect(input.disabled).toBe(true);
    expect(input.closest("li")?.classList.contains("task-list-item")).toBe(true);
    expect(input.closest("li")?.hasAttribute("node")).toBe(false);
  }
  expect(prose.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(prose.querySelector("strong")?.textContent).toBe("requirements");
  expect(prose.querySelector('[data-index="1"]')).not.toBeNull();
  expect(prose.querySelector("code")?.textContent).toBe("[1]");
  expect(prose.querySelector("code [data-index]")).toBeNull();
  expect(prose.querySelector<HTMLTableCellElement>("thead th:last-child")?.style.textAlign).toBe("right");
  expect(prose.querySelector<HTMLTableCellElement>("tbody td:last-child")?.style.textAlign).toBe("right");
  expect(prose.querySelector("tbody td")?.parentElement?.tagName).toBe("TR");
  expect(prose.querySelector('a[href="https://example.org/guide"]')?.getAttribute("target")).toBe("_blank");
  expect(prose.querySelector("script")).toBeNull();
});

it("preserves article structure while suppressing raw HTML, unsafe links and remote images", async () => {
  const content =
    "## Example procedure\n\n1. Review requirements.\n2. Apply before the deadline.\n\n> Approval is required.\n\n[Unsafe](javascript:alert(1)) [Data](data:text/html,example)\n\n![Example illustration](https://assets.example.test/image.png)\n\n<iframe src='https://example.test/embed'></iframe><script>alert(1)</script>";
  const view = render(<AssistantMessage message={{ id: "article", role: "assistant", content }} />);
  await waitFor(() =>
    expect(view.container.querySelector(".assistant-markdown h2")?.textContent).toBe("Example procedure"),
  );
  expect(view.container.querySelectorAll(".assistant-markdown ol > li")).toHaveLength(2);
  expect(view.container.querySelector("blockquote")?.textContent).toContain("Approval is required");
  expect(view.container.querySelector("script, iframe, img")).toBeNull();
  for (const anchor of view.container.querySelectorAll(".assistant-markdown a")) {
    expect(anchor.getAttribute("href") ?? "").not.toMatch(/^(javascript|data):/i);
  }
});

it("links grouped Markdown citations without injecting into code or duplicating nested leaves", async () => {
  const grouped = [1, 2].map((index) => ({
    index,
    kind: "page",
    label: `Source ${index}`,
    used: true,
    tool: "get_library_hours",
    source_url: `https://example.test/source/${index}`,
  }));
  const content = "Unknown hours [1, 2]. **More context [2, 1].** Literal code: `[1, 2]`.";
  const { container } = render(
    <AssistantMessage message={{ id: "grouped", role: "assistant", content, citations: grouped }} />,
  );
  await waitFor(() => expect(container.querySelectorAll(".assistant-markdown a[data-index]")).toHaveLength(4));
  expect(
    Array.from(container.querySelectorAll(".assistant-markdown [data-index]"), (element) =>
      element.getAttribute("data-index"),
    ),
  ).toEqual(["1", "2", "2", "1"]);
  expect(container.querySelector("code")?.textContent).toBe("[1, 2]");
  expect(container.querySelector("code [data-index]")).toBeNull();
});

it("keeps Sources outside prose spacing while retaining its live Markdown sibling", async () => {
  const { container } = render(
    <AssistantMessage message={{ id: "sources", role: "assistant", content: "Read [1].", citations }} />,
  );
  await waitFor(() => expect(container.querySelector(".assistant-markdown [data-index]")).not.toBeNull());
  const prose = container.querySelector(".assistant-markdown")!;
  const sources = container.querySelector("[data-sources-panel]")!;
  expect(sources.closest(".assistant-markdown")).toBeNull();
  expect(sources.parentElement).toBe(prose.parentElement);
  expect(sources.previousElementSibling).toBe(prose);
  expect(sources.classList.contains("mt-2")).toBe(true);
  expect(sources.querySelectorAll("ul > li")).toHaveLength(1);
});
