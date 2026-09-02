import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
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
