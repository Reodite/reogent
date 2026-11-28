import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ connectDatabase: vi.fn(), ping: vi.fn(), health: vi.fn() }));
vi.mock("@/src/server/db", () => ({
  connectDatabase: mocks.connectDatabase,
}));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({ health: mocks.health }) }));

beforeEach(() => {
  mocks.connectDatabase.mockResolvedValue({ connection: { db: { admin: () => ({ ping: mocks.ping }) } } });
  mocks.ping.mockResolvedValue({ ok: 1 });
  mocks.health.mockResolvedValue({ status: "available" });
});

describe("GET /api/health", () => {
  it("reports healthy when both services respond", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ database: true, search: true });
  });

  it("returns 503 without leaking the failure", async () => {
    mocks.ping.mockRejectedValue(new Error("MongoDB authentication failed"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"database":false,"search":true}');
  });
});
