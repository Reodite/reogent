"use client";

// FullBleedTool is the Tools-mode workspace surface: the whole workspace shows
// the selected pane (no chat split). Its per-pane rendering matches AnswerCanvas
// exactly — only the surrounding layout differs, so it delegates to AnswerCanvas
// and may diverge when Tools Mode grows its own chrome.
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import type { CanvasView } from "@/src/components/shell/pane-registry";

export function FullBleedTool({ view }: { view: CanvasView | null }) {
  return <AnswerCanvas view={view} />;
}
