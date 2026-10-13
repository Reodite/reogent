import { afterEach, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("loads account details with the current session's bearer token", async () => {
  const details = { username: "ada", tokensSpent: 250, pulseQuestionsAnswered: 12 };
  const fetchMock = vi.fn().mockResolvedValue(Response.json(details));
  vi.stubGlobal("fetch", fetchMock);
  const api = createChatApi({ getToken: async () => "private-token" });
  expect(await api.getAccount()).toEqual(details);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/account",
    expect.objectContaining({
      headers: { Authorization: "Bearer private-token" },
    }),
  );
});

it("does not fetch account details after the session has been revoked", async () => {
  const fetchMock = vi.fn();
  const onUnauthorized = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const api = createChatApi({ getToken: async () => null, onUnauthorized });
  await expect(api.getAccount()).rejects.toMatchObject({ status: 401 });
  expect(onUnauthorized).toHaveBeenCalledOnce();
  expect(fetchMock).not.toHaveBeenCalled();
});
