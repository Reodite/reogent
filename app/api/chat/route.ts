import { uuid } from "@/src/lib/uuid";
import { streamAgent } from "@/src/server/agent/stream";
import { requireUser } from "@/src/server/auth";
import type { ActivityBlock } from "@/src/server/core/types";
import { validateChatRequest } from "@/src/server/core/validate";
import { modules } from "@/src/server/modules";
import { getProfile } from "@/src/server/profile";
import { rateLimitResponse } from "@/src/server/rate-limit";
import { createCapacityLimit, MAX_TIMER_MS, positiveIntegerEnv } from "@/src/server/resource-limits";
import { getSearch } from "@/src/server/search";
import { appendExchange, canWriteSession } from "@/src/server/sessions/store";
import { generateSessionTitle } from "@/src/server/sessions/title";
import { json, readJson, requireJson, serverError } from "../http";

const MAX_BODY_BYTES = 256 * 1024;
const CHAT_LIMIT = { windowMs: 60_000, maxRequests: 20 };
const acquireChat = createCapacityLimit(positiveIntegerEnv("CHAT_MAX_CONCURRENT", 8));
const CHAT_TIMEOUT_MS = positiveIntegerEnv("CHAT_TIMEOUT_MS", 180_000, MAX_TIMER_MS);
const FAILURE_MESSAGE = "Could not complete the response. Please try again.";

export async function POST(request: Request): Promise<Response> {
  let cleanup: (() => Promise<void>) | undefined;
  let timedOut = false;
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limited = rateLimitResponse(`chat:${user.sub}`, CHAT_LIMIT);
    if (limited) return limited;

    const result = await readJson(request, MAX_BODY_BYTES);
    if (result instanceof Response) return result;
    const parsed = validateChatRequest(result.body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    if (parsed.value.session_id && !(await canWriteSession(user.sub, parsed.value.session_id))) {
      return json({ error: "Session not found" }, 404);
    }

    const release = acquireChat();
    if (!release) {
      const response = json({ error: "The assistant is busy. Please try again." }, 503);
      response.headers.set("Retry-After", "1");
      return response;
    }

    const owner = new AbortController();
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let iterator: ReturnType<typeof streamAgent> | undefined;
    let profileLoad: ReturnType<typeof getProfile> | undefined;
    let saving: Promise<void> | undefined;
    let finishing: Promise<void> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let clientCancelled = false;

    const close = () => {
      if (closed || !controller) return;
      closed = true;
      controller.close();
    };
    const fail = () => {
      if (!closed && !clientCancelled && controller && (controller.desiredSize ?? 0) > 0) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: FAILURE_MESSAGE })}\n`));
      }
      close();
    };
    const onClientAbort = () => {
      clientCancelled = true;
      owner.abort(request.signal.reason);
      close();
      void finish();
    };
    const finish = (): Promise<void> => {
      finishing ??= (async () => {
        clearTimeout(deadline);
        request.signal.removeEventListener("abort", onClientAbort);
        owner.abort();
        try {
          await profileLoad;
        } catch {
          // Profile failure does not change exchange cleanup.
        }
        try {
          await iterator?.return?.(undefined);
        } catch {
          // Preserve the primary failure if iterator cleanup fails.
        }
        try {
          await saving;
        } catch {
          // Leave failure handling to pull without retrying the write.
        }
        release();
      })();
      return finishing;
    };
    cleanup = finish;
    deadline = setTimeout(() => {
      timedOut = true;
      owner.abort(new Error("Chat deadline exceeded"));
      fail();
      void finish();
    }, CHAT_TIMEOUT_MS);
    request.signal.addEventListener("abort", onClientAbort, { once: true });
    if (request.signal.aborted) onClientAbort();
    owner.signal.throwIfAborted();

    const sessionId = parsed.value.session_id ?? uuid();
    const lastUser = parsed.value.messages.findLast((message) => message.role === "user");
    const isFirstExchange = parsed.value.messages.filter((message) => message.role === "user").length === 1;
    // Missing or unreadable profiles only remove prompt defaults.
    profileLoad = getProfile(user.sub).catch((error: unknown) => {
      console.warn("profile load failed", error instanceof Error ? error.message : error);
      return null;
    });
    const profile = await profileLoad;
    owner.signal.throwIfAborted();
    const agent = streamAgent(parsed.value.messages, { modules, search: getSearch(), profile, signal: owner.signal })[
      Symbol.asyncIterator
    ]();
    iterator = agent;
    const activity: ActivityBlock[] = [];

    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      async pull(value) {
        try {
          owner.signal.throwIfAborted();
          const next = await agent.next();
          owner.signal.throwIfAborted();
          if (next.done) throw new Error("Agent stream ended without completion");
          const event = next.value;
          if (event.type === "thinking") {
            const last = activity[activity.length - 1];
            if (last?.type === "thinking") last.content += event.delta;
            else activity.push({ type: "thinking", content: event.delta });
          } else if (event.type === "tool_start") {
            activity.push({ type: "tool_call", content: event.name, input: event.input });
          } else if (event.type === "tool_end") {
            const pending = activity.findLast(
              (block) => block.type === "tool_call" && block.content === event.name && block.result === undefined,
            );
            if (pending) pending.result = event.result;
          } else if (event.type === "done") {
            clearTimeout(deadline);
            // Finish one owner-gated save after completion, even if the reader disconnects.
            if (lastUser) {
              saving = appendExchange(
                user.sub,
                sessionId,
                lastUser.content,
                event.message,
                activity.length > 0 ? activity : undefined,
                event.citations,
              ).then(() => {
                if (isFirstExchange) generateSessionTitle(user.sub, sessionId, lastUser.content, event.message);
              });
            }
            await saving;
          }
          if (!closed) value.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          if (event.type === "done" || event.type === "error") {
            await finish();
            close();
          }
        } catch {
          fail();
          await finish();
        }
      },
      cancel(reason) {
        closed = true;
        clientCancelled = true;
        owner.abort(reason);
        return finish();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    await cleanup?.();
    return timedOut ? json({ error: FAILURE_MESSAGE }, 504) : serverError(error);
  }
}
