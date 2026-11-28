const testDatabase = "reodite_test";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

/** Ensures integration tests can only connect to the local test database. */
export function validateMongoTestUri(uri: string): void {
  const parsed = new URL(uri);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "mongodb:" ||
    !localHosts.has(hostname) ||
    parsed.pathname !== `/${testDatabase}` ||
    parsed.searchParams.get("directConnection") !== "true"
  ) {
    throw new Error("MongoDB integration tests require localhost and the reodite_test database");
  }
}
