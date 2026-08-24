import { isToolError } from "@/src/shared/types";
import type { DatasetModule, SearchClient } from "../core/types";

export { isToolError };

const TOOL_TIMEOUT_MS = 30_000;

/** Dispatches a tool call across the module registry. Thrown errors, unknown
 *  tools, empty results, and timeouts all become `{ status: 'error', message }`. */
export async function executeTool(
  modules: DatasetModule[],
  name: string,
  input: Record<string, unknown>,
  search: SearchClient,
): Promise<unknown> {
  const tool = modules.flatMap((m) => m.tools).find((t) => t.spec.name === name);
  if (!tool) return { status: "error", message: `Unknown tool: ${name}` };
  try {
    const result = await Promise.race([
      tool.execute(input, search),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Tool timed out")), TOOL_TIMEOUT_MS)),
    ]);
    if (result == null || (Array.isArray(result) && result.length === 0)) {
      return { status: "error", message: `Tool ${name} returned no results` };
    }
    return result;
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : "";
    return { status: "error", message: message || `Tool ${name} failed` };
  }
}
