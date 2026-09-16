// @vitest-environment happy-dom
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/src/lib/schedule/avatar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

afterEach(cleanup);

describe("AvatarPicker", () => {
  it("keeps complete selected and neutral mode tokens when switching choices", () => {
    const onChange = vi.fn();
    render(
      <AvatarPicker
        handle="Ada Lovelace"
        avatar={{ kind: "emoji", emoji: AVATAR_EMOJI[0], color: AVATAR_COLORS[0] }}
        onChange={onChange}
      />,
    );
    const emoji = screen.getByRole("button", { name: "emoji" });
    const initials = screen.getByRole("button", { name: "initials" });
    expect(emoji.classList.contains("text-on-surface")).toBe(true);
    expect(emoji.classList.contains("bg-surface-container-low")).toBe(true);
    expect(initials.classList.contains("bg-surface")).toBe(true);
    expect(emoji.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(initials);
    expect(initials.getAttribute("aria-pressed")).toBe("true");
    expect(initials.classList.contains("bg-surface-container-low")).toBe(true);
    expect(emoji.classList.contains("bg-surface")).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ kind: "initials", initials: "AL", color: AVATAR_COLORS[0] });
    fireEvent.click(screen.getByRole("button", { name: "photo" }));
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeTruthy();
  });

  it("preserves emoji and color selections with responsive choice targets", () => {
    const onChange = vi.fn();
    const avatar = { kind: "emoji" as const, emoji: AVATAR_EMOJI[0], color: AVATAR_COLORS[0] };
    render(<AvatarPicker handle="Ada" avatar={avatar} onChange={onChange} />);
    const emoji = screen.getByRole("button", { name: AVATAR_EMOJI[0] });
    expect(emoji.getAttribute("aria-pressed")).toBe("true");
    expect(emoji.parentElement?.className).toContain("grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))]");
    expect(emoji.parentElement?.className).toContain("max-h-40");
    fireEvent.click(screen.getByRole("button", { name: AVATAR_EMOJI[1] }));
    expect(onChange).toHaveBeenLastCalledWith({ ...avatar, emoji: AVATAR_EMOJI[1] });
    const colors = screen.getAllByRole("button", { name: /^color / });
    expect(colors).toHaveLength(AVATAR_COLORS.length);
    expect(colors[0].getAttribute("aria-pressed")).toBe("true");
    expect(colors[0].className).toContain("size-11");
    expect(colors[0].className).toContain("sm:size-8");
    expect(colors[0].firstElementChild?.className).toContain("size-6");
    fireEvent.click(colors[1]);
    expect(onChange).toHaveBeenLastCalledWith({ ...avatar, color: AVATAR_COLORS[1] });
  });
});
