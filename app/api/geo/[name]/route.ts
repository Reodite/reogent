import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { dataPath } from "@/src/server/data";
import { modules } from "@/src/server/modules";
import { json, serverError } from "../../http";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  try {
    const { name } = await params;
    const artifact = modules.flatMap((module) => module.geo ?? []).find((entry) => entry.name === name);
    if (!artifact) return json({ error: `Unknown geo artifact: ${name}` }, 404);
    if (artifact.load) {
      return Response.json(await artifact.load(), { headers: { "cache-control": "public, max-age=300" } });
    }
    if (!artifact.path) return json({ error: `File not found: ${name}` }, 404);

    const filePath = path.join(dataPath(), artifact.path);
    if (!existsSync(filePath)) return json({ error: `File not found: ${name}` }, 404);

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: { "cache-control": "public, max-age=300", "content-type": "application/geo+json" },
    });
  } catch (e) {
    return serverError(e);
  }
}
