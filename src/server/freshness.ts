import { dataStore } from "./data";

/** Tracks when each search index was last (re)built, so tools can label
 *  responses with the snapshot date instead of presenting stale statuses,
 *  rates, or requirements as current facts. */

const META_KEY = "derived/dataset-meta.json";
const CACHE_TTL_MS = 10 * 60 * 1000;

type Meta = Record<string, string>;

let cache: Meta | undefined;
let cacheAt = 0;

async function readMeta(): Promise<Meta> {
  if (!cache || Date.now() - cacheAt > CACHE_TTL_MS) {
    cache =
      ((await dataStore()
        .getJson(META_KEY)
        .catch(() => ({}))) as Meta) ?? {};
    cacheAt = Date.now();
  }
  return cache;
}

/** Called by the ingest pipeline after an index is rebuilt. */
export async function recordIndexFreshness(index: string, at = new Date()): Promise<void> {
  const meta = await readMeta();
  meta[index] = at.toISOString();
  const next: Meta = { ...meta };
  // Bypass the TTL so a fresh record is immediately visible.
  cache = next;
  cacheAt = Date.now();
  await dataStore().putJson(META_KEY, next);
}

/** ISO timestamp of when the index was last ingested, or null when unknown. */
export async function getIndexFreshness(index: string): Promise<string | null> {
  return (await readMeta())[index] ?? null;
}
