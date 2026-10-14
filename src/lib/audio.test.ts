// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUDIO_PREFERENCES,
  parseAudioPreferences,
  snapVolume,
  SoundEngine,
  type AudioPreferences,
  type SoundCategory,
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

const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 1;
  destination = {};
  oscillators: ReturnType<FakeAudioContext["createOscillator"]>[] = [];
  envelopes: ReturnType<FakeAudioContext["createGain"]>[] = [];
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    const node = {
      type: "sine",
      frequency: audioParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = { gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() };
    this.envelopes.push(node);
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

let engine: SoundEngine;
const audible: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES, volume: 40 };
beforeEach(() => {
  contexts.length = 0;
  vi.useFakeTimers();
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
    (raw) => {
      expect(parseAudioPreferences(raw)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    },
  );

  it("accepts supported fields, clamps volume, and ignores unknown properties", () => {
    expect(parseAudioPreferences('{"volume":156,"bot":false,"navigation":false,"surprise":true}')).toEqual({
      ...DEFAULT_AUDIO_PREFERENCES,
      volume: 100,
      bot: false,
      navigation: false,
    });
    expect(parseAudioPreferences('{"volume":-50}').volume).toBe(0);
    expect(parseAudioPreferences('{"volume":46}').volume).toBe(50);
  });

  it.each([
    [0, 0],
    [14, 10],
    [15, 20],
    [96, 100],
    [-1, 0],
    [Infinity, 0],
    [NaN, 0],
  ])("snaps %s to %s", (value, expected) => expect(snapVolume(value)).toBe(expected));
});

describe("gesture-gated sound synthesis", () => {
  it("does not create an audio context on load, playback before a gesture, or a muted gesture", async () => {
    engine.play("complete");
    expect(contexts).toHaveLength(0);
    engine.configure(DEFAULT_AUDIO_PREFERENCES);
    await engine.unlock();
    engine.previewVolume(0, 0);
    expect(contexts).toHaveLength(0);
  });

  it("uses one context and disconnects ended voices", async () => {
    await engine.unlock();
    await engine.unlock();
    engine.play("navigation");
    const context = contexts[0];
    expect(contexts).toHaveLength(1);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(660, 1.005);
    for (const [index, oscillator] of context.oscillators.entries()) {
      oscillator.onended?.();
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
      expect(context.envelopes[index].disconnect).toHaveBeenCalledOnce();
    }
  });

  it.each([
    ["navigation", "navigation"],
    ["interaction", "interaction"],
    ["bot", "thinking"],
    ["bot", "working"],
    ["complete", "complete"],
    ["failure", "failure"],
  ] satisfies [SoundCategory, SoundCue][])("gates %s independently for %s", async (category, cue) => {
    engine.configure({ ...audible, [category]: false });
    await engine.unlock();
    engine.play(cue);
    expect(contexts[0].oscillators).toHaveLength(0);
    engine.play(cue, true);
    expect(contexts[0].oscillators.length).toBeGreaterThan(0);
  });

  it("rate-limits rapid feedback without suppressing a different category", async () => {
    await engine.unlock();
    engine.play("interaction");
    engine.play("interaction");
    expect(contexts[0].oscillators).toHaveLength(2);
    engine.play("complete");
    expect(contexts[0].oscillators).toHaveLength(5);
  });

  it("mutes active voices and drops pending sounds", async () => {
    await engine.unlock();
    engine.play("complete");
    engine.configure({ ...audible, volume: 0 });
    for (const oscillator of contexts[0].oscillators) expect(oscillator.stop).toHaveBeenCalledTimes(2);
    engine.play("failure", true);
    expect(contexts[0].oscillators).toHaveLength(3);
  });

  it("stops a disabled category without muting completion", async () => {
    await engine.unlock();
    engine.play("thinking");
    engine.configure({ ...audible, bot: false });
    expect(contexts[0].oscillators[0].stop).toHaveBeenCalledTimes(2);
    engine.play("complete");
    expect(contexts[0].oscillators).toHaveLength(5);
  });

  it("does not play a queued notification after mute during resume", async () => {
    await engine.unlock();
    const context = contexts[0];
    context.state = "suspended";
    const ready = Promise.withResolvers<void>();
    context.resume.mockReturnValueOnce(ready.promise);
    const unlocking = engine.unlock();
    engine.play("complete");
    engine.configure({ ...audible, volume: 0 });
    context.state = "running";
    ready.resolve();
    await unlocking;
    await Promise.resolve();
    expect(context.oscillators).toHaveLength(0);
  });

  it("drops a pending bot pulse when its exchange aborts before audio resumes", async () => {
    await engine.unlock();
    const context = contexts[0];
    context.state = "suspended";
    const ready = Promise.withResolvers<void>();
    context.resume.mockReturnValueOnce(ready.promise);
    const unlocking = engine.unlock();
    const controller = new AbortController();
    engine.startAgent(controller.signal);
    controller.abort();
    context.state = "running";
    ready.resolve();
    await unlocking;
    await Promise.resolve();
    expect(context.oscillators).toHaveLength(0);
  });

  it("stays silent while hidden and never replays a missed notification", async () => {
    await engine.unlock();
    engine.play("working");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    engine.pause();
    engine.play("complete");
    expect(contexts[0].suspend).toHaveBeenCalledOnce();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await engine.unlock();
    expect(contexts[0].oscillators).toHaveLength(2);
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
    expect(contexts[0].oscillators).toHaveLength(0);
  });
});

describe("volume detent previews", () => {
  it.each([
    [0, 30, [10, 20, 30]],
    [80, 40, [70, 60, 50, 40]],
    [40, 40, [40]],
  ])("previews each mark from %s to %s at that mark's amplitude", async (from, to, marks) => {
    engine.configure({ ...audible, volume: to });
    engine.previewVolume(from, to);
    await Promise.resolve();
    const context = contexts[0];
    expect(context.oscillators).toHaveLength(marks.length);
    marks.forEach((volume, index) => {
      expect(context.oscillators[index].frequency.setValueAtTime.mock.calls[0][0]).toBe(440 + volume * 3);
      expect(context.envelopes[index].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(
        0.09 * (volume / 100) ** 1.5,
      );
    });
  });

  it("cancels obsolete previews during rapid changes and keeps the final landing", async () => {
    engine.configure({ ...audible, volume: 50 });
    engine.previewVolume(0, 50);
    engine.configure({ ...audible, volume: 60 });
    engine.previewVolume(50, 60);
    await Promise.resolve();
    expect(contexts[0].oscillators).toHaveLength(1);
    expect(contexts[0].oscillators[0].frequency.setValueAtTime.mock.calls[0][0]).toBe(620);
  });

  it("starts future preview envelopes at zero so cancellation cannot expose full gain", async () => {
    engine.configure({ ...audible, volume: 100 });
    engine.previewVolume(0, 100);
    await Promise.resolve();
    engine.configure({ ...audible, volume: 0 });
    for (const envelope of contexts[0].envelopes) expect(envelope.gain.value).toBe(0);
  });

  it("keeps the zero detent silent and cancels higher-volume tails", async () => {
    engine.previewVolume(0, 40);
    await Promise.resolve();
    const context = contexts[0];
    engine.configure({ ...audible, volume: 0 });
    engine.previewVolume(40, 0);
    await Promise.resolve();
    expect(context.oscillators).toHaveLength(4);
    for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenCalledTimes(2);
  });
});

describe("live agent audio", () => {
  it("pulses during thinking and tool work, stays quiet during text, and completes once", () => {
    const play = vi.spyOn(engine, "play");
    const phase = engine.startAgent(new AbortController().signal);
    expect(play).toHaveBeenLastCalledWith("thinking");
    vi.advanceTimersByTime(3600);
    expect(play).toHaveBeenCalledTimes(2);
    phase("working");
    expect(play).toHaveBeenLastCalledWith("working");
    phase("working");
    expect(play).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2800);
    expect(play).toHaveBeenCalledTimes(4);
    phase("responding");
    vi.advanceTimersByTime(20_000);
    expect(play).toHaveBeenCalledTimes(4);
    phase("complete");
    phase("complete");
    phase("idle");
    expect(play).toHaveBeenCalledTimes(5);
    expect(play).toHaveBeenLastCalledWith("complete");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("plays failure independently of bot noises", async () => {
    engine.configure({ ...audible, bot: false });
    await engine.unlock();
    const phase = engine.startAgent(new AbortController().signal);
    expect(contexts[0].oscillators).toHaveLength(0);
    phase("failure");
    expect(contexts[0].oscillators).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["abort", "replace", "dispose"])("stops without completion or failure on %s", (action) => {
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
