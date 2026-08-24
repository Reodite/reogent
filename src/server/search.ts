import { Meilisearch } from "meilisearch";

let client: Meilisearch | undefined;

/** Returns a shared Meilisearch client. Reads MEILI_URL and MEILI_MASTER_KEY from env. */
export function getSearch(): Meilisearch {
  client ??= new Meilisearch({
    host: process.env.MEILI_URL || "http://localhost:7700",
    apiKey: process.env.MEILI_MASTER_KEY || "",
  });
  return client;
}
