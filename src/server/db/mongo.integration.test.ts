import mongoose, { Schema } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const uri = process.env.MONGODB_TEST_URI;
const collectionName = `reodite_integration_${process.pid}_${Date.now()}`;
const recordSchema = new Schema({ value: { type: Number, required: true } }, { collection: collectionName });
const Record = mongoose.model(`ReoditeIntegration_${process.pid}_${Date.now()}`, recordSchema);

describe.skipIf(!uri)("MongoDB replica-set integration", () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string, { serverSelectionTimeoutMS: 5_000 });
  });

  afterAll(async () => {
    await Record.collection.drop().catch(() => {});
    await mongoose.disconnect();
  });

  it("commits and aborts multi-document transactions", async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Record.create([{ value: 1 }, { value: 2 }], { ordered: true, session });
      });
      expect((await Record.find().sort({ value: 1 }).lean()).map(({ value }) => value)).toEqual([1, 2]);

      await expect(
        session.withTransaction(async () => {
          await Record.create([{ value: 3 }], { ordered: true, session });
          throw new Error("abort transaction");
        }),
      ).rejects.toThrow("abort transaction");
      await expect(Record.countDocuments()).resolves.toBe(2);
    } finally {
      await session.endSession();
    }
  });

  it("enforces unique indexes on the connected Mongo server", async () => {
    await Record.collection.createIndex({ value: 1 }, { unique: true });
    await Record.create({ value: 4 });
    await expect(Record.create({ value: 4 })).rejects.toMatchObject({ code: 11000 });
  });
});
