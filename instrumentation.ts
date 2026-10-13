export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getHeapStatistics } = await import("node:v8");
    const { validateMemoryLimits } = await import("@/src/server/resource-limits");
    try {
      validateMemoryLimits(getHeapStatistics().heap_size_limit);
    } catch (error) {
      console.error("Invalid memory configuration:", error);
      // Next retains its listener after instrumentation rejection.
      process.exit(1);
    }
    const { migrate } = await import("@/src/server/db/migrate");
    try {
      await migrate();
      console.log("DB migration applied");
    } catch (e) {
      console.error("DB migration failed:", e);
    }
  }
}
