// Typed client for the /api/* contract (api-spec.md). `createChatApi` returns
// the HTTP implementation. GeoJSON responses are cached client-side after the
// first fetch.

import {
  ApiError,
  type BuildingDetails,
  type ChatMessage,
  type ChatResponse,
  type GeoName,
  type RouteResponse,
  type SessionSummary,
} from "@/src/lib/api-types";
import type { FeatureCollection } from "geojson";

export interface ChatApi {
  /** POST /api/chat — streams NDJSON events; calls onDelta for text, returns final ChatResponse. */
  chat(
    sessionId: string,
    messages: ChatMessage[],
    callbacks?: {
      onDelta?: (text: string) => void;
      onTextClear?: () => void;
      onThinking?: (text: string) => void;
      onToolStart?: (name: string, input: Record<string, unknown>) => void;
      onToolEnd?: (name: string, result: unknown) => void;
      onTurnStart?: () => void;
    },
    signal?: AbortSignal,
  ): Promise<ChatResponse>;
  /** GET /api/sessions — caller's sessions, most recently updated first. */
  listSessions(): Promise<SessionSummary[]>;
  /** GET /api/sessions/{id} — messages in chronological order; 404 if not the caller's. */
  getSession(id: string): Promise<ChatMessage[]>;
  /** DELETE /api/sessions/{id} — delete a session and its messages. */
  deleteSession(id: string): Promise<void>;
  /** PATCH /api/sessions/{id} — rename a session. */
  renameSession(id: string, title: string): Promise<void>;
  /** GET /api/geo/{name} — GeoJSON FeatureCollection. */
  getGeo(name: GeoName): Promise<FeatureCollection>;
  /** GET /api/route?from=&to= — walking route with the polyline the map draws. */
  getRoute(from: string, to: string): Promise<RouteResponse>;
  /** GET /api/building/{code} — popup details: rooms, POIs, availability. */
  getBuildingDetails(code: string): Promise<BuildingDetails>;
}

export interface ChatApiOptions {
  /** Returns the app session token (JWT), or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Called once per 401 so the app can redirect to sign-in. */
  onUnauthorized?: () => void;
  baseUrl?: string;
}

export function createChatApi(options: ChatApiOptions): ChatApi {
  return withGeoCache(createHttpApi(options));
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `Request failed with status ${response.status}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) message = body.error;
  } catch {
    // Non-JSON error body; keep the status message.
  }
  return new ApiError(response.status, message);
}

function createHttpApi({ getToken, onUnauthorized, baseUrl = "/api" }: ChatApiOptions): ChatApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    if (!token) {
      onUnauthorized?.();
      throw new ApiError(401, "Not signed in");
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const error = await parseError(response);
      if (error.status === 401) onUnauthorized?.();
      throw error;
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function chatStream(
    sessionId: string,
    messages: ChatMessage[],
    callbacks?: {
      onDelta?: (text: string) => void;
      onTextClear?: () => void;
      onThinking?: (text: string) => void;
      onToolStart?: (name: string, input: Record<string, unknown>) => void;
      onToolEnd?: (name: string, result: unknown) => void;
      onTurnStart?: () => void;
    },
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const token = await getToken();
    if (!token) {
      onUnauthorized?.();
      throw new ApiError(401, "Not signed in");
    }
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId, messages }),
      signal,
    });
    if (!response.ok) {
      const error = await parseError(response);
      if (error.status === 401) onUnauthorized?.();
      throw error;
    }
    if (!response.body) throw new ApiError(500, "No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: ChatResponse | null = null;
    const STALL_TIMEOUT_MS = 60_000;
    const MAX_LINE_BYTES = 1_048_576; // 1 MB

    for (;;) {
      // Abort if no data arrives within 60s
      const readPromise = reader.read();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ApiError(504, "Stream stalled — no data received for 60s")), STALL_TIMEOUT_MS),
      );
      const { done, value } = await Promise.race([readPromise, timeout]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Guard against unbounded single-line buffering
      if (buffer.length > MAX_LINE_BYTES) {
        reader.cancel();
        throw new ApiError(500, "Stream line exceeded 1 MB limit");
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "text" && callbacks?.onDelta) {
            callbacks.onDelta(event.delta);
          } else if (event.type === "text_clear" && callbacks?.onTextClear) {
            callbacks.onTextClear();
          } else if (event.type === "thinking" && callbacks?.onThinking) {
            callbacks.onThinking(event.delta);
          } else if (event.type === "tool_start" && callbacks?.onToolStart) {
            callbacks.onToolStart(event.name, event.input);
          } else if (event.type === "tool_end" && callbacks?.onToolEnd) {
            callbacks.onToolEnd(event.name, event.result);
          } else if (event.type === "turn_start" && callbacks?.onTurnStart) {
            callbacks.onTurnStart();
          } else if (event.type === "done") {
            result = {
              message: event.message,
              tool_calls: event.tool_calls,
              warning: event.warning,
              follow_ups: event.follow_ups,
            };
          } else if (event.type === "error") {
            throw new ApiError(500, event.message);
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
          // skip malformed lines
        }
      }
    }

    if (!result) throw new ApiError(500, "Stream ended without a done event");
    return result;
  }

  return {
    chat: chatStream,
    listSessions: () => request<SessionSummary[]>("/sessions"),
    getSession: (id) => request<ChatMessage[]>(`/sessions/${encodeURIComponent(id)}`),
    deleteSession: (id) => request<void>(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    renameSession: (id, title) =>
      request<void>(`/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    getGeo: (name) => request<FeatureCollection>(`/geo/${name}`),
    getRoute: (from, to) =>
      request<RouteResponse>(`/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    getBuildingDetails: (code) => request<BuildingDetails>(`/building/${encodeURIComponent(code)}`),
  };
}

/** Memoizes `getGeo` per dataset; a failed fetch is evicted so it can be retried. */
export function withGeoCache(api: ChatApi): ChatApi {
  const cache = new Map<GeoName, Promise<FeatureCollection>>();
  return {
    ...api,
    getGeo(name) {
      const hit = cache.get(name);
      if (hit) return hit;
      const pending = api.getGeo(name).catch((error) => {
        cache.delete(name);
        throw error;
      });
      cache.set(name, pending);
      return pending;
    },
  };
}
