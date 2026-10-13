import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("course catalog reuse", () => {
  it("shares pending loads, expires an hour after completion, and stays local to one API instance", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01"));
    const ttl = 60 * 60 * 1000;
    const catalog = { courses: [{ code: "CPSC 110", title: "Computation" }] };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const options = { getToken: async () => "jwt" };
    const api = createChatApi(options);
    for (let cycle = 1; cycle <= 2; cycle++) {
      const gate = Promise.withResolvers<void>();
      fetchMock.mockImplementation(async () => {
        await gate.promise;
        return Response.json(catalog);
      });
      const requests = Array.from({ length: 10 }, () => api.getCourseIndex());
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      vi.setSystemTime(Date.now() + ttl + 1);
      requests.push(api.getCourseIndex());
      gate.resolve();
      for (const result of await Promise.all(requests)) expect(result).toEqual(catalog);
      vi.setSystemTime(Date.now() + ttl - 1);
      expect(await api.getCourseIndex()).toEqual(catalog);
      expect(fetchMock).toHaveBeenCalledTimes(cycle);
      vi.setSystemTime(Date.now() + 1);
    }
    await createChatApi(options).getCourseIndex();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("evicts failed loads and checks the token before returning cached data", async () => {
    const catalog = { courses: [] };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async () => Response.json(catalog));
    vi.stubGlobal("fetch", fetchMock);
    const getToken = vi.fn<() => Promise<string | null>>().mockResolvedValue("jwt");
    const onUnauthorized = vi.fn();
    const api = createChatApi({ getToken, onUnauthorized });
    await expect(api.getCourseIndex()).rejects.toThrow("offline");
    expect(await api.getCourseIndex()).toEqual(catalog);
    getToken.mockResolvedValueOnce(null);
    await expect(api.getCourseIndex()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    getToken.mockRejectedValueOnce(new Error("Token unavailable"));
    await expect(api.getCourseIndex()).rejects.toThrow("Token unavailable");
    expect(await api.getCourseIndex()).toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("public map API client", () => {
  it("loads public map data without requesting an account token", async () => {
    const getToken = vi.fn(async () => null);
    const onUnauthorized = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getToken, onUnauthorized });

    await api.getGeo("buildings");

    expect(getToken).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/geo/buildings",
      expect.objectContaining({ headers: expect.not.objectContaining({ Authorization: expect.anything() }) }),
    );
  });

  it("passes cancellation signals to public building and route requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "TEST", name: "Test" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ from: "TEST", to: "DEST", meters: 100, minutes: 2, method: "network", polyline: [] }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getToken: async () => null });
    const buildingController = new AbortController();
    const routeController = new AbortController();

    await api.getBuildingDetails("TEST", buildingController.signal);
    await api.getRoute("TEST", "DEST", routeController.signal);

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(buildingController.signal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(routeController.signal);
  });

  it("authenticates favorite reads and idempotent state updates", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ codes: ["IBLC"] })));
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getToken: async () => "jwt" });

    await api.getBuildingFavorites();
    await api.setBuildingFavorite("IBLC", true);

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer jwt" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ code: "IBLC", saved: true }),
    });
  });

  it("keeps private account requests authenticated", async () => {
    const getToken = vi.fn(async () => null);
    const onUnauthorized = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getToken, onUnauthorized });

    await expect(api.listSessions()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
