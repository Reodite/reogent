import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="neu-panel bg-surface flex w-full max-w-sm flex-col items-center rounded-2xl p-8 text-center">
        <h1 className="text-on-surface mb-2 text-2xl font-medium tracking-[-0.02em]">Page not found</h1>
        <p className="text-muted mb-6 text-sm">We looked everywhere on campus. This page doesn&#39;t exist.</p>
        <Link
          href="/"
          className="neu-primary-button bg-primary text-on-primary inline-block rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
