// @vitest-environment happy-dom
import { Icon } from "@/src/components/icons";
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarItemButton } from "./sidebar-list";

describe("SidebarItemButton", () => {
  it("marks the current page and forwards refs and native actions", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <SidebarItemButton ref={ref} label="Courses" icon={<Icon name="book2" size={16} />} active onClick={onClick} />,
    );
    const button = getByRole("button", { name: "Courses" });
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-current")).toBe("page");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("retains accessible labels in the collapsed rail", () => {
    const { getByRole } = render(
      <SidebarItemButton label="Courses" icon={<Icon name="book2" size={16} />} active={false} collapsed />,
    );
    const button = getByRole("button", { name: "Courses" });
    expect(button.hasAttribute("aria-current")).toBe(false);
  });

  it("ignores activation while disabled", () => {
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
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
