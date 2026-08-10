import type { MeiliSearch } from "meilisearch";
import type { DatasetModule, DataWriter } from "./core/types";

const BATCH_DOCS = 500;

/** Meilisearch IDs must be alphanumeric, hyphens, or underscores only. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Indexes all dataset modules into Meilisearch. Creates indexes if absent,
 *  applies settings, then adds documents in batches. */
export async function runIngest(modules: DatasetModule[], search: MeiliSearch, store: DataWriter): Promise<void> {
  for (const module of modules) {
    for (const idx of module.indices) {
      try {
        // Create or update index
        try {
          await search.createIndex(idx.index, { primaryKey: "id" });
          console.log(`${idx.index}: created index`);
        } catch {
          // Index already exists
        }

        const index = search.index(idx.index);
        await index.updateSettings({
          searchableAttributes: idx.settings.searchableAttributes,
          filterableAttributes: idx.settings.filterableAttributes,
          sortableAttributes: idx.settings.sortableAttributes,
        });

        // Batch documents
        let batch: Record<string, unknown>[] = [];
        let count = 0;

        const flush = async () => {
          if (batch.length === 0) return;
          const task = await index.addDocuments(batch);
          await search.waitForTask(task.taskUid);
          batch = [];
        };

        for await (const raw of idx.read(store)) {
          const t = idx.transform(raw);
          if (!t) continue;
          batch.push({ id: sanitizeId(t.id), ...t.doc });
          count++;
          if (batch.length >= BATCH_DOCS) await flush();
        }
        await flush();
        console.log(`${idx.index}: indexed ${count} docs`);

        if (idx.derive) {
          await idx.derive(store);
          console.log(`${idx.index}: derived artifacts written`);
        }
      } catch (e) {
        console.error(`${idx.index}: failed — ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
