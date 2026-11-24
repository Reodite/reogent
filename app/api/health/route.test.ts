import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ query: vi.fn(), health: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({ health: mocks.health }) }));

beforeEach(() => {
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.health.mockResolvedValue({ status: "available" });
});

describe("GET /api/health", () => {
  it("reports healthy when both services respond", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ database: true, search: true });
  });

  it("returns 503 without leaking the failure", async () => {
    mocks.query.mockRejectedValue(new Error("password authentication failed for user reodite"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"database":false,"search":true}');
  });
});
