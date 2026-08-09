import { requireUser } from "@/src/server/auth";
import { deleteSession, getSessionMessages, renameSession } from "@/src/server/sessions/store";
import { json, requireJson, serverError } from "../../http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { id } = await params;
    const messages = await getSessionMessages(user.sub, id);
    if (messages === null) return json({ error: "Session not found" }, 404);
    return json(messages);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { id } = await params;
    const deleted = await deleteSession(user.sub, id);
    if (!deleted) return json({ error: "Session not found" }, 404);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { title } = body as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) return json({ error: "Title is required" }, 400);
    const renamed = await renameSession(user.sub, id, title.trim().slice(0, 80));
    if (!renamed) return json({ error: "Session not found" }, 404);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
