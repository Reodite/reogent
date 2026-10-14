import { getAccount } from "@/src/server/account";
import { requireUser } from "@/src/server/auth";
import { json, serverError } from "../http";

/** Returns only the authenticated user's account details and activity totals. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const account = await getAccount(user.sub);
    return account ? json(account) : json({ error: "Account not found" }, 404);
  } catch (error) {
    return serverError(error);
  }
}
