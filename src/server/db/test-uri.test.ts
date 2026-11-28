import { describe, expect, it } from "vitest";
import { validateMongoTestUri } from "./test-uri";

describe("MongoDB integration URI", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts local host %s with the test database", (host) => {
    expect(() => validateMongoTestUri(`mongodb://user:pass@${host}:27017/reodite_test?replicaSet=rs0`)).not.toThrow();
  });

  it.each([
    "mongodb://localhost:27017/reodite?replicaSet=rs0",
    "mongodb://localhost:27017/reodite_test%2F..%2Freodite?replicaSet=rs0",
    "mongodb://localhost:27017/reodite%5Ftest?replicaSet=rs0",
    "mongodb://cluster.example/reodite_test?replicaSet=rs0",
    "mongodb+srv://localhost/reodite_test",
  ])("rejects unsafe test URI %s", (uri) => {
    expect(() => validateMongoTestUri(uri)).toThrow("localhost and the reodite_test database");
  });
});
