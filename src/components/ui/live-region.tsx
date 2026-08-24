"use client";

import { useEffect, useState } from "react";

let current = "";
const subs = new Set<(s: string) => void>();

/** Updates the sr-only live region. Idempotent but fires subscribers on every call so toggles back to the same string still announce. */
export function announce(message: string): void {
  current = message;
  for (const sub of subs) sub(message);
}

/** Reads the current announcement (test hook). */
export function readAnnouncement(): string {
  return current;
}

export function useAnnouncer(): (message: string) => void {
  return announce;
}

/** Mount once near the app shell root. Updates within one render tick after `announce()` fires. */
export function LiveRegion() {
  const [message, setMessage] = useState(current);
  useEffect(() => {
    subs.add(setMessage);
    return () => {
      subs.delete(setMessage);
    };
  }, []);
  return (
    <div aria-live="polite" role="status" data-live-region className="sr-only">
      {message}
    </div>
  );
}
