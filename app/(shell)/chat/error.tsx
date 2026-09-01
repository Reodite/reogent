"use client";

import { Button, ButtonLink } from "@/src/components/ui/button";

function sanitizeMessage(raw?: string): string {
  if (!raw) return "An unexpected error occurred.";
  return (
    raw
      .replace(/\/[\w./-]+/g, "")
      .replace(/at .+:\d+:\d+/g, "")
      .trim()
      .slice(0, 120) || "An unexpected error occurred."
  );
}

export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error.digest) console.error("[ChatErrorBoundary]", error.digest, error.message);

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div
        role="alert"
        className="neu-panel bg-surface flex w-full max-w-sm flex-col items-center rounded-2xl p-8 text-center"
      >
        <h1 className="text-on-surface mb-2 text-2xl font-medium tracking-[-0.02em]">Conversation failed to load</h1>
        <p className="text-muted mb-2 text-sm">{sanitizeMessage(error.message)}</p>
        {error.digest && <p className="text-muted/60 mb-4 text-xs">Error ID: {error.digest}</p>}
        <div className="flex w-full flex-col gap-3">
          <Button variant="primary" size="prominent" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/chat" size="prominent">
            New conversation
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
