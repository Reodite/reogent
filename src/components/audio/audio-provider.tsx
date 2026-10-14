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
  const explicit = control.getAttribute("data-sound");
  if (isSoundCue(explicit)) return explicit;
  const icon = control.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "";
  if (Object.hasOwn(ICON_CUES, icon)) return ICON_CUES[icon];
  if (control instanceof HTMLAnchorElement) {
    if (control.download || (control.target && control.target !== "_self") || control.href === window.location.href)
      return null;
    return /^https?:$/.test(control.protocol) ? "navigation" : null;
  }
  if (control instanceof HTMLInputElement) return null;
  if (control.tagName === "SUMMARY") return control.closest("details")?.open ? "close" : "open";
  if (control instanceof HTMLSelectElement) return "open";
  if (control.hasAttribute("data-sidebar-item")) return "navigation";
  if (control.matches('[role="tab"], [role="radio"], [role="option"]')) return "select";
  if (control.hasAttribute("aria-expanded")) return control.getAttribute("aria-expanded") === "true" ? "close" : "open";
  if (control.hasAttribute("aria-haspopup")) return "open";
  const checked = control.getAttribute("aria-checked") ?? control.getAttribute("aria-pressed");
  if (checked !== null) return checked === "true" ? "toggleOff" : "toggleOn";
  return "interaction";
}

function modified(event: MouseEvent | KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

/** Installs gesture-gated tactile feedback for public pages, the shell, and portaled controls. */
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
    let keyboardFocus = false;
    const sync = (event: StorageEvent) => {
      if (event.key === AUDIO_STORAGE_KEY || event.key === null) apply(parseAudioPreferences(event.newValue), false);
    };
    const unlock = () => void siteAudio.unlock();
    const pointer = (event: PointerEvent) => {
      keyboardFocus = false;
      unlock();
      const control = soundControl(event.target);
      if (event.button === 0 && event.pointerType !== "touch" && !modified(event) && control && clickCue(control)) {
        siteAudio.play("press");
      }
    };
    const key = (event: KeyboardEvent) => {
      unlock();
      if (event.key === "Tab") keyboardFocus = true;
      if (event.key === "Escape") {
        queueMicrotask(() => {
          if (event.defaultPrevented) siteAudio.play("close");
        });
      }
      const control = soundControl(event.target);
      if (
        !event.repeat &&
        !modified(event) &&
        (event.key === "Enter" || event.key === " ") &&
        control &&
        clickCue(control)
      ) {
        siteAudio.play("press");
      }
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.buttons || modified(event)) return;
      const control = soundControl(event.target);
      if (control && !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget)))
        siteAudio.play("hover");
    };
    const focus = (event: FocusEvent) => {
      if (keyboardFocus && soundControl(event.target)) siteAudio.play("hover");
    };
    const click = (event: MouseEvent) => {
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
    const history = () => siteAudio.play("back");
    const visibility = () => {
      if (document.hidden) siteAudio.pause();
      else unlock();
    };
    document.addEventListener("pointerdown", pointer, { capture: true, passive: true });
    document.addEventListener("pointerover", hover, { capture: true, passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    document.addEventListener("click", click, true);
    document.addEventListener("change", change);
    document.addEventListener("dragstart", drag, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("popstate", history);
    window.addEventListener("storage", sync);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("pointerover", hover, true);
      document.removeEventListener("focusin", focus);
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
