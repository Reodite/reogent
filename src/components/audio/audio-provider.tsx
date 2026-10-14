"use client";

import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  parseAudioPreferences,
  siteAudio,
  snapVolume,
  type AudioPreferences,
  type SoundCategory,
  type SoundCue,
} from "@/src/lib/audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface AudioContextValue {
  preferences: AudioPreferences;
  supported: boolean;
  setVolume: (volume: number) => void;
  setCategory: (category: SoundCategory, enabled: boolean) => void;
  preview: (cue: SoundCue) => void;
  previewVolume: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

/** Shares device-local sound preferences between onboarding and Settings. */
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within <AudioProvider>");
  return context;
}

function clickCue(event: MouseEvent): SoundCue | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  if (!(event.target instanceof Element)) return null;
  const control = event.target.closest(
    'a[href], button, summary, input[type="checkbox"], input[type="radio"], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]',
  );
  if (
    !control ||
    control.closest('[data-sound="off"], [inert], [aria-hidden="true"]') ||
    control.matches(':disabled, [aria-disabled="true"]')
  )
    return null;
  if (control.matches('[aria-current="page"], [role="tab"][aria-selected="true"]')) return null;
  if (control instanceof HTMLAnchorElement) {
    if (control.download || (control.target && control.target !== "_self") || control.href === window.location.href)
      return null;
    if (!/^https?:$/.test(control.protocol)) return null;
    return "navigation";
  }
  return control.matches('[data-sidebar-item], [role="tab"], [aria-expanded], summary') ? "navigation" : "interaction";
}

/** Installs gesture-gated sound feedback once for public pages, the shell, and portaled controls. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState({ ...DEFAULT_AUDIO_PREFERENCES });
  const [supported, setSupported] = useState(true);
  const current = useRef(preferences);

  const apply = useCallback((next: AudioPreferences, persist: boolean) => {
    current.current = next;
    siteAudio.configure(next);
    setPreferences(next);
    if (persist) {
      try {
        localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep preferences in memory when browser storage is unavailable.
      }
    }
  }, []);

  useEffect(() => {
    setSupported(typeof window.AudioContext === "function");
    try {
      apply(parseAudioPreferences(localStorage.getItem(AUDIO_STORAGE_KEY)), false);
    } catch {
      apply({ ...DEFAULT_AUDIO_PREFERENCES }, false);
    }
    const sync = (event: StorageEvent) => {
      if (event.key === AUDIO_STORAGE_KEY || event.key === null) apply(parseAudioPreferences(event.newValue), false);
    };
    const unlock = () => void siteAudio.unlock();
    const click = (event: MouseEvent) => {
      const cue = clickCue(event);
      if (cue) {
        unlock();
        siteAudio.play(cue);
      }
    };
    const change = (event: Event) => {
      if (event.target instanceof HTMLSelectElement && !event.target.closest('[data-sound="off"], [inert]')) {
        siteAudio.play("interaction");
      }
    };
    const history = () => siteAudio.play("navigation");
    const visibility = () => {
      if (document.hidden) siteAudio.pause();
      else unlock();
    };
    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("click", click, true);
    document.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("popstate", history);
    window.addEventListener("storage", sync);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("popstate", history);
      window.removeEventListener("storage", sync);
      siteAudio.dispose();
    };
  }, [apply]);

  const setVolume = useCallback(
    (value: number) => {
      const from = current.current.volume;
      const volume = snapVolume(value);
      apply({ ...current.current, volume }, true);
      siteAudio.previewVolume(from, volume);
    },
    [apply],
  );
  const setCategory = useCallback(
    (category: SoundCategory, enabled: boolean) => {
      apply({ ...current.current, [category]: enabled }, true);
    },
    [apply],
  );
  const preview = useCallback((cue: SoundCue) => {
    void siteAudio.unlock();
    siteAudio.play(cue, true);
  }, []);
  const previewVolume = useCallback(() => siteAudio.previewVolume(current.current.volume, current.current.volume), []);
  const value = useMemo(
    () => ({ preferences, supported, setVolume, setCategory, preview, previewVolume }),
    [preferences, supported, setVolume, setCategory, preview, previewVolume],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
