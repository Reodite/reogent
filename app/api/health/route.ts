import { connectDatabase } from "@/src/server/db";
import { getSearch } from "@/src/server/search";

const reachable = (check: () => Promise<unknown>) =>
  Promise.resolve()
    .then(check)
    .then(
      () => true,
      () => false,
    );

/** GET /api/health: 200 when MongoDB and Meilisearch respond, otherwise 503. Reports no error details. */
export async function GET(): Promise<Response> {
  const [database, search] = await Promise.all([
    reachable(async () => (await connectDatabase()).connection.db?.admin().ping()),
    reachable(() => getSearch().health()),
  ]);
  return Response.json(
    { database, search },
    { status: database && search ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
