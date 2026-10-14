"use client";

import { useAudio } from "@/src/components/audio/audio-provider";
import { useId, useRef, type CSSProperties } from "react";

const VOLUME_MARKS = Array.from({ length: 11 }, (_, index) => index * 10);

/** Shares the stepped, audible volume control between onboarding and Settings. */
export function AudioVolumeControl() {
  const { preferences, setVolume, previewVolume } = useAudio();
  const id = useId();
  const changedDuringDrag = useRef(false);
  const volume = preferences.volume;

  return (
    <div data-sound="off" className="min-w-0">
      <label htmlFor={id} className="text-on-surface text-sm font-medium">
        Volume
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={10}
        value={volume}
        aria-valuetext={volume === 0 ? "Muted, 0 percent" : `${volume} percent`}
        className="audio-volume-slider"
        style={{ "--audio-volume": `${volume}%` } as CSSProperties}
        onPointerDown={() => {
          changedDuringDrag.current = false;
        }}
        onChange={(event) => {
          changedDuringDrag.current = true;
          setVolume(Number(event.target.value));
        }}
        onPointerUp={() => {
          if (!changedDuringDrag.current) previewVolume();
        }}
      />
      <div aria-hidden="true" className="mx-3 flex justify-between">
        {VOLUME_MARKS.map((mark) => (
          <span
            key={mark}
            data-volume-stop={mark}
            className={`w-px ${mark % 50 === 0 ? "h-2" : "h-1.5"} ${mark <= volume && volume > 0 ? "bg-primary" : "bg-outline"}`}
          />
        ))}
      </div>
      <div aria-hidden="true" className="text-muted mt-1 flex justify-between text-xs tabular-nums">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/** Groups interface feedback and agent sounds behind two native switches. */
export function AudioSettings() {
  const { preferences, setCategory } = useAudio();
  const id = useId();
  return (
    <section aria-label="Sound" data-sound="off" className="border-border-subtle flex flex-col gap-4 border-t pt-6">
      <AudioVolumeControl />
      <div>
        {(
          [
            ["navigation", "Navigation"],
            ["bot", "Bot noises"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span id={`${id}-${key}`} className="text-on-surface text-sm font-medium">
              {label}
            </span>
            <span className="relative flex h-9 w-11 shrink-0 items-center">
              <input
                type="checkbox"
                role="switch"
                aria-checked={preferences[key]}
                aria-labelledby={`${id}-${key}`}
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                checked={preferences[key]}
                onChange={(event) => setCategory(key, event.target.checked)}
              />
              <span
                aria-hidden="true"
                className="bg-surface-container-high peer-checked:bg-primary peer-focus-visible:outline-primary peer-checked:[&>span]:bg-on-primary flex h-6 w-11 items-center rounded-full p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-50 peer-checked:[&>span]:translate-x-5"
              >
                <span className="bg-on-surface-variant size-5 rounded-full transition-transform duration-150" />
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
