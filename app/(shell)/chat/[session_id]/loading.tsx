export default function SessionLoading() {
  return (
    <section className="neu-panel flex min-h-0 w-full flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center px-4 py-3">
        <div className="bg-surface-container h-5 w-40 animate-pulse rounded-md" />
      </div>
      <div className="chat-message-well min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col gap-6" role="status" aria-label="Loading conversation">
          <div className="bg-surface-container h-12 w-3/5 animate-pulse self-end rounded-[16px_16px_5px_16px]" />
          <div className="bg-surface-container h-20 w-4/5 animate-pulse rounded-[16px_16px_16px_5px]" />
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-4 sm:px-4">
        <div className="bg-surface-container-low h-14 animate-pulse rounded-2xl" />
      </div>
    </section>
  );
}
