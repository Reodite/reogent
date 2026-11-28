import { connectDatabase } from "./db";
import { DegreePlan } from "./db/models";

/** The caller's saved plan, or null when none exists. */
export async function getPlan(userId: string): Promise<unknown | null> {
  await connectDatabase();
  const saved = await DegreePlan.findById(userId).lean();
  return saved?.data ?? null;
}

/** Upserts the caller's plan. */
export async function savePlan(userId: string, data: unknown): Promise<void> {
  await connectDatabase();
  await DegreePlan.findOneAndUpdate(
    { _id: userId },
    { $set: { data, updatedAt: new Date() } },
    { upsert: true, runValidators: true },
  );
}
