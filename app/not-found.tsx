import { ButtonLink } from "@/src/components/ui/button";
import { FullPageState } from "@/src/components/ui/feedback";

export default function NotFound() {
  return (
    <FullPageState
      fill="parent"
      title="Page not found"
      description="We looked everywhere on campus. This page doesn't exist."
      actions={
        <ButtonLink href="/" variant="primary" size="prominent">
          Back to home
        </ButtonLink>
      }
    />
  );
}
