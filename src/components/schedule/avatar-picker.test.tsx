// @vitest-environment happy-dom
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/src/lib/schedule/avatar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

afterEach(cleanup);

describe("AvatarPicker", () => {
  it("switches avatar modes and reports generated initials", () => {
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
    expect(emoji.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(initials);
    expect(initials.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).toHaveBeenCalledWith({ kind: "initials", initials: "AL", color: AVATAR_COLORS[0] });
    fireEvent.click(screen.getByRole("button", { name: "photo" }));
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeTruthy();
  });

  it("reports emoji and color selections", () => {
    const onChange = vi.fn();
    const avatar = { kind: "emoji" as const, emoji: AVATAR_EMOJI[0], color: AVATAR_COLORS[0] };
    render(<AvatarPicker handle="Ada" avatar={avatar} onChange={onChange} />);
    const emoji = screen.getByRole("button", { name: AVATAR_EMOJI[0] });
    expect(emoji.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: AVATAR_EMOJI[1] }));
    expect(onChange).toHaveBeenLastCalledWith({ ...avatar, emoji: AVATAR_EMOJI[1] });
    const colors = screen.getAllByRole("button", { name: /^color / });
    expect(colors).toHaveLength(AVATAR_COLORS.length);
    expect(colors[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(colors[1]);
    expect(onChange).toHaveBeenLastCalledWith({ ...avatar, color: AVATAR_COLORS[1] });
  });
});
