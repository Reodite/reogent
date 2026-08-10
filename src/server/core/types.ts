// Core types shared by the agent loop, dataset modules, and API handlers.

import type { ChatMessage, ChatResponse } from "@/src/shared/types";
import type { MeiliSearch } from "meilisearch";

export type { ChatMessage, InterstitialBlock, SessionSummary, ToolCall } from "@/src/shared/types";

export interface ChatRequest {
  session_id?: string;
  messages: ChatMessage[];
}

export type AgentResult = ChatResponse;

// LLM message shapes

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: { json: Record<string, unknown> };
}

export interface ContentBlock {
  text?: string;
  toolUse?: { toolUseId: string; name: string; input: Record<string, unknown> };
  toolResult?: { toolUseId: string; content: { json: unknown }[]; status?: "error" };
}

export interface ConverseMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export type ConverseFn = (req: {
  messages: ConverseMessage[];
  system: string;
  toolSpecs: ToolSpec[];
}) => Promise<{ stopReason: string; message: ConverseMessage }>;

// Dataset module system

export interface DataReader {
  getJson(key: string): Promise<unknown>;
}

export interface DataWriter extends DataReader {
  putJson(key: string, value: unknown): Promise<void>;
}

/** Search client passed to tool execute functions. */
export type SearchClient = MeiliSearch;

// biome-ignore lint/suspicious/noExplicitAny: raw rows are dataset-specific
export interface IndexDef<TRaw = any> {
  index: string;
  /** Meilisearch index settings: searchableAttributes, filterableAttributes, sortableAttributes. */
  settings: {
    searchableAttributes?: string[];
    filterableAttributes?: string[];
    sortableAttributes?: string[];
  };
  read(store: DataReader): AsyncIterable<TRaw>;
  transform(raw: TRaw): { id: string; doc: Record<string, unknown> | object } | null;
  derive?(store: DataWriter): Promise<void>;
}

export interface ToolDef {
  spec: ToolSpec;
  execute(input: Record<string, unknown>, search: SearchClient): Promise<unknown>;
}

export interface GeoArtifact {
  name: string;
  path: string;
}

export interface DatasetModule {
  name: string;
  indices: IndexDef[];
  tools: ToolDef[];
  geo?: GeoArtifact[];
}
