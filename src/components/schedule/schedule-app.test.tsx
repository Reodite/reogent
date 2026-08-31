// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateGroupModal, ScheduleApp } from "./schedule-app";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const getToken = vi.hoisted(() => vi.fn(async () => "token"));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({
    getToken,
    user: { userId: "u1", username: "ada" },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function CreateDialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open create
      </button>
      {open && <CreateGroupModal onCreate={async () => {}} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("CreateGroupModal", () => {
  it("traps initial focus and restores the trigger on close", async () => {
    render(<CreateDialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open create" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByLabelText("Group name");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("allows only one create request while submission is pending", async () => {
    let finish: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<CreateGroupModal onCreate={onCreate} onClose={vi.fn()} />);

    const input = screen.getByLabelText("Group name");
    fireEvent.change(input, { target: { value: "Study crew" } });
    const form = input.closest("form");
    if (!form) throw new Error("create form not rendered");
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish?.());
    expect((screen.getByRole("button", { name: "Create group" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ScheduleApp group loading", () => {
  it("ignores a slower response for the previously active group", async () => {
    let resolveA: ((response: Response) => void) | undefined;
    const groupA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    const groups = [
      { code: "AAAAAA", name: "Group A", memberCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
      { code: "BBBBBB", name: "Group B", memberCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const response = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/schedule")) return Promise.resolve(response({ person: null }));
      if (url.endsWith("/groups") && !init?.method) return Promise.resolve(response({ groups }));
      if (url.endsWith("/groups/AAAAAA")) return groupA;
      if (url.endsWith("/groups/BBBBBB")) {
        return Promise.resolve(
          response({ group: { code: "BBBBBB", name: "Group B", createdBy: "u1", createdAt: "x", members: [] } }),
        );
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<ScheduleApp groupCode="AAAAAA" />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/AAAAAA"))).toBe(true));
    view.rerender(<ScheduleApp groupCode="BBBBBB" />);
    await screen.findByRole("button", { name: "Leave Group B" });

    await act(async () => {
      resolveA?.(
        response({ group: { code: "AAAAAA", name: "Group A", createdBy: "u1", createdAt: "x", members: [] } }),
      );
    });
    expect(screen.getByRole("button", { name: "Leave Group B" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave Group A" })).toBeNull();
  });
});
