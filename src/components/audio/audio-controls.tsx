"use client";

import { useAudio } from "@/src/components/audio/audio-provider";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import type { SoundCategory, SoundCue } from "@/src/lib/audio";
import { useId, useRef, type CSSProperties } from "react";

const VOLUME_MARKS = Array.from({ length: 11 }, (_, index) => index * 10);
const CATEGORIES: { key: SoundCategory; label: string; description: string; cue: SoundCue }[] = [
  { key: "navigation", label: "Navigation", description: "Pages, tabs, and opening panels.", cue: "navigation" },
  {
    key: "interaction",
    label: "Interface actions",
    description: "Soft taps for buttons and selections.",
    cue: "interaction",
  },
  {
    key: "bot",
    label: "Bot noises",
    description: "Quiet pulses while the agent thinks or uses tools.",
    cue: "thinking",
  },
  { key: "complete", label: "Agent complete", description: "A rising chime when a reply is ready.", cue: "complete" },
  { key: "failure", label: "Agent failed", description: "A lower tone when a request fails.", cue: "failure" },
];

/** Shares the stepped, audible volume control between onboarding and Settings. */
export function AudioVolumeControl() {
  const { preferences, supported, setVolume, previewVolume } = useAudio();
  const id = useId();
  const changedDuringDrag = useRef(false);
  const volume = preferences.volume;

  return (
    <div data-sound="off" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-on-surface text-sm font-medium">
          Volume
        </label>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-muted text-xs tabular-nums">
            {volume === 0 ? "Muted" : `${volume}%`}
          </span>
          <Button
            variant="ghost"
            size="denseIcon"
            aria-label="Mute all sounds"
            title="Mute all sounds"
            disabled={volume === 0}
            onClick={() => setVolume(0)}
          >
            <Icon name={volume === 0 ? "volumeOff" : "volume"} size={18} />
          </Button>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={10}
        value={volume}
        aria-valuetext={volume === 0 ? "Muted, 0 percent" : `${volume} percent`}
        aria-describedby={`${id}-hint`}
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
      <p id={`${id}-hint`} className="text-muted mt-3 text-xs leading-relaxed">
        {supported
          ? "Each 10% step plays a preview. Set to 0% for silence."
          : "This browser can’t play sound effects. You can still save your preferences."}
      </p>
    </div>
  );
}

/** Presents independent sound categories with explicit, volume-controlled previews. */
export function AudioSettings() {
  const { preferences, supported, setCategory, preview } = useAudio();
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-sound="off"
      className="border-border-subtle flex flex-col gap-4 border-t pt-6"
    >
      <div className="space-y-1">
        <Heading as="h2" size="section" id={`${id}-title`}>
          Sound
        </Heading>
        <p className="text-muted text-xs">Soft electronic cues for your actions and the agent’s progress.</p>
      </div>
      <AudioVolumeControl />
      <fieldset className="border-border-subtle min-w-0 border-t">
        <legend className="sr-only">Sound categories</legend>
        {CATEGORIES.map(({ key, label, description, cue }) => (
          <div key={key} className="flex items-center gap-2 py-3">
            <label htmlFor={`${id}-${key}`} className="min-w-0 flex-1 cursor-pointer space-y-1">
              <span id={`${id}-${key}-label`} className="text-on-surface block text-sm font-medium">
                {label}
              </span>
              <span id={`${id}-${key}-hint`} className="text-muted block text-xs leading-relaxed">
                {description}
              </span>
            </label>
            <Button
              variant="ghost"
              size="denseIcon"
              aria-label={`Preview ${label.toLowerCase()}`}
              title={preferences.volume === 0 ? "Raise the volume to preview" : `Preview ${label.toLowerCase()}`}
              disabled={preferences.volume === 0 || !supported}
              onClick={() => preview(cue)}
            >
              <Icon name="play" size={16} />
            </Button>
            <Checkbox
              id={`${id}-${key}`}
              aria-labelledby={`${id}-${key}-label`}
              aria-describedby={`${id}-${key}-hint`}
              checked={preferences[key]}
              onChange={(event) => setCategory(key, event.target.checked)}
            />
          </div>
        ))}
      </fieldset>
      <p className="text-muted text-xs leading-relaxed">
        Saved in this browser. Sounds pause when you leave this tab. Preview buttons let you try a category without
        turning it on.
      </p>
    </section>
  );
}
