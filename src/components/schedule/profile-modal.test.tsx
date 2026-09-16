// @vitest-environment happy-dom
import { AVATAR_COLORS } from "@/src/lib/schedule/avatar";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileModal } from "./profile-modal";

afterEach(cleanup);

describe("ProfileModal", () => {
  it("keeps the header and actions outside the bounded form scroller", () => {
    render(<ProfileModal title="Profile" saveLabel="Save" onSave={vi.fn()} onCancel={vi.fn()} />);

    const panel = screen.getByRole("dialog", { name: "Profile" });
    const input = screen.getByLabelText("Handle");
    const body = input.closest<HTMLElement>(".overflow-y-auto");
    const header = panel.querySelector("[data-dialog-header]")!;
    const actions = panel.querySelector("[data-dialog-actions]")!;
    const footer = actions.closest("footer");

    expect(body).not.toBeNull();
    expect(body?.parentElement).toBe(panel);
    expect(body?.classList.contains("min-h-0")).toBe(true);
    expect(body?.classList.contains("space-y-4")).toBe(true);
    expect(body?.classList.contains("p-4")).toBe(true);
    expect(body?.classList.contains("sm:px-6")).toBe(true);
    expect(body?.contains(screen.getByRole("group", { name: "Avatar" }))).toBe(true);
    expect(body?.contains(header)).toBe(false);
    expect(body?.contains(actions)).toBe(false);
    expect(header.parentElement).toBe(panel);
    expect(header.classList.contains("shrink-0")).toBe(true);
    expect(footer?.parentElement).toBe(panel);
    expect(footer?.classList.contains("shrink-0")).toBe(true);
    expect(footer?.classList.contains("px-4")).toBe(true);
    expect(footer?.classList.contains("pb-4")).toBe(true);
    expect(footer?.classList.contains("sm:px-6")).toBe(true);
    expect(footer?.classList.contains("sm:pb-6")).toBe(true);
    expect(actions.classList.contains("mt-6")).toBe(false);
    expect(panel.classList.contains("p-0")).toBe(true);
    expect(panel.classList.contains("flex")).toBe(true);
    expect(panel.classList.contains("flex-col")).toBe(true);
    expect(panel.classList.contains("overflow-hidden")).toBe(true);
    expect(panel.classList.contains("[:where(&)]:max-h-full")).toBe(true);
    expect((input as HTMLInputElement).form).toBe(panel);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).form).toBe(panel);
  });

  it("submits the trimmed handle and selected avatar from the fixed footer", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileModal title="Profile" saveLabel="Save" onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: " Ada Lovelace " } });
    fireEvent.click(screen.getByRole("button", { name: `color ${AVATAR_COLORS[1]}` }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Ada Lovelace", {
        kind: "initials",
        initials: "AL",
        color: AVATAR_COLORS[1],
      }),
    );
  });

  it.each(["Cancel", "backdrop", "Escape"])("preserves %s dismissal", (action) => {
    const onCancel = vi.fn();
    render(<ProfileModal title="Profile" saveLabel="Save" onSave={vi.fn()} onCancel={onCancel} />);

    if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else
      fireEvent.click(screen.getByRole("button", { name: action === "Cancel" ? "Cancel" : "Cancel schedule profile" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("associates validation with the handle and clears it after editing", () => {
    const onSave = vi.fn();
    render(<ProfileModal title="Profile" saveLabel="Save" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.submit(screen.getByRole("dialog"));
    const input = screen.getByLabelText("Handle");
    expect(onSave).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    expect(screen.getByRole("alert").textContent).toBe("Pick a handle.");
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("focuses the handle and prevents duplicate saves", async () => {
    let finish: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(
      <ProfileModal
        currentHandle="Ada"
        currentAvatar={{ kind: "initials", initials: "AD", color: "#4d9de0" }}
        title="Replace your schedule"
        saveLabel="Replace schedule"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const input = screen.getByLabelText("Handle");
    await waitFor(() => expect(document.activeElement).toBe(input));
    const submit = screen.getByRole("button", { name: "Replace schedule" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel schedule profile" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => finish?.());
    expect((screen.getByRole("button", { name: "Replace schedule" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
