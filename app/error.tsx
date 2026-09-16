"use client";

import { Icon } from "@/src/components/icons";
import { Button, ButtonLink } from "@/src/components/ui/button";
import { FullPageState, sanitizePublicErrorMessage } from "@/src/components/ui/feedback";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error.digest) console.error("[ErrorBoundary]", error.digest, error.message);

  return (
    <FullPageState
      alert
      title="Something went wrong"
      description={
        <>
          <p>{sanitizePublicErrorMessage(error.message)}</p>
          <p className="mt-1 text-xs">This usually resolves on refresh.</p>
        </>
      }
      meta={error.digest ? <>Error ID: {error.digest}</> : null}
      actions={
        <>
          <Button variant="primary" size="prominent" onClick={reset}>
            Try again
          </Button>
          <ButtonLink
            href="/"
            variant="ghost"
            size="icon"
            className="self-center sm:size-11"
            aria-label="Back to home"
            title="Back to home"
          >
            <Icon name="arrowLeft" size={20} />
          </ButtonLink>
        </>
      }
    />
  );
}
