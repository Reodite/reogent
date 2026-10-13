// @vitest-environment happy-dom
import { Icon } from "@/src/components/icons";
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarItemButton } from "./sidebar-list";

describe("SidebarItemButton", () => {
  it("shares selected navigation geometry and forwards native actions", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <SidebarItemButton ref={ref} label="Courses" icon={<Icon name="book2" size={16} />} active onClick={onClick} />,
    );
    const button = getByRole("button", { name: "Courses" });
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("sm:h-9");
    expect(button.className).toContain("gap-2");
    expect(button.className).toContain("neu-inset bg-surface-container");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("retains accessible labels in the collapsed rail", () => {
    const { getByRole } = render(
      <SidebarItemButton label="Courses" icon={<Icon name="book2" size={16} />} active={false} collapsed />,
    );
    const button = getByRole("button", { name: "Courses" });
    expect(button.className).toContain("w-11 justify-center sm:w-9");
    expect(button.querySelector("span")?.className).toContain("sr-only");
    expect(button.hasAttribute("aria-current")).toBe(false);
  });

  it("reserves mobile session accessory space and respects disabled state", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SidebarItemButton
        label="Session"
        icon={<Icon name="chat1" size={16} />}
        active={false}
        accessories
        disabled
        onClick={onClick}
      />,
    );
    const button = getByRole("button");
    expect(button.className).toContain("pr-13 sm:pr-10");
    expect(button.hasAttribute("data-sidebar-accessories")).toBe(true);
    expect(button.className).toContain("disabled:opacity-45");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
