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
