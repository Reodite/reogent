// @vitest-environment happy-dom
import { AUDIO_STORAGE_KEY, DEFAULT_AUDIO_PREFERENCES, siteAudio } from "@/src/lib/audio";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSettings, AudioVolumeControl } from "./audio-controls";
import { AudioProvider } from "./audio-provider";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("AudioContext", class {});
  vi.spyOn(siteAudio, "configure").mockImplementation(() => {});
  vi.spyOn(siteAudio, "unlock").mockResolvedValue();
  vi.spyOn(siteAudio, "play").mockImplementation(() => {});
  vi.spyOn(siteAudio, "previewVolume").mockImplementation(() => {});
  vi.spyOn(siteAudio, "pause").mockImplementation(() => {});
  vi.spyOn(siteAudio, "dispose").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function settings() {
  return render(
    <AudioProvider>
      <AudioSettings />
    </AudioProvider>,
  );
}
function stored() {
  return JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY)!);
}

describe("audio controls and persistence", () => {
  it("starts muted with eleven visible detents and native ten-percent keyboard steps", () => {
    const { container } = settings();
    const slider = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(slider.value).toBe("0");
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("100");
    expect(slider.step).toBe("10");
    expect(slider.getAttribute("aria-valuetext")).toBe("Muted, 0 percent");
    expect(container.querySelectorAll("[data-volume-stop]")).toHaveLength(11);
    expect((screen.getByRole("button", { name: "Preview navigation" }) as HTMLButtonElement).disabled).toBe(true);
    expect(siteAudio.play).not.toHaveBeenCalled();
    expect(siteAudio.unlock).not.toHaveBeenCalled();
  });

  it("previews crossed values, avoids duplicate release clicks, and previews a same-mark landing", () => {
    settings();
    const slider = screen.getByRole("slider", { name: "Volume" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider);
    expect(siteAudio.previewVolume).toHaveBeenCalledExactlyOnceWith(0, 40);
    expect(stored().volume).toBe(40);
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    expect(siteAudio.previewVolume).toHaveBeenLastCalledWith(40, 40);
    expect(siteAudio.previewVolume).toHaveBeenCalledTimes(2);
    expect(siteAudio.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mute all sounds" }));
    expect(stored().volume).toBe(0);
    expect(siteAudio.previewVolume).toHaveBeenLastCalledWith(40, 0);
  });

  it("persists each category independently and previews a disabled category without enabling it", () => {
    settings();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "30" } });
    for (const name of ["Navigation", "Interface actions", "Bot noises", "Agent complete", "Agent failed"]) {
      const checkbox = screen.getByRole("checkbox", { name }) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(false);
    }
    expect(stored()).toEqual({
      volume: 30,
      navigation: false,
      interaction: false,
      bot: false,
      complete: false,
      failure: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview agent complete" }));
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("complete", true);
    expect(stored().complete).toBe(false);
  });

  it("shares onboarding preferences with Settings and restores them without playing on mount", () => {
    const onboarding = render(
      <AudioProvider>
        <AudioVolumeControl />
      </AudioProvider>,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
    onboarding.unmount();
    vi.mocked(siteAudio.previewVolume).mockClear();
    settings();
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("60");
    expect(siteAudio.configure).toHaveBeenLastCalledWith({ ...DEFAULT_AUDIO_PREFERENCES, volume: 60 });
    expect(siteAudio.previewVolume).not.toHaveBeenCalled();
    expect(siteAudio.play).not.toHaveBeenCalled();
  });

  it("applies storage changes and clearing from another tab without audio", () => {
    settings();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_STORAGE_KEY,
          newValue: JSON.stringify({ volume: 70, bot: false }),
        }),
      ),
    );
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("70");
    expect((screen.getByRole("checkbox", { name: "Bot noises" }) as HTMLInputElement).checked).toBe(false);
    expect(siteAudio.configure).toHaveBeenLastCalledWith({ ...DEFAULT_AUDIO_PREFERENCES, volume: 70, bot: false });
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("0");
    expect(siteAudio.previewVolume).not.toHaveBeenCalled();
  });

  it("keeps controls usable with corrupt or unwritable storage", () => {
    localStorage.setItem(AUDIO_STORAGE_KEY, "broken");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    settings();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } });
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("50");
    expect(siteAudio.configure).toHaveBeenLastCalledWith({ ...DEFAULT_AUDIO_PREFERENCES, volume: 50 });
  });

  it("explains unavailable audio without disabling preference changes", () => {
    vi.stubGlobal("AudioContext", undefined);
    settings();
    expect(screen.getByText(/This browser can’t play sound effects/)).toBeTruthy();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
    expect((screen.getByRole("button", { name: "Preview bot noises" }) as HTMLButtonElement).disabled).toBe(true);
    expect(stored().volume).toBe(40);
  });
});

describe("sitewide sound events", () => {
  it("covers native actions, navigation, tabs, panels, selections, and browser history", () => {
    render(
      <AudioProvider>
        <button type="button">Action</button>
        <button type="button" data-sidebar-item>
          Tool
        </button>
        <button type="button" role="tab" aria-selected="false">
          Tab
        </button>
        <button type="button" aria-expanded="false">
          Panel
        </button>
        <a href="/settings" onClick={(event) => event.preventDefault()}>
          Settings link
        </a>
        <label>
          <input type="checkbox" />
          Option
        </label>
        <label>
          Term
          <select defaultValue="winter">
            <option value="winter">Winter</option>
            <option value="summer">Summer</option>
          </select>
        </label>
      </AudioProvider>,
    );
    for (const name of ["Tool", "Tab", "Panel", "Settings link"]) {
      fireEvent.click(screen.getByText(name));
      expect(siteAudio.play).toHaveBeenLastCalledWith("navigation");
    }
    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    expect(siteAudio.play).toHaveBeenLastCalledWith("interaction");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(siteAudio.play).toHaveBeenLastCalledWith("interaction");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "summer" } });
    expect(siteAudio.play).toHaveBeenLastCalledWith("interaction");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(siteAudio.play).toHaveBeenLastCalledWith("navigation");
    expect(siteAudio.play).toHaveBeenCalledTimes(8);
  });

  it("ignores disabled, inert, opted-out, selected, modified, and typing interactions", () => {
    render(
      <AudioProvider>
        <button type="button" disabled>
          Disabled
        </button>
        <button type="button" aria-disabled="true">
          Disabled field
        </button>
        <div inert>
          <button type="button">Inert</button>
        </div>
        <div data-sound="off">
          <button type="button">Silent</button>
        </div>
        <button type="button" role="tab" aria-selected="true">
          Current tab
        </button>
        <a href="/tools" aria-current="page" onClick={(event) => event.preventDefault()}>
          Current page
        </a>
        <a href="/settings" onClick={(event) => event.preventDefault()}>
          Modified link
        </a>
        <a href="/settings" target="_blank" rel="noopener" onClick={(event) => event.preventDefault()}>
          New tab
        </a>
        <input aria-label="Message" />
      </AudioProvider>,
    );
    for (const name of ["Disabled", "Disabled field", "Inert", "Silent", "Current tab", "Current page", "New tab"]) {
      fireEvent.click(screen.getByText(name));
    }
    fireEvent.click(screen.getByText("Modified link"), { ctrlKey: true });
    const textbox = screen.getByRole("textbox");
    fireEvent.click(textbox);
    fireEvent.keyDown(textbox, { key: "a" });
    fireEvent.change(textbox, { target: { value: "a" } });
    expect(siteAudio.play).not.toHaveBeenCalled();
  });

  it("unlocks for keyboard activation and plays only its click once", () => {
    render(
      <AudioProvider>
        <button type="button">Action</button>
      </AudioProvider>,
    );
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Enter" });
    expect(siteAudio.unlock).toHaveBeenCalled();
    expect(siteAudio.play).not.toHaveBeenCalled();
    fireEvent.click(button, { detail: 0 });
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("interaction");
  });

  it("pauses hidden tabs and removes listeners during unmount and Strict Mode replay", () => {
    const view = render(
      <StrictMode>
        <AudioProvider>
          <button type="button">Action</button>
        </AudioProvider>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(siteAudio.play).toHaveBeenCalledOnce();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(siteAudio.pause).toHaveBeenCalledOnce();
    view.unmount();
    expect(siteAudio.dispose).toHaveBeenCalledTimes(2);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(siteAudio.play).toHaveBeenCalledOnce();
  });
});
