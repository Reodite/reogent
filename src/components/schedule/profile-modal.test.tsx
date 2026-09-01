// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileModal } from "./profile-modal";

afterEach(cleanup);

describe("ProfileModal", () => {
  it("focuses the handle and prevents duplicate saves", async () => {
    let finish: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ProfileModal
        currentHandle="Ada"
        currentAvatar={{ kind: "initials", initials: "AD", color: "#4d9de0" }}
        title="Replace your schedule"
        saveLabel="Replace schedule"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Handle");
    await waitFor(() => expect(document.activeElement).toBe(input));
    const submit = screen.getByRole("button", { name: "Replace schedule" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish?.());
    expect((screen.getByRole("button", { name: "Replace schedule" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
