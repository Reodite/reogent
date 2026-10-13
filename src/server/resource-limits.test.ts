import { getHeapStatistics } from "node:v8";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../../instrumentation";
import { validateMemoryLimits } from "./resource-limits";

const { migrate } = vi.hoisted(() => ({ migrate: vi.fn() }));
vi.mock("@/src/server/db/migrate", () => ({ migrate }));

const heapMiB = Math.ceil(getHeapStatistics().heap_size_limit / 1024 ** 2);

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("APP_MEMORY_MB", undefined);
  vi.stubEnv("NODE_HEAP_MB", undefined);
  migrate.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startup memory budgets", () => {
  it("leaves unconfigured development unconstrained", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await register();
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("accepts configured budgets above both old-space and the actual V8 heap", async () => {
    vi.stubEnv("APP_MEMORY_MB", String(heapMiB + 256));
    vi.stubEnv("NODE_HEAP_MB", String(heapMiB));
    await register();
    expect(migrate).toHaveBeenCalledOnce();
  });

  it.each([
    ["APP_MEMORY_MB", undefined],
    ["NODE_HEAP_MB", undefined],
    ["APP_MEMORY_MB", "0"],
    ["NODE_HEAP_MB", "0"],
    ["APP_MEMORY_MB", "8589934592"],
    ["NODE_HEAP_MB", "8589934592"],
  ])("rejects missing or unsafe %s=%j", (name, value) => {
    vi.stubEnv("APP_MEMORY_MB", String(heapMiB + 256));
    vi.stubEnv("NODE_HEAP_MB", String(heapMiB));
    vi.stubEnv(name, value);
    expect(() => validateMemoryLimits(getHeapStatistics().heap_size_limit)).toThrow(name);
  });

  it("requires configured old-space to stay below app memory", () => {
    vi.stubEnv("APP_MEMORY_MB", String(heapMiB + 256));
    vi.stubEnv("NODE_HEAP_MB", String(heapMiB + 256));
    expect(() => validateMemoryLimits(getHeapStatistics().heap_size_limit)).toThrow(
      "NODE_HEAP_MB must be below APP_MEMORY_MB",
    );
  });

  it("rejects the actual V8 heap at the app limit despite a smaller declared old-space budget", () => {
    const appMiB = Math.floor(getHeapStatistics().heap_size_limit / 1024 ** 2);
    vi.stubEnv("APP_MEMORY_MB", String(appMiB));
    vi.stubEnv("NODE_HEAP_MB", String(appMiB - 1));
    expect(() => validateMemoryLimits(getHeapStatistics().heap_size_limit)).toThrow(
      "V8 heap limit must be below APP_MEMORY_MB",
    );
  });

  it("logs invalid memory configuration and exits before migration", async () => {
    vi.stubEnv("APP_MEMORY_MB", "0");
    vi.stubEnv("NODE_HEAP_MB", "640");
    const stopped = new Error("Process exited");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw stopped;
    });
    await expect(register()).rejects.toBe(stopped);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Invalid memory configuration:",
      expect.objectContaining({ message: expect.stringContaining("APP_MEMORY_MB") }),
    );
    expect(migrate).not.toHaveBeenCalled();
  });

  it("keeps migration failures recoverable after valid memory configuration", async () => {
    vi.stubEnv("APP_MEMORY_MB", String(heapMiB + 256));
    vi.stubEnv("NODE_HEAP_MB", String(heapMiB));
    const error = new Error("Migration unavailable");
    migrate.mockRejectedValueOnce(error);
    await expect(register()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("DB migration failed:", error);
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("skips Node startup work for the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("APP_MEMORY_MB", "0");
    await register();
    expect(migrate).not.toHaveBeenCalled();
  });
});
