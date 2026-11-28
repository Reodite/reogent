import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("mongoose", () => ({
  default: { connect: mocks.connect, disconnect: mocks.disconnect },
}));

describe("MongoDB connection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("USE_EXTERNAL_MONGODB", "false");
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://reodite:secret@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
    mocks.connect.mockReset().mockResolvedValue({});
    mocks.disconnect.mockReset().mockResolvedValue(undefined);
  });

  it("uses the configured local URI and reuses the connection", async () => {
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://reodite:secret@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
    const { connectDatabase } = await import("./db");
    await connectDatabase();
    await connectDatabase();
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(
      "mongodb://reodite:secret@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
      {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
      },
    );
  });

  it("builds a host-local URI from app credentials when no URI is supplied", async () => {
    vi.stubEnv("USE_EXTERNAL_MONGODB", "false");
    vi.stubEnv("MONGODB_URI", "");
    vi.stubEnv("MONGODB_APP_USERNAME", "app user");
    vi.stubEnv("MONGODB_APP_PASSWORD", "p@ss:/word");
    const { connectDatabase } = await import("./db");
    await connectDatabase();
    expect(mocks.connect.mock.calls[0][0]).toBe(
      "mongodb://app%20user:p%40ss%3A%2Fword@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
  });

  it("uses the configured local host port and connection options", async () => {
    vi.stubEnv("MONGODB_PORT", "27018");
    vi.stubEnv("MONGODB_MAX_POOL_SIZE", "4");
    vi.stubEnv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "2500");
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://reodite:secret@localhost:27018/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
    const { connectDatabase } = await import("./db");
    await connectDatabase();
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(
      "mongodb://reodite:secret@localhost:27018/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
      { maxPoolSize: 4, serverSelectionTimeoutMS: 2500 },
    );
  });

  it("uses the externally hosted URI when the boolean toggle is true", async () => {
    vi.stubEnv("USE_EXTERNAL_MONGODB", "true");
    vi.stubEnv("MONGODB_URI", "mongodb+srv://user:secret@cluster.example/reodite");
    const { connectDatabase } = await import("./db");
    await connectDatabase();
    expect(mocks.connect.mock.calls[0][0]).toBe("mongodb+srv://user:secret@cluster.example/reodite");
  });

  it.each([undefined, "false", "yes"] as const)("uses local Mongo unless the toggle is true: %s", async (toggle) => {
    if (toggle !== undefined) vi.stubEnv("USE_EXTERNAL_MONGODB", toggle);
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://reodite:secret@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
    const { connectDatabase } = await import("./db");
    await connectDatabase();
    expect(mocks.connect.mock.calls[0][0]).toBe(
      "mongodb://reodite:secret@localhost:27017/reodite?authSource=reodite&replicaSet=rs0&directConnection=true",
    );
  });

  it("requires a URI when external Mongo is enabled", async () => {
    vi.stubEnv("USE_EXTERNAL_MONGODB", "true");
    vi.stubEnv("MONGODB_URI", "");
    const { connectDatabase } = await import("./db");
    expect(() => connectDatabase()).toThrow("MONGODB_URI env var is required when USE_EXTERNAL_MONGODB=true");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("clears a failed connection attempt so callers can retry", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({});
    const { connectDatabase } = await import("./db");
    await expect(connectDatabase()).rejects.toThrow("unavailable");
    await connectDatabase();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it("disconnects and clears the cached connection", async () => {
    const { closeDatabase, connectDatabase } = await import("./db");
    await connectDatabase();
    await closeDatabase();
    await connectDatabase();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});
