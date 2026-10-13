/** Renders the shared assistant monogram and name without chat state or markdown dependencies. */
export function AssistantIdentity() {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="bg-primary-container text-on-primary-container flex size-7 items-center justify-center rounded-lg text-[0.6875rem] font-medium">
        R
      </span>
      <span className="text-muted text-xs font-medium">Reodite</span>
    </div>
  );
}
