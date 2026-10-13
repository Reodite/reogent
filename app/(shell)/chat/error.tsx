"use client";

import { ChatFrame } from "@/src/components/chat/chat-frame";
import { ButtonLink } from "@/src/components/ui/button";
import { RetryState, sanitizePublicErrorMessage } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";

export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error.digest) console.error("[ChatErrorBoundary]", error.digest, error.message);

  return (
    <ChatFrame aria-label="Conversation" header={<Heading as="h1">Conversation</Heading>} footer={null}>
      <RetryState
        title="Conversation failed to load"
        message={sanitizePublicErrorMessage(error.message)}
        onRetry={reset}
        secondaryAction={
          <ButtonLink href="/chat" size="prominent">
            New conversation
          </ButtonLink>
        }
        className="min-h-full justify-center"
      >
        {error.digest ? <p className="text-muted text-xs">Error ID: {error.digest}</p> : null}
      </RetryState>
    </ChatFrame>
  );
}
