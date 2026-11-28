import { connectDatabase } from "./db";
import { Schedule } from "./db/models";

/** The caller's saved schedule, or null when none exists. */
export async function getSchedule(userId: string): Promise<unknown | null> {
  await connectDatabase();
  const saved = await Schedule.findById(userId).lean();
  return saved?.data ?? null;
}

/** Upserts the caller's schedule. */
export async function saveSchedule(userId: string, data: unknown): Promise<void> {
  await connectDatabase();
  await Schedule.findOneAndUpdate(
    { _id: userId },
    { $set: { data, updatedAt: new Date() } },
    { upsert: true, runValidators: true },
  );
}
