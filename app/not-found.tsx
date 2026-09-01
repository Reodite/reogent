import { ButtonLink } from "@/src/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="neu-panel bg-surface flex w-full max-w-sm flex-col items-center rounded-2xl p-8 text-center">
        <h1 className="text-on-surface mb-2 text-2xl font-medium tracking-[-0.02em]">Page not found</h1>
        <p className="text-muted mb-6 text-sm">We looked everywhere on campus. This page doesn&#39;t exist.</p>
        <ButtonLink href="/" variant="primary" size="prominent">
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}
