// @vitest-environment happy-dom
import { UserMenu } from "@/src/components/shell/user-menu";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ user: { username: "max", userId: "1" }, signOut: () => {} }),
}));
vi.mock("@/src/components/providers", () => ({
  useTheme: () => ({ mode: "system", setMode: vi.fn() }),
}));
vi.mock("@/src/components/shell/session-sidebar", () => ({ VersionBadge: () => null }));

afterEach(cleanup);

describe("UserMenu", () => {
  it("composes account actions and appearance as a labeled dialog", () => {
    const { getByRole, queryByRole } = render(<UserMenu />);
    const trigger = getByRole("button", { name: "Account menu" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    const popup = getByRole("dialog", { name: "Account" });
    expect(document.activeElement).toBe(popup);
    const appearance = getByRole("radiogroup");
    expect(popup.contains(appearance)).toBe(true);
    expect(appearance.parentElement?.classList.contains("flex-wrap")).toBe(true);
    expect(appearance.parentElement?.classList.contains("gap-y-2")).toBe(true);
    expect(getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(getByRole("button", { name: "Sign out" })).not.toBeNull();
    expect(queryByRole("menuitem")).toBeNull();
  });

  it("keeps appearance arrow keys inside the radio group", () => {
    const { getByRole } = render(<UserMenu />);
    fireEvent.click(getByRole("button", { name: "Account menu" }));
    const auto = getByRole("radio", { name: "Auto" });
    auto.focus();
    fireEvent.keyDown(auto, { key: "ArrowDown" });
    expect(document.activeElement).toBe(getByRole("radio", { name: "Dark" }));
  });
});
