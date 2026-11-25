import { BackLink } from "@/src/components/ui/button";
import { FullPageState } from "@/src/components/ui/feedback";

export default function NotFound() {
  return (
    <FullPageState
      fill="parent"
      title="Page not found"
      description="We looked everywhere on campus. This page doesn't exist."
      actions={<BackLink href="/" label="Back to home" className="self-center" />}
    />
  );
}
