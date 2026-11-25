import { Meilisearch } from "meilisearch";

let client: Meilisearch | undefined;

const host = () => process.env.MEILI_URL || "http://localhost:7700";

function readKey(): string {
  const key = process.env.MEILI_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MEILI_API_KEY is not set; create a read-only Meilisearch key (see README)");
  }
  return process.env.MEILI_MASTER_KEY || "";
}

/**
 * Returns the shared Meilisearch client for request handling. Uses the
 * read-only MEILI_API_KEY; outside production it falls back to
 * MEILI_MASTER_KEY. Throws in production when MEILI_API_KEY is unset.
 */
export function getSearch(): Meilisearch {
  client ??= new Meilisearch({ host: host(), apiKey: readKey() });
  return client;
}

/** Returns a client holding MEILI_MASTER_KEY for index writes. Operator scripts only. */
export function getAdminSearch(): Meilisearch {
  return new Meilisearch({ host: host(), apiKey: process.env.MEILI_MASTER_KEY || "" });
}
