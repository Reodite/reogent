// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellNavigationProvider, useShellNavigation } from "./shell-navigation";

const pathname = vi.hoisted(() => ({ value: "/chat" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => router,
}));

function Capture() {
  const navigation = useShellNavigation();
  return (
    <>
      <output data-testid="navigation" data-display={navigation.displayPathname} data-pending={navigation.pending} />
      <button type="button" onClick={() => navigation.push("/tools/map")}>
        Open map
      </button>
      <button type="button" onClick={() => navigation.push("/pulse")}>
        Open Pulse
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  pathname.value = "/chat";
  router.push.mockReset();
  router.replace.mockReset();
  vi.useRealTimers();
});

describe("ShellNavigationProvider", () => {
  it("publishes destination intent before the router commits", () => {
    render(
      <ShellNavigationProvider>
        <Capture />
      </ShellNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open map" }));

    expect(screen.getByTestId("navigation").dataset.display).toBe("/tools/map");
    expect(screen.getByTestId("navigation").dataset.pending).toBe("true");
    expect(router.push).toHaveBeenCalledWith("/tools/map");
  });

  it("keeps the latest rapid intent when an earlier route commits", () => {
    const view = render(
      <ShellNavigationProvider>
        <Capture />
      </ShellNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open map" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Pulse" }));

    pathname.value = "/tools/map";
    view.rerender(
      <ShellNavigationProvider>
        <Capture />
      </ShellNavigationProvider>,
    );
    expect(screen.getByTestId("navigation").dataset.display).toBe("/pulse");
    expect(screen.getByTestId("navigation").dataset.pending).toBe("true");

    pathname.value = "/pulse";
    view.rerender(
      <ShellNavigationProvider>
        <Capture />
      </ShellNavigationProvider>,
    );
    expect(screen.getByTestId("navigation").dataset.display).toBe("/pulse");
    expect(screen.getByTestId("navigation").dataset.pending).toBe("false");
  });

  it("drops an uncommitted intent after the bounded timeout", () => {
    vi.useFakeTimers();
    render(
      <ShellNavigationProvider>
        <Capture />
      </ShellNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open map" }));

    act(() => vi.advanceTimersByTime(10_000));

    expect(screen.getByTestId("navigation").dataset.display).toBe("/chat");
    expect(screen.getByTestId("navigation").dataset.pending).toBe("false");
  });

  it("falls back to the router outside the provider", () => {
    render(<Capture />);
    fireEvent.click(screen.getByRole("button", { name: "Open map" }));
    expect(router.push).toHaveBeenCalledWith("/tools/map");
    expect(screen.getByTestId("navigation").dataset.pending).toBe("false");
  });
});
