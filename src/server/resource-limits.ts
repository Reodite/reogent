export const MAX_TIMER_MS = 2_147_483_647;

/** Reads a positive safe integer from the environment, subject to an upper bound. */
export function positiveIntegerEnv(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

/** Validates paired MiB budgets against configured old-space and actual V8 heap limits when provided. */
export function validateMemoryLimits(heapSizeLimit: number): void {
  if (process.env.APP_MEMORY_MB === undefined && process.env.NODE_HEAP_MB === undefined) return;
  const maximumMiB = Math.floor(Number.MAX_SAFE_INTEGER / 1024 ** 2);
  const appMemoryMiB = positiveIntegerEnv("APP_MEMORY_MB", 0, maximumMiB);
  const nodeHeapMiB = positiveIntegerEnv("NODE_HEAP_MB", 0, maximumMiB);
  if (nodeHeapMiB >= appMemoryMiB) {
    throw new Error("NODE_HEAP_MB must be below APP_MEMORY_MB");
  }
  if (heapSizeLimit >= appMemoryMiB * 1024 ** 2) {
    throw new Error("V8 heap limit must be below APP_MEMORY_MB; set NODE_OPTIONS with --max-old-space-size");
  }
}

/** Creates an admission limit with no waiting queue and idempotent release callbacks. */
export function createCapacityLimit(maximum: number): () => (() => void) | null {
  let active = 0;
  return () => {
    if (active >= maximum) return null;
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
    };
  };
}
