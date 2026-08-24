import { uuid } from "@/src/lib/uuid";
import { streamAgent } from "@/src/server/agent/stream";
import { requireUser } from "@/src/server/auth";
import type { ActivityBlock } from "@/src/server/core/types";
import { validateChatRequest } from "@/src/server/core/validate";
import { modules } from "@/src/server/modules";
import { rateLimitResponse } from "@/src/server/rate-limit";
import { getSearch } from "@/src/server/search";
import { appendExchange } from "@/src/server/sessions/store";
import { generateSessionTitle } from "@/src/server/sessions/title";
import { json, requireJson, serverError } from "../http";

const MAX_BODY_BYTES = 256 * 1024; // 256 KB
const CHAT_LIMIT = { windowMs: 60_000, maxRequests: 20 };

export async function POST(request: Request): Promise<Response> {
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;

    // Reject oversized bodies before parsing
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return json({ error: "Request body exceeds 256 KB limit" }, 413);
    }

    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limited = rateLimitResponse(`chat:${user.sub}`, CHAT_LIMIT);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }
    const parsed = validateChatRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const sessionId = parsed.value.session_id ?? uuid();
    const lastUser = parsed.value.messages.findLast((m) => m.role === "user");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let doneEvent: {
            message: string;
            tool_calls: { name: string; input: Record<string, unknown>; result?: unknown }[];
            citations: {
              index: number;
              label: string;
              kind: string;
              used: boolean;
              source_url?: string;
              tool: string;
            }[];
            warning?: string;
            follow_ups?: string[];
          } | null = null;
          const activity: ActivityBlock[] = [];

          for await (const event of streamAgent(parsed.value.messages, { modules, search: getSearch() })) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            if (event.type === "thinking") {
              const last = activity[activity.length - 1];
              if (last?.type === "thinking") {
                last.content += event.delta;
              } else {
                activity.push({ type: "thinking", content: event.delta });
              }
            } else if (event.type === "tool_start") {
              activity.push({ type: "tool_call", content: event.name, input: event.input });
            } else if (event.type === "tool_end") {
              for (let j = activity.length - 1; j >= 0; j--) {
                if (
                  activity[j].type === "tool_call" &&
                  activity[j].content === event.name &&
                  activity[j].result === undefined
                ) {
                  activity[j].result = event.result;
                  break;
                }
              }
            } else if (event.type === "done") {
              doneEvent = event;
            }
          }

          // Persist after streaming completes
          if (doneEvent && lastUser) {
            await appendExchange(
              user.sub,
              sessionId,
              lastUser.content,
              doneEvent.message,
              activity.length > 0 ? activity : undefined,
              doneEvent.citations,
            );
            // Generate a proper title on first exchange (fire-and-forget)
            const isFirstExchange = parsed.value.messages.filter((m) => m.role === "user").length === 1;
            if (isFirstExchange) {
              generateSessionTitle(sessionId, lastUser.content, doneEvent.message);
            }
          }
        } catch (e) {
          // Strip file paths and internal details before sending to client
          const raw = e instanceof Error ? e.message : "Internal server error";
          const message = raw
            .replace(/\/[\w./-]+/g, "[path]")
            .replace(/at .+:\d+:\d+/g, "")
            .slice(0, 200);
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
