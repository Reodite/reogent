import { describe, expect, it } from "vitest";
import { createThinkTagSplitter, stripThinkTags } from "./think-tags";
import type { ConverseStreamEvent } from "./types";

/** Feed deltas through a fresh splitter and collect every event, flush included. */
function run(deltas: string[]): ConverseStreamEvent[] {
  const splitter = createThinkTagSplitter();
  const events: ConverseStreamEvent[] = [];
  for (const d of deltas) events.push(...splitter.push(d));
  events.push(...splitter.flush());
  return events;
}

/** Concatenate all deltas of one type in order. */
function join(events: ConverseStreamEvent[], type: "text" | "thinking"): string {
  return events
    .filter((e) => e.type === type)
    .map((e) => (e as { delta: string }).delta)
    .join("");
}

describe("createThinkTagSplitter", () => {
  it("passes plain text through unchanged", () => {
    const events = run(["Hello ", "world"]);
    expect(join(events, "text")).toBe("Hello world");
    expect(join(events, "thinking")).toBe("");
  });

  it("classifies a leading think block as thinking, rest as text", () => {
    const events = run(["<think>reasoning here</think>the answer"]);
    expect(join(events, "thinking")).toBe("reasoning here");
    expect(join(events, "text")).toBe("the answer");
  });

  it("holds back an opening tag split across deltas", () => {
    const events = run(["<thi", "nk>secret</think>answer"]);
    expect(join(events, "thinking")).toBe("secret");
    expect(join(events, "text")).toBe("answer");
    // The partial "<thi" must never surface as text.
    expect(join(events, "text")).not.toContain("<");
  });

  it("holds back a closing tag split across deltas", () => {
    const events = run(["<think>secret</thi", "nk>answer"]);
    expect(join(events, "thinking")).toBe("secret");
    expect(join(events, "text")).toBe("answer");
  });

  it("handles multiple think blocks interleaved with text", () => {
    const events = run(["a<think>x</think>b<think>y</think>c"]);
    expect(join(events, "text")).toBe("abc");
    expect(join(events, "thinking")).toBe("xy");
  });

  it("keeps an unterminated think block as thinking, leaking nothing to text", () => {
    const events = run(["answer <think>still reasoning and then the stream ends"]);
    expect(join(events, "text")).toBe("answer ");
    expect(join(events, "thinking")).toBe("still reasoning and then the stream ends");
  });

  it("does not emit a dangling partial tag left at stream end", () => {
    // "<thi" at the very end is ambiguous; flush must surface it rather than drop it.
    const events = run(["done<thi"]);
    expect(join(events, "text")).toBe("done<thi");
    expect(join(events, "thinking")).toBe("");
  });

  it("splits tag character-by-character", () => {
    const deltas = "hi<think>r</think>bye".split("");
    const events = run(deltas);
    expect(join(events, "text")).toBe("hibye");
    expect(join(events, "thinking")).toBe("r");
  });
});

describe("stripThinkTags", () => {
  it("returns text unchanged when there are no tags", () => {
    expect(stripThinkTags("plain answer")).toBe("plain answer");
  });

  it("removes a think span", () => {
    expect(stripThinkTags("<think>reasoning</think>answer")).toBe("answer");
  });

  it("removes multiple think spans", () => {
    expect(stripThinkTags("a<think>x</think>b<think>y</think>c")).toBe("abc");
  });

  it("drops everything from an unterminated open tag onward", () => {
    expect(stripThinkTags("answer <think>cut off")).toBe("answer ");
  });
});
