import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { requireUser } from "@/src/server/auth";
import { modules } from "@/src/server/modules";
import { json, serverError } from "../../http";

const DATA_PATH = () => process.env.DATA_PATH || path.join(process.cwd(), "data");

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { name } = await params;
    const artifact = modules.flatMap((m) => m.geo ?? []).find((g) => g.name === name);
    if (!artifact) return json({ error: `Unknown geo artifact: ${name}` }, 404);

    const filePath = path.join(DATA_PATH(), artifact.path);
    if (!existsSync(filePath)) return json({ error: `File not found: ${name}` }, 404);

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: { "content-type": "application/geo+json" },
    });
  } catch (e) {
    return serverError(e);
  }
}
