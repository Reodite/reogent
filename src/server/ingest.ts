import { randomUUID } from "node:crypto";
import type { EnqueuedTask, Meilisearch } from "meilisearch";
import type { DatasetModule, DataWriter } from "./core/types";
import { recordIndexFreshness } from "./freshness";
import { positiveIntegerEnv } from "./resource-limits";

const BATCH_DOCS = 500;

/** Meilisearch IDs must be alphanumeric, hyphens, or underscores only. */
export function sanitizeMeiliId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Indexes datasets sequentially and atomically swaps complete replacement snapshots.
 * Checks Meilisearch tasks, removes temporary indexes, and aggregates failures after attempting other indexes.
 */
export async function runIngest(modules: DatasetModule[], search: Meilisearch, store: DataWriter): Promise<void> {
  const batchTargetBytes = positiveIntegerEnv("INGEST_BATCH_BYTES", 8 * 1024 * 1024);
  const maxRequestBytes = positiveIntegerEnv("INGEST_MAX_REQUEST_BYTES", 100_000_000);
  if (batchTargetBytes > maxRequestBytes) {
    throw new Error("INGEST_BATCH_BYTES must not exceed INGEST_MAX_REQUEST_BYTES");
  }
  const failures: Error[] = [];
  const waitForTask = async (task: Promise<EnqueuedTask>) => {
    const result = await search.tasks.waitForTask((await task).taskUid, { timeout: 300_000, interval: 100 });
    if (result.status !== "succeeded") {
      throw new Error(`Task ${result.uid} ${result.status}: ${result.error?.message ?? "No error details"}`, {
        cause: result.error,
      });
    }
  };

  const ensureIndex = async (name: string) => {
    try {
      await waitForTask(search.createIndex(name, { primaryKey: "id" }));
      console.log(`${name}: created index`);
    } catch (e) {
      const cause = e instanceof Error ? e.cause : null;
      if (typeof cause !== "object" || cause === null || !("code" in cause) || cause.code !== "index_already_exists") {
        throw e;
      }
    }
  };

  for (const module of modules) {
    for (const idx of module.indices) {
      const target = idx.replace ? `${idx.index}__${randomUUID()}` : idx.index;
      let temporaryCreated = false;
      try {
        if (idx.replace) {
          await waitForTask(search.createIndex(target, { primaryKey: "id" }));
          temporaryCreated = true;
        } else {
          await ensureIndex(target);
        }

        const index = search.index(target);
        await waitForTask(
          index.updateSettings({
            searchableAttributes: idx.settings.searchableAttributes,
            filterableAttributes: idx.settings.filterableAttributes,
            sortableAttributes: idx.settings.sortableAttributes,
          }),
        );

        let batch: Record<string, unknown>[] = [];
        let batchBytes = 2; // JSON array brackets.
        let count = 0;

        const flush = async () => {
          if (batch.length === 0) return;
          await waitForTask(index.addDocuments(batch));
          batch = [];
          batchBytes = 2;
        };

        for await (const raw of idx.read(store)) {
          const t = idx.transform(raw);
          if (!t) continue;
          // The sanitized id must win the spread: several docs carry their own
          // `id` field (events use "events.ubc.ca?id=N") which would otherwise
          // override the sanitized primary key and make Meilisearch reject the
          // batch with an invalid-document-identifier error.
          const doc = { ...t.doc, id: sanitizeMeiliId(t.id) };
          const docBytes = Buffer.byteLength(JSON.stringify(doc), "utf8");
          if (docBytes + 2 > maxRequestBytes) {
            throw new Error(
              `document ${doc.id} requires ${docBytes + 2} bytes, exceeding INGEST_MAX_REQUEST_BYTES (${maxRequestBytes})`,
            );
          }
          if (batch.length > 0 && batchBytes + 1 + docBytes > batchTargetBytes) await flush();
          batchBytes += docBytes + (batch.length > 0 ? 1 : 0);
          batch.push(doc);
          count++;
          if (batch.length >= BATCH_DOCS || batchBytes >= batchTargetBytes) await flush();
        }
        await flush();

        if (idx.derive) {
          await idx.derive(store);
          console.log(`${idx.index}: derived artifacts written`);
        }
        if (idx.replace) {
          await ensureIndex(idx.index);
          await waitForTask(search.swapIndexes([{ indexes: [idx.index, target], rename: false }]));
        }

        // Freshness describes the completed snapshot; cleanup errors do not roll it back.
        await recordIndexFreshness(idx.index);
        console.log(`${idx.index}: indexed ${count} docs`);
      } catch (e) {
        const error = new Error(`${idx.index}: failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        failures.push(error);
        console.error(error.message);
      } finally {
        if (temporaryCreated) {
          try {
            await waitForTask(search.deleteIndex(target));
          } catch (e) {
            const error = new Error(
              `${idx.index}: cleanup failed for ${target}: ${e instanceof Error ? e.message : String(e)}`,
              { cause: e },
            );
            failures.push(error);
            console.error(error.message);
          }
        }
      }
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Ingest failed");
}
