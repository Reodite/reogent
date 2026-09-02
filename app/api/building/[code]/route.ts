import { loadBuildingDetails } from "@/src/server/building-details";
import { getSearch } from "@/src/server/search";
import { json, serverError } from "../../http";

/** Returns one public building record with independently recoverable source sections. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const { code } = await params;
    try {
      return json(await loadBuildingDetails(getSearch(), code, new Date()));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown building:")) {
        return json({ error: error.message }, 404);
      }
      throw error;
    }
  } catch (error) {
    return serverError(error);
  }
}
