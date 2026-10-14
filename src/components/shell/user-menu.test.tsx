// @vitest-environment happy-dom
import { AudioProvider } from "@/src/components/audio/audio-provider";
import { UserMenu } from "@/src/components/shell/user-menu";
import { siteAudio } from "@/src/lib/audio";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ user: { username: "max", userId: "1" }, signOut: () => {} }),
}));
vi.mock("@/src/components/providers", () => ({
  useTheme: () => ({ mode: "light", setMode: vi.fn() }),
}));
vi.mock("@/src/components/shell/session-sidebar", () => ({ VersionBadge: () => null }));
vi.mock("@/src/components/icons", () => ({
  Icon: ({ name }: { name: string }) => <svg data-icon={name} aria-hidden="true" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UserMenu", () => {
  it("composes account actions and appearance as a labeled dialog", () => {
    const { getByRole, queryByRole, queryByText } = render(<UserMenu />);
    const trigger = getByRole("button", { name: "Account menu" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    const popup = getByRole("dialog", { name: "Account" });
    expect(document.activeElement).toBe(popup);
    const appearance = getByRole("radiogroup");
    expect(within(trigger).getByText("max")).not.toBeNull();
    expect(within(popup).queryByText("max")).toBeNull();
    expect(popup.firstElementChild?.contains(appearance)).toBe(true);
    expect(appearance.parentElement?.classList.contains("flex-wrap")).toBe(true);
    expect(appearance.parentElement?.classList.contains("gap-y-2")).toBe(true);
    const pages = within(popup).getByRole("navigation", { name: "General" });
    expect(
      within(pages)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Settings", "Account", "About"]);
    expect(within(pages).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(within(pages).getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/account");
    const about = within(pages).getByRole("link", { name: "About" });
    expect(about.getAttribute("href")).toBe("/about");
    expect(about.querySelector("svg")?.getAttribute("data-icon")).toBe("info");
    expect(queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(queryByText("Signed in as")).toBeNull();
    expect(queryByRole("menuitem")).toBeNull();
  });

  it.each(["Settings", "Account", "About"])("closes the popup and its sidebar drawer when %s opens", (page) => {
    const onNavigate = vi.fn();
    const play = vi.spyOn(siteAudio, "play").mockImplementation(() => {});
    const { getByRole, queryByRole } = render(
      <AudioProvider>
        <UserMenu onNavigate={onNavigate} />
      </AudioProvider>,
    );
    fireEvent.click(getByRole("button", { name: "Account menu" }));
    expect(play).toHaveBeenCalledExactlyOnceWith("open");
    play.mockClear();
    const link = getByRole("link", { name: page });
    expect(link.getAttribute("data-sound")).toBe("navigation");
    fireEvent.pointerOver(link, { pointerType: "mouse" });
    fireEvent.focusIn(link);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(play).toHaveBeenCalledExactlyOnceWith("navigation");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(queryByRole("dialog", { name: "Account" })).toBeNull();
    expect(getByRole("button", { name: "Account menu" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps appearance arrow keys inside the radio group", () => {
    const { getByRole } = render(<UserMenu />);
    fireEvent.click(getByRole("button", { name: "Account menu" }));
    const light = getByRole("radio", { name: "Light" });
    light.focus();
    fireEvent.keyDown(light, { key: "ArrowDown" });
    expect(document.activeElement).toBe(getByRole("radio", { name: "Dark" }));
  });
});
