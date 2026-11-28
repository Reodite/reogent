import { uuid } from "@/src/lib/uuid";
import { consumeDailyChatMessage, DAILY_CHAT_LIMIT, recordTokenUsage } from "@/src/server/account";
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

const MAX_BODY_BYTES = 256 * 1024; // 256 KB
const CHAT_LIMIT = { windowMs: 60_000, maxRequests: 20 };
const acquireChat = createCapacityLimit(positiveIntegerEnv("CHAT_MAX_CONCURRENT", 8));
const CHAT_TIMEOUT_MS = positiveIntegerEnv("CHAT_TIMEOUT_MS", 180_000, MAX_TIMER_MS);
const FAILURE_MESSAGE = "Could not complete the response. Please try again.";

export async function POST(request: Request): Promise<Response> {
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limited = rateLimitResponse(`chat:${user.sub}`, CHAT_LIMIT);
    if (limited) return limited;

    const result = await readJson(request, MAX_BODY_BYTES);
    if (result instanceof Response) return result;
    const { body } = result;
    const parsed = validateChatRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    if (parsed.value.session_id && !(await canWriteSession(user.sub, parsed.value.session_id))) {
      return json({ error: "Session not found" }, 404);
    }
    if (!(await consumeDailyChatMessage(user.sub))) {
      return json(
        {
          error: `You've used all ${DAILY_CHAT_LIMIT} messages for today. You can send more after midnight Pacific time.`,
        },
        429,
      );
    }

    const releaseCapacity = acquireChat();
    if (!releaseCapacity) {
      const response = json({ error: "The assistant is busy. Please try again." }, 503);
      response.headers.set("Retry-After", "1");
      return response;
    }

    const sessionId = parsed.value.session_id ?? uuid();
    const lastUser = parsed.value.messages.findLast((m) => m.role === "user");
    const owner = new AbortController();
    const deadline = setTimeout(() => owner.abort(new Error("Chat deadline exceeded")), CHAT_TIMEOUT_MS);
    const abortOwner = () => owner.abort(request.signal.reason);
    request.signal.addEventListener("abort", abortOwner, { once: true });
    if (request.signal.aborted) abortOwner();
    // An unreadable profile (no row, no DB, non-UUID dev user) only means no
    // defaults in the prompt; it never blocks the chat.
    let profile: Awaited<ReturnType<typeof getProfile>>;
    let rejectProfileOnAbort: (() => void) | undefined;
    try {
      profile = await Promise.race([
        getProfile(user.sub).catch((e: unknown) => {
          console.warn("profile load failed", e instanceof Error ? e.message : e);
          return null;
        }),
        new Promise<never>((_, reject) => {
          rejectProfileOnAbort = () => reject(owner.signal.reason ?? new Error("Chat setup aborted"));
          if (owner.signal.aborted) rejectProfileOnAbort();
          else owner.signal.addEventListener("abort", rejectProfileOnAbort, { once: true });
        }),
      ]);
    } catch (error) {
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", abortOwner);
      releaseCapacity();
      if (request.signal.aborted) return new Response(null, { status: 204 });
      if (owner.signal.aborted) return json({ error: FAILURE_MESSAGE }, 504);
      throw error;
    } finally {
      if (rejectProfileOnAbort) owner.signal.removeEventListener("abort", rejectProfileOnAbort);
    }

    const encoder = new TextEncoder();
    let iterator: ReturnType<typeof streamAgent>;
    try {
      iterator = streamAgent(parsed.value.messages, {
        modules,
        search: getSearch(),
        profile,
        signal: owner.signal,
      })[Symbol.asyncIterator]();
    } catch (error) {
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", abortOwner);
      releaseCapacity();
      throw error;
    }
    const activity: ActivityBlock[] = [];
    const isFirstExchange = parsed.value.messages.filter((m) => m.role === "user").length === 1;
    let closed = false;
    let clientCancelled = false;
    let persistencePending = false;
    let cleanup: Promise<void> | undefined;
    let finalized = false;
    const finalize = () => {
      if (finalized || persistencePending) return;
      finalized = true;
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", abortOwner);
      releaseCapacity();
    };
    const cleanupIterator = () => {
      cleanup ??= (async () => {
        try {
          await iterator.return?.(undefined);
        } catch {
          // Preserve the primary stream result if iterator cleanup fails.
        }
      })();
      return cleanup;
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          let event: Awaited<ReturnType<typeof iterator.next>>["value"];
          do {
            owner.signal.throwIfAborted();
            const next = await iterator.next();
            owner.signal.throwIfAborted();
            if (next.done) {
              await cleanupIterator();
              closed = true;
              controller.close();
              return;
            }
            event = next.value;
            if (event.type === "usage") {
              recordTokenUsage(user.sub, event.totalTokens).catch((e: unknown) => {
                console.error("token usage write failed", e instanceof Error ? e.message : e);
              });
            }
          } while (event.type === "usage");
          if (event.type === "thinking") {
            const last = activity[activity.length - 1];
            if (last?.type === "thinking") last.content += event.delta;
            else activity.push({ type: "thinking", content: event.delta });
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
          }
          if (event.type === "done") {
            if (lastUser) {
              persistencePending = true;
              try {
                await appendExchange(
                  user.sub,
                  sessionId,
                  lastUser.content,
                  event.message,
                  activity.length > 0 ? activity : undefined,
                  event.citations,
                );
              } finally {
                persistencePending = false;
                if (clientCancelled || request.signal.aborted || owner.signal.aborted) finalize();
              }
            }
            if (clientCancelled || request.signal.aborted || owner.signal.aborted) {
              await cleanupIterator();
              return;
            }
            if (closed) return;
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            if (lastUser) {
              if (isFirstExchange && !clientCancelled) {
                generateSessionTitle(user.sub, sessionId, lastUser.content, event.message);
              }
            }
            await cleanupIterator();
            finalize();
            if (!closed) {
              closed = true;
              controller.close();
            }
          } else if (event.type === "error") {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            await cleanupIterator();
            finalize();
            if (!closed) {
              closed = true;
              controller.close();
            }
          } else {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          if (!owner.signal.aborted) owner.abort(error);
          await cleanupIterator();
          finalize();
          if (!clientCancelled && !request.signal.aborted) {
            if (!closed)
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: FAILURE_MESSAGE })}\n`));
          }
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      async cancel(reason) {
        clientCancelled = true;
        closed = true;
        owner.abort(reason);
        await cleanupIterator();
        finalize();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
