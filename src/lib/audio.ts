/** Browser-local sound preferences; zero volume keeps the site silent until the user opts in. */
export interface AudioPreferences {
  volume: number;
  navigation: boolean;
  bot: boolean;
}

export type SoundCategory = Exclude<keyof AudioPreferences, "volume">;
export type AgentAudioPhase =
  "thinking" | "working" | "toolComplete" | "toolFailure" | "responding" | "complete" | "failure" | "idle";

export const AUDIO_STORAGE_KEY = "reodite.audio";
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = { volume: 0, navigation: true, bot: true };

/** Clamps volume to the slider's ten-percent detents. */
export function snapVolume(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value)) / 10) * 10 : 0;
}

/** Validates stored preferences and preserves disabled categories when merging older settings. */
export function parseAudioPreferences(raw: string | null): AudioPreferences {
  const preferences = { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return preferences;
    const stored = value as Record<string, unknown>;
    if (typeof stored.volume === "number") preferences.volume = snapVolume(stored.volume);
    preferences.navigation = stored.navigation !== false && stored.interaction !== false;
    preferences.bot = stored.bot !== false && stored.complete !== false && stored.failure !== false;
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
  wave?: OscillatorType | "noise";
  fm?: number;
}

// A low resonant body and a filtered noise transient give controls a dry, mechanical contact.
function impact(frequency: number, duration = 0.055, gain = 0.12): Tone[] {
  return [
    { frequency, end: frequency * 0.45, duration, gain },
    { frequency: frequency * 7, duration: 0.012, gain: gain * 0.65, wave: "noise" },
    { frequency: frequency * 2.4, end: frequency, duration: duration * 0.4, gain: gain * 0.12, wave: "triangle" },
  ];
}

// Articulated, frequency-modulated syllables give the agent a small digital voice.
function robot(notes: number[], spacing = 0.052, gain = 0.065): Tone[] {
  return notes.map((frequency, index) => ({
    frequency,
    end: frequency * (index % 2 ? 0.68 : 1.24),
    delay: index * spacing,
    duration: spacing * 0.78,
    gain: gain * (index % 2 ? 0.8 : 1),
    wave: index % 3 === 1 ? "square" : "triangle",
    fm: index % 2 ? 0.65 : 1.1,
  }));
}

const BOT_PALETTE = {
  send: robot([420, 840, 630], 0.052),
  thinking: robot([390, 780, 520, 650], 0.045, 0.045),
  working: robot([740, 1110, 555, 925, 660, 990], 0.035, 0.047),
  toolComplete: robot([660, 990, 1320], 0.042, 0.052),
  toolFailure: robot([480, 320, 400, 240], 0.045, 0.05),
  responding: robot([930, 620], 0.04, 0.034),
  complete: [
    ...robot([520, 780, 1040, 1300], 0.062, 0.072),
    { frequency: 190, end: 95, delay: 0.19, duration: 0.08, gain: 0.055 },
  ],
  failure: robot([440, 330, 220, 275, 165], 0.058, 0.072),
};

const PALETTE = {
  hover: [
    { frequency: 2800, duration: 0.008, gain: 0.023, wave: "noise" },
    { frequency: 540, end: 400, duration: 0.018, gain: 0.023 },
  ],
  press: impact(180, 0.03, 0.075),
  interaction: impact(310, 0.046, 0.115),
  navigation: [...impact(350, 0.06, 0.12), { frequency: 740, end: 990, delay: 0.016, duration: 0.035, gain: 0.023 }],
  back: impact(210, 0.065, 0.13),
  select: impact(510, 0.038, 0.105),
  toggleOn: impact(440, 0.055, 0.14),
  toggleOff: impact(260, 0.043, 0.13),
  open: [...impact(280, 0.065, 0.12), { frequency: 600, end: 1900, duration: 0.055, gain: 0.035, wave: "noise" }],
  close: [...impact(205, 0.045, 0.11), { frequency: 1400, end: 450, duration: 0.035, gain: 0.035, wave: "noise" }],
  remove: impact(140, 0.085, 0.145),
  drag: impact(460, 0.035, 0.09),
  drop: impact(190, 0.075, 0.16),
  zoomIn: impact(640, 0.026, 0.075),
  zoomOut: impact(460, 0.026, 0.075),
  mapSelect: [...impact(330, 0.045, 0.11), { frequency: 920, end: 690, delay: 0.025, duration: 0.045, gain: 0.03 }],
  detent: impact(460, 0.025, 0.11),
  ...BOT_PALETTE,
} satisfies Record<string, Tone[]>;

export type SoundCue = keyof typeof PALETTE;

/** Recognizes explicit sound annotations without accepting arbitrary DOM strings. */
export function isSoundCue(value: string | null): value is SoundCue {
  return value !== null && Object.hasOwn(PALETTE, value);
}

function categoryFor(cue: SoundCue): SoundCategory {
  return Object.hasOwn(BOT_PALETTE, cue) ? "bot" : "navigation";
}

interface Voice {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  envelope: GainNode;
  category: SoundCategory | "preview";
}

/** Synthesizes tactile controls and robotic phrases after a browser gesture, without audio downloads. */
export class SoundEngine {
  private context: AudioContext | null = null;
  private output: DynamicsCompressorNode | null = null;
  private resuming: Promise<void> | null = null;
  private noise: AudioBuffer | null = null;
  private preferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private voices = new Set<Voice>();
  private lastPlayed = new Map<SoundCue, number>();
  private variations = new Map<SoundCue, number>();
  private revision = 0;
  private categoryRevision = { navigation: 0, bot: 0, preview: 0 };
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
        this.noise = null;
        this.output = this.context.createDynamicsCompressor();
        this.output.threshold.value = -12;
        this.output.knee.value = 6;
        this.output.ratio.value = 12;
        this.output.attack.value = 0.002;
        this.output.release.value = 0.06;
        this.output.connect(this.context.destination);
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

  /** Plays category-controlled feedback; repeated work phrases vary without overlapping one another. */
  play(cue: SoundCue) {
    const context = this.context;
    if (!context) return;
    const revision = this.revision;
    const category = categoryFor(cue);
    const categoryRevision = this.categoryRevision[category];
    const requestedAt = performance.now();
    const play = () => {
      if (
        context !== this.context ||
        context.state !== "running" ||
        revision !== this.revision ||
        categoryRevision !== this.categoryRevision[category] ||
        performance.now() - requestedAt > 250 ||
        document.hidden ||
        this.preferences.volume === 0 ||
        !this.preferences[category]
      )
        return;
      const now = performance.now();
      const repeating = cue === "thinking" || cue === "working";
      const cooldown = repeating ? 400 : cue === "hover" ? 100 : 45;
      if (now - (this.lastPlayed.get(cue) ?? -Infinity) < cooldown) return;
      this.lastPlayed.set(cue, now);
      if (category === "bot") this.stopCategory("bot");
      const variation = this.variations.get(cue) ?? 0;
      const pitch = repeating ? [1, 0.89, 1.12, 0.94][variation % 4] : 1;
      this.variations.set(cue, variation + 1);
      for (const tone of PALETTE[cue]) this.tone(tone, this.preferences.volume, category, pitch);
    };
    if (context.state === "running") play();
    else void this.resuming?.then(play);
  }

  /** Previews crossed detents at their own volume; selecting the current detent repeats it. Zero stays silent. */
  previewVolume(from: number, to: number) {
    this.stopCategory("preview");
    if (to === 0) return;
    const revision = this.revision;
    const categoryRevision = this.categoryRevision.preview;
    void this.unlock().then(() => {
      if (
        revision !== this.revision ||
        categoryRevision !== this.categoryRevision.preview ||
        this.preferences.volume !== to ||
        document.hidden
      )
        return;
      const direction = to >= from ? 10 : -10;
      const marks: number[] = [];
      if (from === to) marks.push(to);
      else
        for (let mark = from + direction; direction > 0 ? mark <= to : mark >= to; mark += direction) marks.push(mark);
      for (const [index, volume] of marks.entries()) {
        for (const tone of PALETTE.detent) {
          this.tone({ ...tone, delay: index * 0.032 }, volume, "preview", 0.8 + volume / 200);
        }
      }
    });
  }

  /** Follows one live exchange; aborts and replacement stop without a terminal notification. */
  startAgent(signal: AbortSignal): (phase: AgentAudioPhase) => void {
    this.stopAgent?.();
    let phase: "thinking" | "working" | "responding" = "thinking";
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
      this.play(phase);
      timer = setTimeout(pulse, phase === "working" ? 1100 : 1600);
    };
    if (!stopped) {
      this.stopAgent = stop;
      signal.addEventListener("abort", stop, { once: true });
      this.play("send");
      timer = setTimeout(pulse, 280);
    }
    return (next) => {
      if (stopped) return;
      if (next === "complete" || next === "failure" || next === "idle") {
        stop();
        if (next !== "idle") this.play(next);
      } else if (next === "toolComplete" || next === "toolFailure") {
        phase = "thinking";
        clearTimeout(timer);
        this.stopCategory("bot");
        this.play(next);
        timer = setTimeout(pulse, 800);
      } else if (next !== phase) {
        phase = next;
        clearTimeout(timer);
        this.stopCategory("bot");
        if (next === "responding") this.play("responding");
        else pulse();
      } else if (next === "working") {
        this.play("working");
      }
    };
  }

  /** Discards queued sounds and suspends output while the page is hidden. */
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
    this.output?.disconnect();
    this.output = null;
    this.context = null;
    this.resuming = null;
    this.noise = null;
    this.lastPlayed.clear();
    this.variations.clear();
  }

  private tone(tone: Tone, volume: number, category: Voice["category"], pitch = 1) {
    const context = this.context;
    if (context?.state !== "running" || !this.output || volume === 0 || document.hidden) return;
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    try {
      const envelope = context.createGain();
      nodes.push(envelope);
      // Future notes remain silent if cancellation removes their scheduled attack.
      envelope.gain.value = 0;
      const start = context.currentTime + 0.003 + (tone.delay ?? 0);
      const end = start + tone.duration;
      const frequency = tone.frequency * pitch;
      let source: OscillatorNode | AudioBufferSourceNode;
      if (tone.wave === "noise") {
        if (!this.noise) {
          this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.12), context.sampleRate);
          const samples = this.noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        source = context.createBufferSource();
        source.buffer = this.noise;
      } else {
        source = context.createOscillator();
        source.type = tone.wave ?? "sine";
        source.frequency.setValueAtTime(frequency, start);
        if (tone.end) source.frequency.exponentialRampToValueAtTime(tone.end * pitch, end);
        if (tone.fm) {
          const modulator = context.createOscillator();
          const depth = context.createGain();
          modulator.frequency.setValueAtTime(frequency * 0.67, start);
          depth.gain.value = frequency * tone.fm;
          modulator.connect(depth);
          depth.connect(source.frequency);
          sources.push(modulator);
          nodes.push(depth);
        }
      }
      sources.push(source);
      const filter = context.createBiquadFilter();
      nodes.push(filter);
      filter.type = tone.wave === "noise" ? "bandpass" : "lowpass";
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(tone.wave === "noise" ? frequency : tone.fm ? 2800 : 4000, start);
      if (tone.wave === "noise" && tone.end) filter.frequency.exponentialRampToValueAtTime(tone.end * pitch, end);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.output);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(tone.gain * (volume / 100) ** 1.5, start + 0.0015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      envelope.gain.linearRampToValueAtTime(0, end + 0.006);
      const voice = { sources, nodes, envelope, category };
      source.onended = () => {
        for (const node of [...sources, ...nodes]) node.disconnect();
        this.voices.delete(voice);
      };
      this.voices.add(voice);
      for (const node of sources) {
        node.start(start);
        node.stop(end + 0.01);
      }
    } catch {
      // Audio failures must not interrupt the user's action.
      for (const node of [...sources, ...nodes]) node.disconnect();
    }
  }

  private stopVoice(voice: Voice) {
    const now = this.context?.currentTime ?? 0;
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setTargetAtTime(0, now, 0.003);
    for (const source of voice.sources) source.stop(now + 0.012);
    this.voices.delete(voice);
  }

  private stopCategory(category: Voice["category"]) {
    this.categoryRevision[category] += 1;
    for (const voice of this.voices) if (voice.category === category) this.stopVoice(voice);
  }
}

/** Shared by app-level interaction listeners and the live chat exchange. */
export const siteAudio = new SoundEngine();
