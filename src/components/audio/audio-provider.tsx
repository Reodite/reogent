"use client";

import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  isSoundCue,
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
  setVolume: (volume: number) => void;
  setCategory: (category: SoundCategory, enabled: boolean) => void;
  previewVolume: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);
const ICON_CUES: Record<string, SoundCue> = {
  arrowLeft: "back",
  undo: "back",
  redo: "navigation",
  close: "close",
  trash: "remove",
  zoomIn: "zoomIn",
  zoomOut: "zoomOut",
};

/** Shares browser-local sound preferences between onboarding and Settings. */
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within <AudioProvider>");
  return context;
}

function soundControl(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest(
    'a[href], button, summary, select, input[type="checkbox"], input[type="radio"], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"]',
  );
  if (
    !control ||
    control.closest('[data-sound="off"], [inert], [aria-hidden="true"]') ||
    control.matches(
      ':disabled, [aria-disabled="true"], [aria-current="page"], [aria-selected="true"], [role="radio"][aria-checked="true"], [data-sidebar-item][aria-pressed="true"]',
    )
  )
    return null;
  return control;
}

function clickCue(control: Element): SoundCue | null {
  if (
    control instanceof HTMLAnchorElement &&
    (control.hasAttribute("download") ||
      (control.target && control.target !== "_self") ||
      control.href === window.location.href ||
      !/^https?:$/.test(control.protocol))
  )
    return null;
  const explicit = control.getAttribute("data-sound");
  if (isSoundCue(explicit)) return explicit;
  if (control instanceof HTMLAnchorElement || control.hasAttribute("data-sidebar-item")) return "navigation";
  if (control instanceof HTMLInputElement) return null;
  if (control.tagName === "SUMMARY") return control.closest("details")?.open ? "close" : "open";
  if (control instanceof HTMLSelectElement) return "open";
  if (control.hasAttribute("aria-expanded")) return control.getAttribute("aria-expanded") === "true" ? "close" : "open";
  if (control.hasAttribute("aria-haspopup") && control.getAttribute("aria-haspopup") !== "false") return "open";
  if (control.matches('[role="tab"], [role="radio"], [role="option"]')) return "select";
  const checked = control.getAttribute("aria-checked") ?? control.getAttribute("aria-pressed");
  if (checked !== null) return checked === "true" ? "toggleOff" : "toggleOn";
  const icon = control.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "";
  return Object.hasOwn(ICON_CUES, icon) ? ICON_CUES[icon] : "interaction";
}

function modified(event: MouseEvent | KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

/** Plays action-specific feedback across public pages, the shell, and portaled controls. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState({ ...DEFAULT_AUDIO_PREFERENCES });
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
    try {
      apply(parseAudioPreferences(localStorage.getItem(AUDIO_STORAGE_KEY)), false);
    } catch {
      apply({ ...DEFAULT_AUDIO_PREFERENCES }, false);
    }
    const sync = (event: StorageEvent) => {
      if (event.key === AUDIO_STORAGE_KEY || event.key === null) apply(parseAudioPreferences(event.newValue), false);
    };
    const unlock = () => void siteAudio.unlock();
    let lastClick: MouseEvent | null = null;
    const key = (event: KeyboardEvent) => {
      unlock();
      if (event.repeat) return;
      if (event.key === "Escape") {
        queueMicrotask(() => {
          if (event.defaultPrevented) siteAudio.play("close");
        });
        return;
      }
      if (modified(event) || (event.key !== "Enter" && event.key !== " ")) return;
      const control = soundControl(event.target);
      if (!control || control.matches("button, a[href], input, select, summary")) return;
      const cue = clickCue(control);
      const previousClick = lastClick;
      queueMicrotask(() => {
        // Custom keyboard handlers may perform the action directly or dispatch their own click.
        if (event.defaultPrevented && lastClick === previousClick && cue) siteAudio.play(cue);
      });
    };
    const click = (event: MouseEvent) => {
      lastClick = event;
      if (event.button !== 0 || modified(event)) return;
      const control = soundControl(event.target);
      const cue = control && clickCue(control);
      if (cue) {
        unlock();
        siteAudio.play(cue);
      }
    };
    const change = (event: Event) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest('[data-sound="off"], [inert], [aria-hidden="true"]') ||
        target.matches(":disabled")
      )
        return;
      if (target instanceof HTMLSelectElement) siteAudio.play("select");
      if (target instanceof HTMLInputElement) {
        if (target.type === "checkbox") siteAudio.play(target.checked ? "toggleOn" : "toggleOff");
        if (target.type === "radio" && target.checked) siteAudio.play("select");
        if (target.type === "range") siteAudio.play("detent");
      }
    };
    const drag = (event: DragEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-sound="off"], [inert]'))
        siteAudio.play("drag");
    };
    const drop = (event: DragEvent) => {
      queueMicrotask(() => {
        if (
          event.defaultPrevented &&
          event.target instanceof Element &&
          !event.target.closest('[data-sound="off"], [inert]')
        )
          siteAudio.play("drop");
      });
    };
    const history = () => siteAudio.play("navigation");
    const visibility = () => {
      if (document.hidden) siteAudio.pause();
      else unlock();
    };
    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("keydown", key, true);
    document.addEventListener("click", click, true);
    document.addEventListener("change", change);
    document.addEventListener("dragstart", drag, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("popstate", history);
    window.addEventListener("storage", sync);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("change", change);
      document.removeEventListener("dragstart", drag, true);
      document.removeEventListener("drop", drop, true);
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
      void siteAudio.unlock();
      siteAudio.play(enabled ? "toggleOn" : "toggleOff");
    },
    [apply],
  );
  const previewVolume = useCallback(() => siteAudio.previewVolume(current.current.volume, current.current.volume), []);
  const value = useMemo(
    () => ({ preferences, setVolume, setCategory, previewVolume }),
    [preferences, setVolume, setCategory, previewVolume],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
