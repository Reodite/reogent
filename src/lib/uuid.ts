/** Generates a v4 UUID. */
export function uuid(): string {
  return crypto.randomUUID();
}
