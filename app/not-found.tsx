import { Icon } from "@/src/components/icons";
import { ButtonLink } from "@/src/components/ui/button";
import { FullPageState } from "@/src/components/ui/feedback";

export default function NotFound() {
  return (
    <FullPageState
      fill="parent"
      title="Page not found"
      description="We looked everywhere on campus. This page doesn't exist."
      actions={
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
      }
    />
  );
}
