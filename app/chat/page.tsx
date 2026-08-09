"use client";

// /chat mints a fresh client-side session id and replaces into it.
// Falls back gracefully if crypto.randomUUID is unavailable (non-HTTPS contexts).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: manual v4 UUID (non-secure contexts or older engines)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function NewChatPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      router.replace(`/chat/${makeId()}`);
    } catch {
      setFailed(true);
    }
  }, [router]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted text-sm">
          Couldn&apos;t start a new conversation.{" "}
          <button type="button" onClick={() => window.location.reload()} className="text-primary underline">
            Reload
          </button>
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Starting new conversation"
    >
      <div className="bg-surface-container h-6 w-6 animate-pulse rounded-full" />
      <p className="text-muted text-xs">Starting your conversation…</p>
    </div>
  );
}
