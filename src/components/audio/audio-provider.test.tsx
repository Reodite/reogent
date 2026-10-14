// @vitest-environment happy-dom
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { AUDIO_STORAGE_KEY, DEFAULT_AUDIO_PREFERENCES, siteAudio } from "@/src/lib/audio";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSettings, AudioVolumeControl } from "./audio-controls";
import { AudioProvider } from "./audio-provider";

beforeEach(() => {
  localStorage.clear();
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

describe("simplified sound controls", () => {
  it("shows only the volume scale and two labeled switches", () => {
    const { container } = settings();
    const slider = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(slider.value).toBe("0");
    expect(slider.step).toBe("10");
    expect(slider.getAttribute("aria-valuetext")).toBe("Muted, 0 percent");
    expect(container.querySelectorAll("[data-volume-stop]")).toHaveLength(11);
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "Navigation" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Bot noises" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sound" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    fireEvent.change(slider, { target: { value: "30" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("30 percent");
    expect(screen.queryByText("30%")).toBeNull();
    expect(siteAudio.play).not.toHaveBeenCalled();
  });

  it("previews crossed values once and repeats a same-mark landing", () => {
    settings();
    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider);
    expect(siteAudio.previewVolume).toHaveBeenCalledExactlyOnceWith(0, 40);
    expect(stored().volume).toBe(40);
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    expect(siteAudio.previewVolume).toHaveBeenLastCalledWith(40, 40);
    expect(siteAudio.previewVolume).toHaveBeenCalledTimes(2);
    fireEvent.change(slider, { target: { value: "0" } });
    expect(stored().volume).toBe(0);
    expect(siteAudio.previewVolume).toHaveBeenLastCalledWith(40, 0);
    expect(siteAudio.play).not.toHaveBeenCalled();
  });

  it("stores only the two categories and acknowledges changes once", () => {
    settings();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
    const navigation = screen.getByRole("switch", { name: "Navigation" }) as HTMLInputElement;
    const bot = screen.getByRole("switch", { name: "Bot noises" }) as HTMLInputElement;
    fireEvent.click(navigation);
    fireEvent.click(bot);
    expect(navigation.checked).toBe(false);
    expect(bot.checked).toBe(false);
    expect(stored()).toEqual({ volume: 40, navigation: false, bot: false });
    expect(siteAudio.play).toHaveBeenCalledTimes(2);
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOff");
    fireEvent.click(navigation);
    expect(siteAudio.configure).toHaveBeenLastCalledWith({ volume: 40, navigation: true, bot: false });
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOn");
  });

  it("merges legacy preferences without re-enabling opted-out sounds", () => {
    localStorage.setItem(
      AUDIO_STORAGE_KEY,
      JSON.stringify({ volume: 60, navigation: true, interaction: false, bot: true, complete: false, failure: true }),
    );
    settings();
    expect((screen.getByRole("switch", { name: "Navigation" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch", { name: "Bot noises" }) as HTMLInputElement).checked).toBe(false);
    expect(siteAudio.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Bot noises" }));
    expect(stored()).toEqual({ volume: 60, navigation: false, bot: true });
  });

  it("shares onboarding volume with Settings without replaying sound on mount", () => {
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

  it("applies cross-tab preferences and storage clearing without sound", () => {
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
    expect((screen.getByRole("switch", { name: "Bot noises" }) as HTMLInputElement).checked).toBe(false);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("0");
    expect(siteAudio.previewVolume).not.toHaveBeenCalled();
  });

  it("keeps settings usable without browser audio or writable storage", () => {
    localStorage.setItem(AUDIO_STORAGE_KEY, "broken");
    vi.stubGlobal("AudioContext", undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    settings();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } });
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("50");
    expect(siteAudio.configure).toHaveBeenLastCalledWith({ ...DEFAULT_AUDIO_PREFERENCES, volume: 50 });
  });
});

describe("sitewide tactile feedback", () => {
  it("distinguishes navigation, tabs, opening, closing, native selection, and history", () => {
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
          Open panel
        </button>
        <button type="button" aria-expanded="true">
          Close panel
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
    for (const [name, cue] of [
      ["Tool", "navigation"],
      ["Tab", "select"],
      ["Open panel", "open"],
      ["Close panel", "close"],
      ["Settings link", "navigation"],
      ["Action", "interaction"],
    ]) {
      fireEvent.click(screen.getByText(name));
      expect(siteAudio.play).toHaveBeenLastCalledWith(cue);
    }
    fireEvent.click(screen.getByRole("checkbox"));
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOn");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOff");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "summer" } });
    expect(siteAudio.play).toHaveBeenLastCalledWith("select");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(siteAudio.play).toHaveBeenLastCalledWith("navigation");
  });

  it("uses shared icons and explicit annotations for back, dismissal, zoom, and deletion", () => {
    render(
      <AudioProvider>
        <Button aria-label="Back">
          <Icon name="arrowLeft" />
        </Button>
        <Button aria-label="Dismiss">
          <Icon name="close" />
        </Button>
        <Button aria-label="Zoom in">
          <Icon name="zoomIn" />
        </Button>
        <Button aria-label="Zoom out">
          <Icon name="zoomOut" />
        </Button>
        <Button variant="danger">Delete</Button>
        <Button data-sound="drop">Place</Button>
        <Button data-sound="constructor">Unknown</Button>
        <Button>
          <svg data-icon="constructor" aria-hidden="true" />
          Unmapped icon
        </Button>
      </AudioProvider>,
    );
    for (const [name, cue] of [
      ["Back", "back"],
      ["Dismiss", "close"],
      ["Zoom in", "zoomIn"],
      ["Zoom out", "zoomOut"],
      ["Delete", "remove"],
      ["Place", "drop"],
      ["Unknown", "interaction"],
      ["Unmapped icon", "interaction"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(siteAudio.play).toHaveBeenLastCalledWith(cue);
    }
  });

  it("keeps hover, focus, and uncommitted presses silent and plays only the action", () => {
    render(
      <AudioProvider>
        <Button>
          <span>Action</span>
        </Button>
      </AudioProvider>,
    );
    const button = screen.getByRole("button");
    const child = screen.getByText("Action");
    fireEvent.pointerOver(button, { pointerType: "mouse" });
    fireEvent.pointerOver(child, { pointerType: "mouse", relatedTarget: button });
    fireEvent.pointerDown(button, { pointerType: "mouse", button: 0 });
    fireEvent.pointerCancel(button);
    fireEvent.keyDown(button, { key: "Tab" });
    fireEvent.focusIn(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(siteAudio.play).not.toHaveBeenCalled();
    expect(siteAudio.unlock).toHaveBeenCalled();
    fireEvent.click(button);
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("interaction");
  });

  it("uses disclosure and toggle state before decorative icons", () => {
    const { rerender } = render(
      <AudioProvider>
        <Button aria-expanded={false}>
          <Icon name="close" />
          Panel
        </Button>
        <Button aria-pressed={false}>
          <Icon name="zoomIn" />
          Toggle
        </Button>
      </AudioProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Panel" }));
    expect(siteAudio.play).toHaveBeenLastCalledWith("open");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOn");
    rerender(
      <AudioProvider>
        <Button aria-expanded>
          <Icon name="close" />
          Panel
        </Button>
        <Button aria-pressed>
          <Icon name="zoomIn" />
          Toggle
        </Button>
      </AudioProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Panel" }));
    expect(siteAudio.play).toHaveBeenLastCalledWith("close");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(siteAudio.play).toHaveBeenLastCalledWith("toggleOff");
    expect(siteAudio.play).toHaveBeenCalledTimes(4);
  });

  it("gives page links their navigation cue regardless of their icon", () => {
    render(
      <AudioProvider>
        <a href="/settings" onClick={(event) => event.preventDefault()}>
          <Icon name="arrowLeft" />
          Settings
        </a>
        <a href="/settings" target="_blank" rel="noopener" onClick={(event) => event.preventDefault()}>
          <Icon name="arrowLeft" />
          New tab
        </a>
        <a href="/settings" download onClick={(event) => event.preventDefault()}>
          <Icon name="arrowLeft" />
          Download
        </a>
        <a href={window.location.href} onClick={(event) => event.preventDefault()}>
          <Icon name="arrowLeft" />
          Current page
        </a>
      </AudioProvider>,
    );
    for (const name of ["New tab", "Download", "Current page"]) fireEvent.click(screen.getByRole("link", { name }));
    expect(siteAudio.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("navigation");
  });

  it("plays custom keyboard actions once, including controls that synthesize a click", async () => {
    render(
      <AudioProvider>
        {/* biome-ignore lint/a11y/useSemanticElements: Exercises non-native keyboard activation used by canvas widgets. */}
        <div role="button" tabIndex={0} aria-expanded={false} onKeyDown={(event) => event.preventDefault()}>
          Open widget
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: Exercises custom controls that dispatch their own click. */}
        <div
          role="button"
          tabIndex={0}
          data-sound="navigation"
          onKeyDown={(event) => {
            event.preventDefault();
            event.currentTarget.click();
          }}
        >
          Navigate
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: Verifies that unhandled custom-control keys stay silent. */}
        <div role="button" tabIndex={0}>
          Unhandled key
        </div>
      </AudioProvider>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Open widget" }), { key: "Enter" });
    await act(async () => {});
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("open");
    fireEvent.keyDown(screen.getByRole("button", { name: "Navigate" }), { key: " " });
    await act(async () => {});
    expect(vi.mocked(siteAudio.play).mock.calls).toEqual([["open"], ["navigation"]]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Unhandled key" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Open widget" }), { key: "Enter", repeat: true });
    await act(async () => {});
    expect(siteAudio.play).toHaveBeenCalledTimes(2);
  });

  it("does not make touch-hover or touch-scroll contact noises", () => {
    render(
      <AudioProvider>
        <Button>Action</Button>
      </AudioProvider>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button, { pointerType: "touch" });
    fireEvent.pointerDown(button, { pointerType: "touch", button: 0 });
    expect(siteAudio.play).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(siteAudio.play).toHaveBeenCalledExactlyOnceWith("interaction");
  });

  it("acknowledges consumed Escape and accepted native drops", async () => {
    render(
      <AudioProvider>
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key === "Escape") event.preventDefault();
          }}
        >
          Popup
        </button>
        <button type="button" draggable onDrop={(event) => event.preventDefault()}>
          Drop zone
        </button>
      </AudioProvider>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Popup" }), { key: "Escape" });
    await act(async () => {});
    expect(siteAudio.play).toHaveBeenLastCalledWith("close");
    fireEvent.dragStart(screen.getByText("Drop zone"));
    expect(siteAudio.play).toHaveBeenLastCalledWith("drag");
    fireEvent.drop(screen.getByText("Drop zone"));
    await act(async () => {});
    expect(siteAudio.play).toHaveBeenLastCalledWith("drop");
  });

  it("ignores disabled, inert, silent, selected, modified, and typing interactions", () => {
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
    for (const name of ["Disabled", "Disabled field", "Inert", "Silent", "Current tab", "Current page", "New tab"])
      fireEvent.click(screen.getByText(name));
    fireEvent.click(screen.getByText("Modified link"), { ctrlKey: true });
    const textbox = screen.getByRole("textbox");
    fireEvent.click(textbox);
    fireEvent.keyDown(textbox, { key: "a" });
    fireEvent.change(textbox, { target: { value: "a" } });
    expect(siteAudio.play).not.toHaveBeenCalled();
  });

  it("pauses hidden tabs and removes listeners across unmount and Strict Mode replay", () => {
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
