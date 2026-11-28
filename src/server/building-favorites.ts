import { BuildingFavorite } from "./db/models";

export async function listBuildingFavorites(userId: string): Promise<string[]> {
  const favorites = await BuildingFavorite.find({ userId }).sort({ createdAt: -1, buildingCode: 1 }).lean();
  return favorites.map(({ buildingCode }) => String(buildingCode));
}

/** Applies the requested saved state idempotently and returns the account's ordered codes. */
export async function setBuildingFavorite(userId: string, buildingCode: string, saved: boolean): Promise<string[]> {
  if (saved) {
    try {
      await BuildingFavorite.updateOne(
        { userId, buildingCode },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
    }
  } else {
    await BuildingFavorite.deleteOne({ userId, buildingCode });
  }
  return listBuildingFavorites(userId);
}
