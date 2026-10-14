// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUDIO_PREFERENCES,
  isSoundCue,
  parseAudioPreferences,
  snapVolume,
  SoundEngine,
  type AudioPreferences,
  type SoundCue,
} from "./audio";

function audioParam() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}
function audioNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}
function sourceNode() {
  return { ...audioNode(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
}

const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 1;
  sampleRate = 48000;
  destination = {};
  sources: ReturnType<typeof sourceNode>[] = [];
  oscillators: ReturnType<FakeAudioContext["createOscillator"]>[] = [];
  envelopes: ReturnType<FakeAudioContext["createGain"]>[] = [];
  filters: ReturnType<FakeAudioContext["createBiquadFilter"]>[] = [];
  output = {
    ...audioNode(),
    threshold: audioParam(),
    knee: audioParam(),
    ratio: audioParam(),
    attack: audioParam(),
    release: audioParam(),
  };
  createDynamicsCompressor() {
    return this.output;
  }
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    const node = { ...sourceNode(), type: "sine", frequency: audioParam() };
    this.sources.push(node);
    this.oscillators.push(node);
    return node;
  }
  createBufferSource() {
    const node = { ...sourceNode(), buffer: null as AudioBuffer | null };
    this.sources.push(node);
    return node;
  }
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => {
    const samples = new Float32Array(length);
    return { length, sampleRate, getChannelData: () => samples };
  });
  createGain() {
    const node = { ...audioNode(), gain: audioParam() };
    this.envelopes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = { ...audioNode(), type: "lowpass", frequency: audioParam(), Q: audioParam() };
    this.filters.push(node);
    return node;
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
}

const interfaceCues: SoundCue[] = [
  "hover",
  "press",
  "interaction",
  "navigation",
  "back",
  "select",
  "toggleOn",
  "toggleOff",
  "open",
  "close",
  "remove",
  "drag",
  "drop",
  "zoomIn",
  "zoomOut",
  "mapSelect",
  "detent",
];
const botCues: SoundCue[] = [
  "send",
  "thinking",
  "working",
  "toolComplete",
  "toolFailure",
  "responding",
  "complete",
  "failure",
];
let engine: SoundEngine;
const audible: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES, volume: 40 };
beforeEach(() => {
  contexts.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  engine = new SoundEngine();
  engine.configure(audible);
});
afterEach(() => {
  engine.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audio preferences", () => {
  it.each([null, "bad json", "null", "[]", "4", '{"volume":"100","bot":0}'])(
    "defaults to silence for invalid storage %s",
    (raw) => expect(parseAudioPreferences(raw)).toEqual(DEFAULT_AUDIO_PREFERENCES),
  );

  it("keeps only volume and the two supported categories", () => {
    expect(parseAudioPreferences('{"volume":156,"bot":false,"navigation":false,"surprise":true}')).toEqual({
      volume: 100,
      bot: false,
      navigation: false,
    });
    expect(parseAudioPreferences('{"volume":-50}').volume).toBe(0);
    expect(parseAudioPreferences('{"volume":46}').volume).toBe(50);
  });

  it.each([
    ["navigation", "navigation"],
    ["interaction", "navigation"],
    ["bot", "bot"],
    ["complete", "bot"],
    ["failure", "bot"],
  ])("preserves a disabled legacy %s setting in %s", (old, merged) => {
    expect(parseAudioPreferences(JSON.stringify({ volume: 40, [old]: false }))).toEqual({
      ...audible,
      [merged]: false,
    });
  });

  it.each([
    [14, 10],
    [15, 20],
    [96, 100],
    [-1, 0],
    [Infinity, 0],
    [NaN, 0],
  ])("snaps %s to %s", (value, expected) => expect(snapVolume(value)).toBe(expected));

  it("accepts only known sound annotations", () => {
    for (const cue of [...interfaceCues, ...botCues]) expect(isSoundCue(cue)).toBe(true);
    for (const cue of [null, "off", "constructor", "unknown"]) expect(isSoundCue(cue)).toBe(false);
  });
});

describe("tactile and robotic synthesis", () => {
  it("does not initialize audio on load, playback before a gesture, or muted gestures", async () => {
    engine.play("complete");
    expect(contexts).toHaveLength(0);
    engine.configure(DEFAULT_AUDIO_PREFERENCES);
    await engine.unlock();
    engine.previewVolume(0, 0);
    expect(contexts).toHaveLength(0);
  });

  it.each(interfaceCues)("gates %s under Navigation", async (cue) => {
    engine.configure({ ...audible, navigation: false });
    await engine.unlock();
    engine.play(cue);
    expect(contexts[0].sources).toHaveLength(0);
    engine.configure(audible);
    engine.play(cue);
    expect(contexts[0].sources.length).toBeGreaterThan(0);
  });

  it.each(botCues)("gates %s under Bot noises", async (cue) => {
    engine.configure({ ...audible, bot: false });
    await engine.unlock();
    engine.play(cue);
    expect(contexts[0].sources).toHaveLength(0);
    engine.configure({ ...audible, navigation: false });
    engine.play(cue);
    expect(contexts[0].sources.length).toBeGreaterThan(0);
  });

  it("layers a pitched contact with reusable filtered noise and disconnects ended nodes", async () => {
    await engine.unlock();
    await engine.unlock();
    engine.play("interaction");
    const context = contexts[0];
    expect(contexts).toHaveLength(1);
    expect(context.sources).toHaveLength(3);
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(310, 1.003);
    expect(context.filters.map((filter) => filter.type)).toEqual(["lowpass", "bandpass", "lowpass"]);
    expect(context.createBuffer).toHaveBeenCalledOnce();
    engine.play("select");
    expect(context.createBuffer).toHaveBeenCalledOnce();
    for (const source of context.sources) source.onended?.();
    for (const node of [...context.sources, ...context.filters, ...context.envelopes])
      expect(node.disconnect).toHaveBeenCalledOnce();
  });

  it("routes voices through a shared peak limiter without compressing ordinary contacts", async () => {
    await engine.unlock();
    engine.play("navigation");
    const context = contexts[0];
    expect(context.output.threshold.value).toBe(-12);
    expect(context.output.ratio.value).toBe(12);
    expect(context.output.connect).toHaveBeenCalledExactlyOnceWith(context.destination);
    for (const envelope of context.envelopes) expect(envelope.connect).toHaveBeenCalledWith(context.output);
  });

  it("uses short modulated syllables for the bot and varies repeated work", async () => {
    await engine.unlock();
    engine.play("thinking");
    const context = contexts[0];
    expect(context.oscillators).toHaveLength(8);
    expect(context.oscillators.some((node) => node.type === "square")).toBe(true);
    expect(context.envelopes.some((node) => node.gain.value > 1)).toBe(true);
    const first = context.oscillators[0].frequency.setValueAtTime.mock.calls[0][0];
    vi.advanceTimersByTime(1600);
    engine.play("thinking");
    expect(context.oscillators[8].frequency.setValueAtTime.mock.calls[0][0]).not.toBe(first);
    for (const source of context.sources) source.onended?.();
    for (const node of [...context.sources, ...context.filters, ...context.envelopes])
      expect(node.disconnect).toHaveBeenCalledOnce();
  });

  it("rate-limits repeats without swallowing the release after a press or a terminal cue", async () => {
    await engine.unlock();
    engine.play("press");
    engine.play("press");
    expect(contexts[0].sources).toHaveLength(3);
    engine.play("interaction");
    expect(contexts[0].sources).toHaveLength(6);
    engine.play("complete");
    expect(contexts[0].sources).toHaveLength(15);
  });

  it("mutes active contacts, noise, and modulators together", async () => {
    await engine.unlock();
    engine.play("interaction");
    engine.play("complete");
    engine.configure({ ...audible, volume: 0 });
    const count = contexts[0].sources.length;
    for (const source of contexts[0].sources) expect(source.stop).toHaveBeenCalledTimes(2);
    engine.play("failure");
    expect(contexts[0].sources).toHaveLength(count);
  });

  it("stops Bot noises without stopping Navigation", async () => {
    await engine.unlock();
    engine.play("thinking");
    const bot = [...contexts[0].sources];
    engine.play("navigation");
    engine.configure({ ...audible, bot: false });
    for (const source of bot) expect(source.stop).toHaveBeenCalledTimes(2);
    expect(contexts[0].sources.at(-1)?.stop).toHaveBeenCalledOnce();
    const count = contexts[0].sources.length;
    engine.play("complete");
    engine.play("failure");
    expect(contexts[0].sources).toHaveLength(count);
  });

  it.each(["mute", "abort"])("drops pending agent sounds on %s before audio resumes", async (action) => {
    await engine.unlock();
    const context = contexts[0];
    context.state = "suspended";
    const ready = Promise.withResolvers<void>();
    context.resume.mockReturnValueOnce(ready.promise);
    const unlocking = engine.unlock();
    const controller = new AbortController();
    engine.startAgent(controller.signal);
    if (action === "mute") engine.configure({ ...audible, volume: 0 });
    else controller.abort();
    context.state = "running";
    ready.resolve();
    await unlocking;
    await Promise.resolve();
    expect(context.sources).toHaveLength(0);
  });

  it("preserves pending interface feedback when the bot changes phase during resume", async () => {
    await engine.unlock();
    const context = contexts[0];
    context.state = "suspended";
    const ready = Promise.withResolvers<void>();
    context.resume.mockReturnValueOnce(ready.promise);
    const unlocking = engine.unlock();
    engine.play("navigation");
    const phase = engine.startAgent(new AbortController().signal);
    phase("working");
    context.state = "running";
    ready.resolve();
    await unlocking;
    await Promise.resolve();
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(350, 1.003);
    expect(context.oscillators.some((node) => node.type === "square")).toBe(true);
  });

  it("stays silent while hidden and does not replay missed notifications", async () => {
    await engine.unlock();
    engine.play("working");
    const count = contexts[0].sources.length;
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    engine.pause();
    engine.play("complete");
    expect(contexts[0].suspend).toHaveBeenCalledOnce();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await engine.unlock();
    expect(contexts[0].sources).toHaveLength(count);
  });

  it("tolerates unsupported, denied, and interrupted audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    await expect(engine.unlock()).resolves.toBeUndefined();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("denied");
        }
      },
    );
    await expect(engine.unlock()).resolves.toBeUndefined();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    await engine.unlock();
    contexts[0].state = "suspended";
    contexts[0].resume.mockRejectedValueOnce(new Error("denied"));
    await expect(engine.unlock()).resolves.toBeUndefined();
    engine.play("complete");
    await Promise.resolve();
    expect(contexts[0].sources).toHaveLength(0);
  });
});

describe("volume detent previews", () => {
  it.each([
    [0, 30, [10, 20, 30]],
    [80, 40, [70, 60, 50, 40]],
    [40, 40, [40]],
  ])("previews marks from %s to %s at their own amplitude", async (from, to, marks) => {
    engine.configure({ ...audible, volume: to as number, navigation: false });
    engine.previewVolume(from as number, to as number);
    await Promise.resolve();
    const context = contexts[0];
    expect(context.sources).toHaveLength((marks as number[]).length * 3);
    (marks as number[]).forEach((volume, index) => {
      expect(context.envelopes[index * 3].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(
        0.11 * (volume / 100) ** 1.5,
      );
      expect(context.oscillators[index * 2].frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(
        460 * (0.8 + volume / 200),
      );
    });
  });

  it("cancels obsolete previews during rapid changes and keeps the final detent", async () => {
    engine.configure({ ...audible, volume: 50 });
    engine.previewVolume(0, 50);
    engine.configure({ ...audible, volume: 60 });
    engine.previewVolume(50, 60);
    await Promise.resolve();
    expect(contexts[0].sources).toHaveLength(3);
  });

  it("starts future envelopes at zero so cancellation cannot expose full gain", async () => {
    engine.configure({ ...audible, volume: 100 });
    engine.previewVolume(0, 100);
    await Promise.resolve();
    engine.configure({ ...audible, volume: 0 });
    for (const envelope of contexts[0].envelopes) expect(envelope.gain.value).toBe(0);
    for (const source of contexts[0].sources) expect(source.stop).toHaveBeenCalledTimes(2);
  });

  it("keeps zero silent and cancels higher-volume tails", async () => {
    engine.previewVolume(0, 40);
    await Promise.resolve();
    const context = contexts[0];
    engine.configure({ ...audible, volume: 0 });
    engine.previewVolume(40, 0);
    await Promise.resolve();
    expect(context.sources).toHaveLength(12);
    for (const source of context.sources) expect(source.stop).toHaveBeenCalledTimes(2);
  });
});

describe("live agent audio", () => {
  it("voices send, thinking, tools, and response transitions without chattering over streamed text", () => {
    const play = vi.spyOn(engine, "play");
    const phase = engine.startAgent(new AbortController().signal);
    expect(play).toHaveBeenLastCalledWith("send");
    vi.advanceTimersByTime(280);
    expect(play).toHaveBeenLastCalledWith("thinking");
    vi.advanceTimersByTime(1600);
    expect(play).toHaveBeenCalledTimes(3);
    phase("working");
    expect(play).toHaveBeenLastCalledWith("working");
    vi.advanceTimersByTime(1100);
    expect(play).toHaveBeenCalledTimes(5);
    phase("toolComplete");
    expect(play).toHaveBeenLastCalledWith("toolComplete");
    phase("responding");
    expect(play).toHaveBeenLastCalledWith("responding");
    phase("responding");
    vi.advanceTimersByTime(20_000);
    expect(play).toHaveBeenCalledTimes(7);
    phase("complete");
    phase("complete");
    phase("idle");
    expect(play).toHaveBeenCalledTimes(8);
    expect(play).toHaveBeenLastCalledWith("complete");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("distinguishes a failed tool from a failed exchange and resumes thinking", () => {
    const play = vi.spyOn(engine, "play");
    const phase = engine.startAgent(new AbortController().signal);
    phase("working");
    phase("toolFailure");
    expect(play).toHaveBeenLastCalledWith("toolFailure");
    vi.advanceTimersByTime(800);
    expect(play).toHaveBeenLastCalledWith("thinking");
    phase("failure");
    expect(play).toHaveBeenLastCalledWith("failure");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["abort", "replace", "dispose"])("cancels without a terminal notification on %s", (action) => {
    const play = vi.spyOn(engine, "play");
    const controller = new AbortController();
    const phase = engine.startAgent(controller.signal);
    if (action === "abort") controller.abort();
    if (action === "replace") engine.startAgent(new AbortController().signal)("idle");
    if (action === "dispose") engine.dispose();
    phase("failure");
    phase("complete");
    vi.advanceTimersByTime(20_000);
    expect(play).not.toHaveBeenCalledWith("failure");
    expect(play).not.toHaveBeenCalledWith("complete");
    expect(vi.getTimerCount()).toBe(0);
  });
});
