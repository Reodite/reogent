"use client";

// FullBleedTool is the Tools-mode workspace surface: the whole workspace shows
// the selected pane (no chat split). Its per-pane rendering matches AnswerCanvas,
// minus the titlebar: in Tools mode the sidebar already names the pane and there
// is nothing to close, so the pane gets the full card height. Panes with a
// titlebar portal (prereq tree) fall back to their own in-pane chrome here.
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import type { CanvasView } from "@/src/components/shell/pane-registry";

export function FullBleedTool({ view }: { view: CanvasView | null }) {
  return <AnswerCanvas view={view} titlebar={false} />;
}
