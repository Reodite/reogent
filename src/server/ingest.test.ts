import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MeilisearchApiError, type Meilisearch, type Task, type WaitOptions } from "meilisearch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";
import type { DatasetModule, DataWriter, IndexDef } from "./core/types";
import { recordIndexFreshness } from "./freshness";
import { runIngest } from "./ingest";

vi.mock("./freshness", () => ({ recordIndexFreshness: vi.fn() }));

function fixture(rowCount = 1) {
  const store: DataWriter = { getJson: vi.fn(), putJson: vi.fn() };
  const makeIndex = (name: string, settingsTask: number, documentTask: number, rows: number) => {
    let taskUid = documentTask;
    const definition = {
      index: name,
      settings: {
        searchableAttributes: ["title"],
        filterableAttributes: ["kind"],
        sortableAttributes: ["title"],
      },
      read: vi.fn(async function* () {
        for (let row = 0; row < rows; row++) {
          yield { id: `events.ubc.ca?id=${row}`, title: `Event ${row}`, kind: "event" };
        }
      }),
      transform: vi.fn((row: { id: string; title: string; kind: string }) => ({ id: row.id, doc: row })),
      derive: vi.fn<NonNullable<IndexDef["derive"]>>().mockResolvedValue(undefined),
    } satisfies IndexDef;
    return {
      definition,
      updateSettings: vi.fn().mockResolvedValue({ taskUid: settingsTask }),
      addDocuments: vi.fn(async (_docs: Record<string, unknown>[]) => ({ taskUid: taskUid++ })),
    };
  };
  const first = makeIndex("first", 2, 3, rowCount);
  const second = makeIndex("second", 102, 103, 1);
  const createIndex = vi.fn(async (name: string) => ({ taskUid: name === "first" ? 1 : 101 }));
  const waitForTask = vi.fn(
    async (uid: number, _options?: WaitOptions): Promise<Pick<Task, "uid" | "status" | "error">> => ({
      uid,
      status: "succeeded",
      error: null,
    }),
  );
  const search = {
    createIndex,
    index: vi.fn((name: string) => (name.startsWith("first") ? first : second)),
    tasks: { waitForTask },
  } as unknown as Meilisearch;
  const modules: DatasetModule[] = [{ name: "fixtures", indices: [first.definition, second.definition], tools: [] }];
  return { first, second, store, search, modules, createIndex, waitForTask };
}

function replacementFixture(rowCount = 1) {
  const f = fixture(rowCount);
  Object.assign(f.first.definition, { replace: true });
  f.createIndex.mockImplementation(async (name) => ({
    taskUid: name === "first" ? 1 : name.startsWith("first__") ? 5 : 101,
  }));
  const swapIndexes = vi.fn().mockResolvedValue({ taskUid: 6 });
  const deleteIndex = vi.fn().mockResolvedValue({ taskUid: 7 });
  Object.assign(f.search, { swapIndexes, deleteIndex });
  return { ...f, swapIndexes, deleteIndex };
}

beforeEach(() => {
  vi.mocked(recordIndexFreshness).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("ingest command environment", () => {
  it.each([
    { name: "loads the optional .env", envFile: true, inherited: false },
    { name: "preserves inherited overrides", envFile: true, inherited: true },
    { name: "accepts Docker environment without .env", envFile: false, inherited: true },
  ])(
    "$name",
    ({ envFile, inherited }) => {
      const [command, ...args] = packageJson.scripts.ingest.split(" ");
      expect(command).toBe("node");
      const directory = mkdtempSync(join(tmpdir(), "reodite-ingest-env-"));
      const fileValues = {
        MEILI_URL: "http://file.invalid",
        MEILI_MASTER_KEY: "dummy-file-key",
        DATA_PATH: "/dummy-file-data",
      };
      const inheritedValues = {
        MEILI_URL: "http://inherited.invalid",
        MEILI_MASTER_KEY: "dummy-inherited-key",
        DATA_PATH: "/dummy-inherited-data",
      };
      try {
        mkdirSync(join(directory, "scripts"));
        symlinkSync(new URL("../../node_modules", import.meta.url), join(directory, "node_modules"), "dir");
        writeFileSync(
          join(directory, "scripts/ingest.ts"),
          "const values: Record<string, string | undefined> = { MEILI_URL: process.env.MEILI_URL, MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY, DATA_PATH: process.env.DATA_PATH }; process.stdout.write(JSON.stringify(values));",
        );
        if (envFile) {
          writeFileSync(
            join(directory, ".env"),
            Object.entries(fileValues)
              .map(([key, value]) => `${key}=${value}`)
              .join("\n"),
          );
        }
        const output = execFileSync(process.execPath, args, {
          cwd: directory,
          env: inherited ? inheritedValues : {},
          encoding: "utf8",
          stdio: "pipe",
          timeout: 10_000,
        });
        expect(JSON.parse(output)).toEqual(inherited ? inheritedValues : fileValues);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    15_000,
  );
});

describe("ingest command arguments", () => {
  it("rejects unsupported arguments before indexing", () => {
    const [, ...args] = packageJson.scripts.ingest.split(" ");
    const result = spawnSync(process.execPath, [...args, "--unexpected"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      timeout: 15000,
      env: {
        MEILI_URL: "http://127.0.0.1:9",
        MEILI_MASTER_KEY: "synthetic-key",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Ingest does not accept arguments/);
    expect(result.stdout).not.toContain("created index");
  });
});

describe("runIngest", () => {
  it("awaits each task, batches sanitized documents, and finishes indexes sequentially", async () => {
    const f = fixture(501);

    await expect(runIngest(f.modules, f.search, f.store)).resolves.toBeUndefined();

    expect(f.createIndex.mock.calls).toEqual([
      ["first", { primaryKey: "id" }],
      ["second", { primaryKey: "id" }],
    ]);
    expect(f.waitForTask.mock.calls.map(([uid]) => uid)).toEqual([1, 2, 3, 4, 101, 102, 103]);
    expect(f.waitForTask.mock.calls.map(([, options]) => options)).toEqual(
      Array(7).fill({ timeout: 300_000, interval: 100 }),
    );
    expect(f.first.updateSettings).toHaveBeenCalledExactlyOnceWith(f.first.definition.settings);
    expect(f.first.addDocuments.mock.calls.map(([docs]) => docs.length)).toEqual([500, 1]);
    expect(f.first.addDocuments.mock.calls[0][0][0]).toEqual({
      id: "events_ubc_ca_id_0",
      title: "Event 0",
      kind: "event",
    });
    expect(f.first.addDocuments.mock.calls[1][0][0]).toEqual({
      id: "events_ubc_ca_id_500",
      title: "Event 500",
      kind: "event",
    });
    expect(f.first.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["first"], ["second"]]);
    expect(f.waitForTask.mock.invocationCallOrder[3]).toBeLessThan(
      f.first.definition.derive.mock.invocationCallOrder[0],
    );
    expect(f.first.definition.derive.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recordIndexFreshness).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(recordIndexFreshness).mock.invocationCallOrder[0]).toBeLessThan(
      f.createIndex.mock.invocationCallOrder[1],
    );
    expect(f.store.getJson).not.toHaveBeenCalled();
    expect(f.store.putJson).not.toHaveBeenCalled();
  });

  it.each(["queued", "HTTP"])("accepts only index_already_exists during %s creation", async (outcome) => {
    const f = fixture();
    const error = {
      message: "Index first already exists",
      code: "index_already_exists",
      type: "invalid_request",
      link: "https://example.invalid/errors#index_already_exists",
    };
    if (outcome === "queued") {
      f.waitForTask.mockImplementation(async (uid) => ({
        uid,
        status: uid === 1 ? "failed" : "succeeded",
        error: uid === 1 ? error : null,
      }));
    } else {
      f.createIndex.mockRejectedValueOnce(new MeilisearchApiError(new Response(null, { status: 400 }), error));
    }

    await expect(runIngest(f.modules, f.search, f.store)).resolves.toBeUndefined();

    expect(f.first.updateSettings).toHaveBeenCalledExactlyOnceWith(f.first.definition.settings);
    expect(f.first.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["first"], ["second"]]);
  });

  it.each([
    [
      "HTTP authorization",
      new MeilisearchApiError(new Response(null, { status: 403 }), {
        message: "Invalid API key",
        code: "invalid_api_key",
        type: "auth",
        link: "https://example.invalid/errors#invalid_api_key",
      }),
    ],
    ["network", new Error("Connection refused")],
    ["uncoded already-exists", new Error("Index already exists")],
  ])("rejects a %s creation failure after processing the next index", async (_label, error) => {
    const f = fixture();
    f.createIndex.mockRejectedValueOnce(error);

    await expect(runIngest(f.modules, f.search, f.store)).rejects.toMatchObject({
      errors: [expect.objectContaining({ cause: error, message: expect.stringContaining("first") })],
    });

    expect(f.first.updateSettings).not.toHaveBeenCalled();
    expect(f.first.addDocuments).not.toHaveBeenCalled();
    expect(f.first.definition.derive).not.toHaveBeenCalled();
    expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(f.createIndex).toHaveBeenCalledTimes(2);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["second"]]);
  });

  it.each([
    ["creation", 1, "failed", "invalid_index_uid"],
    ["settings", 2, "failed", "invalid_settings"],
    ["documents", 3, "failed", "invalid_document_id"],
    ["settings", 2, "failed", "index_already_exists"],
    ["documents", 3, "failed", "index_already_exists"],
    ["documents", 3, "canceled", null],
  ] as const)("rejects %s task %i (%s, %s) without deriving or stamping it", async (stage, taskUid, status, code) => {
    const f = fixture();
    const error = code
      ? { message: `${stage} rejected`, code, type: "invalid_request", link: "https://example.invalid/errors" }
      : null;
    f.waitForTask.mockImplementation(async (uid) => ({
      uid,
      status: uid === taskUid ? status : "succeeded",
      error: uid === taskUid ? error : null,
    }));

    await expect(runIngest(f.modules, f.search, f.store)).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: expect.stringContaining(error?.message ?? "canceled") })],
    });

    expect(f.first.updateSettings).toHaveBeenCalledTimes(stage === "creation" ? 0 : 1);
    expect(f.first.addDocuments).toHaveBeenCalledTimes(stage === "documents" ? 1 : 0);
    expect(f.first.definition.derive).not.toHaveBeenCalled();
    expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["second"]]);
  });

  it.each([1, 2])("collects %s derive failures after attempting both indexes", async (failures) => {
    const f = fixture();
    const errors = [new Error("First derive failed"), new Error("Second derive failed")];
    f.first.definition.derive.mockRejectedValueOnce(errors[0]);
    if (failures === 2) f.second.definition.derive.mockRejectedValueOnce(errors[1]);

    await expect(runIngest(f.modules, f.search, f.store)).rejects.toMatchObject({
      errors: errors.slice(0, failures).map((cause) => expect.objectContaining({ cause })),
    });

    expect(f.first.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual(failures === 1 ? [["second"]] : []);
  });

  it("loads a complete replacement before swapping it into the live index", async () => {
    const f = replacementFixture(501);

    await expect(runIngest(f.modules, f.search, f.store)).resolves.toBeUndefined();

    const staging = f.createIndex.mock.calls[0][0];
    expect(staging).toMatch(/^first__[a-f0-9-]+$/);
    expect(f.createIndex.mock.calls.map(([name]) => name)).toEqual([staging, "first", "second"]);
    expect(f.first.addDocuments.mock.calls.map(([docs]) => docs.length)).toEqual([500, 1]);
    expect(f.swapIndexes).toHaveBeenCalledExactlyOnceWith([{ indexes: ["first", staging], rename: false }]);
    expect(f.deleteIndex).toHaveBeenCalledExactlyOnceWith(staging);
    expect(f.waitForTask.mock.calls.map(([uid]) => uid)).toEqual([5, 2, 3, 4, 1, 6, 7, 101, 102, 103]);
    expect(f.first.definition.derive.mock.invocationCallOrder[0]).toBeLessThan(
      f.swapIndexes.mock.invocationCallOrder[0],
    );
    expect(f.swapIndexes.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recordIndexFreshness).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["first"], ["second"]]);
  });

  it.each(["read", "transform", "documents", "derive", "swap"])(
    "cleans up a failed replacement %s without stamping it",
    async (stage) => {
      const f = replacementFixture();
      const error = new Error(`${stage} failed`);
      if (stage === "read") {
        f.first.definition.read.mockImplementation(async function* () {
          yield { id: "one", title: "First row", kind: "event" };
          throw error;
        });
      } else if (stage === "transform")
        f.first.definition.transform.mockImplementation(() => {
          throw error;
        });
      else if (stage === "documents") f.first.addDocuments.mockRejectedValueOnce(error);
      else if (stage === "derive") f.first.definition.derive.mockRejectedValueOnce(error);
      else f.swapIndexes.mockRejectedValueOnce(error);

      await expect(runIngest(f.modules, f.search, f.store)).rejects.toMatchObject({
        errors: [expect.objectContaining({ cause: error })],
      });

      const staging = f.createIndex.mock.calls[0][0];
      expect(staging).toMatch(/^first__/);
      expect(f.deleteIndex).toHaveBeenCalledExactlyOnceWith(staging);
      expect(f.swapIndexes).toHaveBeenCalledTimes(stage === "swap" ? 1 : 0);
      expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
      expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["second"]]);
    },
  );

  it("publishes an empty snapshot rather than retaining removed dated records", async () => {
    const f = replacementFixture(0);

    await expect(runIngest(f.modules, f.search, f.store)).resolves.toBeUndefined();

    expect(f.first.addDocuments).not.toHaveBeenCalled();
    expect(f.swapIndexes).toHaveBeenCalledOnce();
    expect(f.deleteIndex).toHaveBeenCalledExactlyOnceWith(f.createIndex.mock.calls[0][0]);
    expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["first"], ["second"]]);
  });

  it.each([
    ["creation", 5],
    ["swap", 6],
    ["cleanup", 7],
  ] as const)("reports queued replacement %s failures and attempts other indexes", async (stage, failedTask) => {
    const f = replacementFixture();
    f.waitForTask.mockImplementation(async (uid) => ({
      uid,
      status: uid === failedTask ? "failed" : "succeeded",
      error:
        uid === failedTask
          ? {
              message: `${stage} rejected`,
              code: "task_failed",
              type: "invalid_request",
              link: "https://example.invalid/error",
            }
          : null,
    }));

    await expect(runIngest(f.modules, f.search, f.store)).rejects.toThrow("Ingest failed");

    expect(f.swapIndexes).toHaveBeenCalledTimes(stage === "creation" ? 0 : 1);
    expect(f.deleteIndex).toHaveBeenCalledTimes(stage === "creation" ? 0 : 1);
    expect(f.deleteIndex).not.toHaveBeenCalledWith("first");
    expect(f.second.definition.derive).toHaveBeenCalledExactlyOnceWith(f.store);
    if (stage !== "cleanup") expect(vi.mocked(recordIndexFreshness).mock.calls).toEqual([["second"]]);
  });
});
