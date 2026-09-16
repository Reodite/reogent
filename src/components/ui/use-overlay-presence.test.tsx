// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverlayPresence } from "./use-overlay-presence";

const state = vi.hoisted(() => ({ present: true, reduce: false, remove: vi.fn(), animate: vi.fn() }));
vi.mock("motion/react", () => ({
  usePresence: () => [state.present, state.remove],
  useReducedMotion: () => state.reduce,
}));
vi.mock("motion/mini", () => ({ animate: state.animate }));

function control() {
  let complete = () => {};
  const finished = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return Object.assign(finished, { stop: vi.fn(), complete: () => complete() });
}

function Fixture({ ready = true, kind = "popover" }: { ready?: boolean; kind?: "popover" | "dialog" | "fade" }) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useOverlayPresence(ref, kind, ready);
  return <div ref={ref} data-testid="overlay" data-present={present} />;
}

afterEach(() => {
  cleanup();
  state.present = true;
  state.reduce = false;
  state.animate.mockReset();
  state.remove.mockReset();
});

describe("overlay presence", () => {
  it("enters from a cross-realm-safe element list and waits for exit completion", async () => {
    const entry = control();
    const exit = control();
    state.animate.mockReturnValueOnce(entry).mockReturnValueOnce(exit);
    const view = render(<Fixture />);
    const node = view.getByTestId("overlay");
    expect(state.animate).toHaveBeenCalledWith(
      [node],
      { opacity: 1, transform: "none" },
      expect.objectContaining({ duration: 0.22 }),
    );
    state.present = false;
    view.rerender(<Fixture />);
    expect(entry.stop).toHaveBeenCalledOnce();
    expect(state.animate).toHaveBeenLastCalledWith(
      [node],
      { opacity: 0, transform: "translateY(-4px) scale(0.985)" },
      expect.objectContaining({ duration: 0.14 }),
    );
    expect(state.remove).not.toHaveBeenCalled();
    exit.complete();
    await exit;
    await Promise.resolve();
    expect(state.remove).toHaveBeenCalledOnce();
  });

  it("keeps an interrupted exit from removing a reopened overlay", async () => {
    const entry = control();
    const exit = control();
    const reopen = control();
    state.animate.mockReturnValueOnce(entry).mockReturnValueOnce(exit).mockReturnValueOnce(reopen);
    const view = render(<Fixture />);
    state.present = false;
    view.rerender(<Fixture />);
    const node = view.getByTestId("overlay");
    node.style.opacity = "0.4";
    state.present = true;
    view.rerender(<Fixture />);
    expect(node.style.opacity).toBe("0.4");
    expect(exit.stop).toHaveBeenCalledOnce();
    exit.complete();
    await exit;
    await Promise.resolve();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("uses immediate visibility and deferred removal for reduced motion", async () => {
    state.reduce = true;
    const view = render(<Fixture kind="dialog" />);
    expect(view.getByTestId("overlay").style.opacity).toBe("1");
    expect(state.animate).not.toHaveBeenCalled();
    state.present = false;
    view.rerender(<Fixture kind="dialog" />);
    await Promise.resolve();
    expect(state.remove).toHaveBeenCalledOnce();
  });

  it("releases an overlay removed before its portal is ready", async () => {
    const view = render(<Fixture ready={false} />);
    expect(state.animate).not.toHaveBeenCalled();
    state.present = false;
    view.rerender(<Fixture ready={false} />);
    await Promise.resolve();
    expect(state.remove).toHaveBeenCalledOnce();
  });
});
