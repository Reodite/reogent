"use client";

import { Button, ButtonLink } from "@/src/components/ui/button";
import { FullPageState, sanitizePublicErrorMessage } from "@/src/components/ui/feedback";

export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error.digest) console.error("[ChatErrorBoundary]", error.digest, error.message);

  return (
    <FullPageState
      alert
      fill="parent"
      title="Conversation failed to load"
      description={sanitizePublicErrorMessage(error.message)}
      meta={error.digest ? <>Error ID: {error.digest}</> : null}
      actions={
        <>
          <Button variant="primary" size="prominent" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/chat" size="prominent">
            New conversation
          </ButtonLink>
        </>
      }
    />
  );
}
