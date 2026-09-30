// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { persistedSlice, usePlanner } from "./components/degree-planner/planner-store";
import { usePlanSync } from "./components/degree-planner/use-plan-sync";

const state = vi.hoisted(() => ({
  auth: { user: { userId: "account-a" }, isGuest: false },
  api: { getPlan: vi.fn(), savePlan: vi.fn(async () => {}) },
}));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => state.auth }));
vi.mock("@/src/components/providers", () => ({ useApi: () => state.api }));

it("audit: switching accounts adopts the previous account's plan", async () => {
  const accountAPlan = { ...persistedSlice(usePlanner.getState()), major: "private-account-a-plan" };
  state.api.getPlan.mockResolvedValueOnce({ plan: accountAPlan });
  const first = renderHook(() => usePlanSync());
  await waitFor(() => expect(usePlanner.getState().major).toBe("private-account-a-plan"));
  first.unmount();
  state.auth.user = { userId: "account-b" };
  state.api.getPlan.mockResolvedValueOnce({ plan: null });
  const second = renderHook(() => usePlanSync());
  await waitFor(() => expect(state.api.savePlan).toHaveBeenCalledWith(accountAPlan));
  second.unmount();
});
