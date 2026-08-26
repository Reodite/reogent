"use client";

// useState that survives unmounts and reloads via localStorage. Hydrates in an
// effect (not the initializer) so server-rendered HTML matches the first client
// render — the stored value pops in one frame after mount.
import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Unreadable — keep the initial value.
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = JSON.stringify(value);
      // `undefined` has no JSON form — clear the key so it reads as unset.
      if (raw === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, raw);
    } catch {
      // Storage unavailable — value just won't persist.
    }
  }, [hydrated, key, value]);

  return [value, setValue] as const;
}
