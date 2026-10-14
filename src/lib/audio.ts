/** Device-local sound preferences; zero volume keeps the site silent until the user opts in. */
export interface AudioPreferences {
  volume: number;
  navigation: boolean;
  interaction: boolean;
  bot: boolean;
  complete: boolean;
  failure: boolean;
}

export type SoundCategory = Exclude<keyof AudioPreferences, "volume">;
export type SoundCue = Exclude<SoundCategory, "bot"> | "thinking" | "working";
export type AgentAudioPhase = "thinking" | "working" | "responding" | "complete" | "failure" | "idle";

export const AUDIO_STORAGE_KEY = "reodite.audio";
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  volume: 0,
  navigation: true,
  interaction: true,
  bot: true,
  complete: true,
  failure: true,
};

/** Clamps volume to the slider's ten-percent detents. */
export function snapVolume(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value)) / 10) * 10 : 0;
}

/** Reads only supported, correctly typed preferences from untrusted browser storage. */
export function parseAudioPreferences(raw: string | null): AudioPreferences {
  const preferences = { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return preferences;
    const stored = value as Record<string, unknown>;
    if (typeof stored.volume === "number") preferences.volume = snapVolume(stored.volume);
    for (const key of ["navigation", "interaction", "bot", "complete", "failure"] as const) {
      if (typeof stored[key] === "boolean") preferences[key] = stored[key];
    }
  } catch {
    // Corrupt storage leaves sound off.
  }
  return preferences;
}

interface Tone {
  frequency: number;
  end?: number;
  delay?: number;
  duration: number;
  gain: number;
  wave?: OscillatorType;
}

// Rounded sine tones carry the melody; quiet triangle transients give taps their texture.
const PALETTE: Record<SoundCue, readonly Tone[]> = {
  navigation: [
    { frequency: 660, end: 880, duration: 0.09, gain: 0.085 },
    { frequency: 1320, delay: 0.035, duration: 0.1, gain: 0.025 },
  ],
  interaction: [
    { frequency: 520, end: 390, duration: 0.045, gain: 0.07 },
    { frequency: 1040, duration: 0.025, gain: 0.012, wave: "triangle" },
  ],
  thinking: [
    { frequency: 330, end: 350, duration: 0.11, gain: 0.025 },
    { frequency: 440, delay: 0.16, duration: 0.12, gain: 0.02 },
  ],
  working: [
    { frequency: 554, end: 622, duration: 0.06, gain: 0.03, wave: "triangle" },
    { frequency: 830, delay: 0.085, duration: 0.08, gain: 0.025 },
  ],
  complete: [
    { frequency: 660, duration: 0.16, gain: 0.08 },
    { frequency: 880, delay: 0.12, duration: 0.26, gain: 0.085 },
    { frequency: 1320, delay: 0.14, duration: 0.22, gain: 0.02 },
  ],
  failure: [
    { frequency: 440, end: 415, duration: 0.16, gain: 0.075 },
    { frequency: 330, delay: 0.15, duration: 0.22, gain: 0.07 },
  ],
};

function categoryFor(cue: SoundCue): SoundCategory {
  return cue === "thinking" || cue === "working" ? "bot" : cue;
}

interface Voice {
  oscillator: OscillatorNode;
  envelope: GainNode;
  category: SoundCategory | "preview";
}

/** Synthesizes short UI cues after a browser gesture, without downloaded audio or autoplay. */
export class SoundEngine {
  private context: AudioContext | null = null;
  private resuming: Promise<void> | null = null;
  private preferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private voices = new Set<Voice>();
  private lastPlayed = new Map<SoundCategory, number>();
  private revision = 0;
  private stopAgent: (() => void) | null = null;

  /** Applies mute and category changes to active and pending sounds immediately. */
  configure(preferences: AudioPreferences) {
    const volumeChanged = preferences.volume !== this.preferences.volume;
    this.preferences = { ...preferences };
    this.revision += 1;
    for (const voice of this.voices) {
      if (volumeChanged || (voice.category !== "preview" && !preferences[voice.category])) this.stopVoice(voice);
    }
  }

  /** Call from a user gesture. Unsupported or denied audio leaves the interface usable. */
  unlock(): Promise<void> {
    if (this.preferences.volume === 0 || typeof window === "undefined" || document.hidden) return Promise.resolve();
    try {
      if (!this.context || this.context.state === "closed") {
        if (!window.AudioContext) return Promise.resolve();
        this.context = new window.AudioContext();
      }
      if (this.context.state !== "running") {
        this.resuming = this.context.resume().catch(() => {});
        return this.resuming;
      }
    } catch {
      // Browsers can deny audio initialization even when they expose the API.
    }
    return Promise.resolve();
  }

  /** Plays one category-controlled cue. Explicit previews bypass only the category toggle. */
  play(cue: SoundCue, preview = false) {
    const context = this.context;
    if (!context) return;
    const revision = this.revision;
    const requestedAt = performance.now();
    const category = categoryFor(cue);
    const play = () => {
      if (
        context !== this.context ||
        context.state !== "running" ||
        revision !== this.revision ||
        performance.now() - requestedAt > 250 ||
        document.hidden ||
        this.preferences.volume === 0 ||
        (!preview && !this.preferences[category])
      )
        return;
      const now = performance.now();
      const cooldown = category === "bot" && !preview ? 1000 : 70;
      if (now - (this.lastPlayed.get(category) ?? -Infinity) < cooldown) return;
      this.lastPlayed.set(category, now);
      for (const tone of PALETTE[cue]) this.tone(tone, this.preferences.volume, category);
    };
    if (context.state === "running") play();
    else void this.resuming?.then(play);
  }

  /** Previews each crossed detent at its own volume; a landing repeats the current detent. Zero stays silent. */
  previewVolume(from: number, to: number) {
    this.stopCategory("preview");
    if (to === 0) return;
    const revision = this.revision;
    void this.unlock().then(() => {
      if (revision !== this.revision || this.preferences.volume !== to || document.hidden) return;
      const direction = to >= from ? 10 : -10;
      const marks: number[] = [];
      if (from === to) marks.push(to);
      else
        for (let mark = from + direction; direction > 0 ? mark <= to : mark >= to; mark += direction) marks.push(mark);
      for (const [index, volume] of marks.entries()) {
        this.tone(
          { frequency: 440 + volume * 3, end: 330 + volume * 3, delay: index * 0.032, duration: 0.065, gain: 0.09 },
          volume,
          "preview",
        );
      }
    });
  }

  /** Tracks one live exchange. Aborts, unmounts, and replacement exchanges stop without a notification. */
  startAgent(signal: AbortSignal): (phase: AgentAudioPhase) => void {
    this.stopAgent?.();
    let phase: AgentAudioPhase = "thinking";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = signal.aborted;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      this.stopCategory("bot");
      signal.removeEventListener("abort", stop);
      if (this.stopAgent === stop) this.stopAgent = null;
    };
    const pulse = () => {
      if (stopped || phase === "responding") return;
      this.play(phase === "working" ? "working" : "thinking");
      timer = setTimeout(pulse, phase === "working" ? 2800 : 3600);
    };
    if (!stopped) {
      this.stopAgent = stop;
      signal.addEventListener("abort", stop, { once: true });
      pulse();
    }
    return (next) => {
      if (stopped) return;
      if (next === "complete" || next === "failure" || next === "idle") {
        stop();
        if (next !== "idle") this.play(next);
      } else if (next !== phase) {
        phase = next;
        clearTimeout(timer);
        this.stopCategory("bot");
        pulse();
      }
    };
  }

  /** Drops queued sounds and suspends output while the page is hidden. */
  pause() {
    this.revision += 1;
    for (const voice of this.voices) this.stopVoice(voice);
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  /** Releases timers and audio nodes when the app provider unmounts. */
  dispose() {
    this.stopAgent?.();
    this.pause();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null;
    this.resuming = null;
    this.lastPlayed.clear();
  }

  private tone(tone: Tone, volume: number, category: Voice["category"]) {
    const context = this.context;
    if (context?.state !== "running" || volume === 0 || document.hidden) return;
    try {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      // Future notes remain silent if cancellation removes their scheduled attack.
      envelope.gain.value = 0;
      const start = context.currentTime + 0.005 + (tone.delay ?? 0);
      const end = start + tone.duration;
      const voice = { oscillator, envelope, category };
      oscillator.type = tone.wave ?? "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.end) oscillator.frequency.exponentialRampToValueAtTime(tone.end, end);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(tone.gain * (volume / 100) ** 1.5, start + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      envelope.gain.linearRampToValueAtTime(0, end + 0.01);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        this.voices.delete(voice);
      };
      this.voices.add(voice);
      oscillator.start(start);
      oscillator.stop(end + 0.015);
    } catch {
      // Audio failures must not interrupt navigation or a chat exchange.
    }
  }

  private stopVoice(voice: Voice) {
    const now = this.context?.currentTime ?? 0;
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setTargetAtTime(0, now, 0.003);
    voice.oscillator.stop(now + 0.015);
    this.voices.delete(voice);
  }

  private stopCategory(category: Voice["category"]) {
    this.revision += 1;
    for (const voice of this.voices) if (voice.category === category) this.stopVoice(voice);
  }
}

/** Shared by app-level interaction listeners and the live chat exchange. */
export const siteAudio = new SoundEngine();
