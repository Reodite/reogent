import { describe, expect, it } from "vitest";
import { buildUserContent, splitUserContent } from "./message";

describe("Ask AI attachments — buildUserContent / splitUserContent", () => {
  it("round-trips a prompt with an attachment", () => {
    const content = buildUserContent("Help me plan my degree:", {
      title: "Degree course table",
      content: "Year 1\n  Term 1 (9 credits):\n    CPSC 103 — Intro (3 cr)",
    });
    expect(splitUserContent(content)).toEqual({
      text: "Help me plan my degree:",
      attachmentTitle: "Degree course table",
    });
  });

  it("passes plain messages through untouched", () => {
    expect(buildUserContent("hello")).toBe("hello");
    expect(splitUserContent("hello\nworld")).toEqual({ text: "hello\nworld", attachmentTitle: null });
  });

  it("keeps attachment bodies containing angle brackets and JSON intact", () => {
    const json = '{\n "nodes": [{"code": "CPSC 310"}],\n "note": "a </b> tag"\n}';
    const content = buildUserContent("Take a look at this course tree:", {
      title: "Course Prerequisite Tree",
      content: json,
    });
    expect(content.endsWith(`<attachment title="Course Prerequisite Tree">\n${json}\n</attachment>`)).toBe(true);
    expect(splitUserContent(content).attachmentTitle).toBe("Course Prerequisite Tree");
  });

  it("sanitizes quotes and newlines out of titles so the wrapper stays parseable", () => {
    const content = buildUserContent("hi", { title: 'a "quoted"\ntitle', content: "data" });
    expect(splitUserContent(content)).toEqual({ text: "hi", attachmentTitle: "a 'quoted''title" });
  });
});
