export default function ChatLoading() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Loading">
      <div className="bg-surface-container h-6 w-6 animate-pulse rounded-full" />
    </div>
  );
}
