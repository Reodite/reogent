"use client";

import { useEffect, useState } from "react";

let current = "";
const subs = new Set<(s: string) => void>();

/** Stores the latest announcement and notifies mounted live regions. */
export function announce(message: string): void {
  current = message;
  for (const sub of subs) sub(message);
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
