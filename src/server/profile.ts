import type { StudentProfile } from "@/src/shared/profile";
import { connectDatabase } from "./db";
import { UserProfile } from "./db/models";

/** Returns the saved profile without unsupported appearance values, or null when none exists. */
export async function getProfile(userId: string): Promise<StudentProfile | null> {
  await connectDatabase();
  const saved = await UserProfile.findById(userId).lean();
  if (!saved) return null;
  const { theme, ...profile } = saved.data as StudentProfile;
  return theme === "light" || theme === "dark" ? { ...profile, theme } : profile;
}

/** Upserts the caller's profile. */
export async function saveProfile(userId: string, data: StudentProfile): Promise<void> {
  await connectDatabase();
  await UserProfile.findOneAndUpdate(
    { _id: userId },
    { $set: { data, updatedAt: new Date() } },
    { upsert: true, runValidators: true },
  );
}
