// @vitest-environment happy-dom
import { UserMenu } from "@/src/components/shell/user-menu";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ user: { username: "max", userId: "1" }, signOut: () => {} }),
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/components/shell/session-sidebar", () => ({ VersionBadge: () => null }));

afterEach(cleanup);

describe("UserMenu", () => {
  it("links to /settings and cycles menu items with arrow keys", () => {
    const { getByRole, getAllByRole } = render(<UserMenu />);
    fireEvent.click(getByRole("button", { name: "Account menu" }));

    expect(getByRole("menuitem", { name: "Settings" }).getAttribute("href")).toBe("/settings");

    const items = getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
  });
});
