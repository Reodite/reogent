const testDatabase = "reodite_test";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

/** Ensures integration tests can only connect to the local test database. */
export function validateMongoTestUri(uri: string): void {
  const parsed = new URL(uri);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.protocol !== "mongodb:" || !localHosts.has(hostname) || database !== testDatabase) {
    throw new Error("MongoDB integration tests require localhost and the reodite_test database");
  }
}
