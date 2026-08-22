// Splits an OpenAI-style content stream into text and thinking runs by parsing
// inline <think>…</think> tags. Some models (mostly local ones served through
// the OpenAI shape) inline reasoning into `delta.content` instead of a
// structured reasoning field, so without this the whole think block leaks into
// the answer until </think> arrives.

import type { ConverseStreamEvent } from "./types";

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** The longest suffix of `text` that is a proper prefix of `tag`. This is the
 *  part to hold back: it might complete into the tag once more chunks arrive. */
function danglingPrefixLen(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

/**
 * Stateful splitter for one stream. `push` returns the events a content delta
 * produces; text that ends in a partial tag is held back until the next push
 * (or flush) resolves it. `flush` drains the buffer at stream end — an
 * unterminated <think> stays classified as thinking, never leaking to text.
 */
export function createThinkTagSplitter() {
  let mode: "text" | "thinking" = "text";
  let buffer = "";

  function emit(run: string): ConverseStreamEvent | null {
    if (!run) return null;
    return mode === "thinking" ? { type: "thinking", delta: run } : { type: "text", delta: run };
  }

  return {
    push(delta: string): ConverseStreamEvent[] {
      buffer += delta;
      const events: ConverseStreamEvent[] = [];

      for (;;) {
        const tag = mode === "text" ? OPEN_TAG : CLOSE_TAG;
        const idx = buffer.indexOf(tag);
        if (idx === -1) break;
        const ev = emit(buffer.slice(0, idx));
        if (ev) events.push(ev);
        buffer = buffer.slice(idx + tag.length);
        mode = mode === "text" ? "thinking" : "text";
      }

      // No complete tag left. Emit everything except a tail that could still
      // grow into the tag we're watching for.
      const tag = mode === "text" ? OPEN_TAG : CLOSE_TAG;
      const hold = danglingPrefixLen(buffer, tag);
      const ready = buffer.slice(0, buffer.length - hold);
      buffer = buffer.slice(buffer.length - hold);
      const ev = emit(ready);
      if (ev) events.push(ev);
      return events;
    },

    flush(): ConverseStreamEvent[] {
      const ev = emit(buffer);
      buffer = "";
      return ev ? [ev] : [];
    },
  };
}

/** Removes <think>…</think> spans from a non-streamed completion. An
 *  unterminated <think> drops everything from the tag onward. No-op when the
 *  text has no think tags. */
export function stripThinkTags(text: string): string {
  if (!text.includes(OPEN_TAG)) return text;
  let out = "";
  let rest = text;
  for (;;) {
    const open = rest.indexOf(OPEN_TAG);
    if (open === -1) {
      out += rest;
      break;
    }
    out += rest.slice(0, open);
    const close = rest.indexOf(CLOSE_TAG, open + OPEN_TAG.length);
    if (close === -1) break; // unterminated — drop the rest
    rest = rest.slice(close + CLOSE_TAG.length);
  }
  return out;
}
