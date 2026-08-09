import type {
  AgentResult,
  ChatMessage,
  ContentBlock,
  ConverseFn,
  ConverseMessage,
  DatasetModule,
  SearchClient,
  ToolCall,
} from "../core/types";
import { executeTool, isToolError } from "./executor";

export const ITERATION_LIMIT = 8;
const HARD_LIMIT = 10;

const NUDGE =
  "You have used many tool calls. Please provide your final answer now based on the information you have gathered so far. Do not call more tools unless absolutely necessary.";

export const SYSTEM_PROMPT = `You are the UBC Vancouver campus assistant. Answer questions about courses, admissions, tuition and costs, campus buildings and walking routes, study spaces and library room bookings, food and services, parking, events, key dates, and university policies.

Always use the provided tools to look up facts instead of answering from memory. If a tool returns an error or no results, say what you could not find rather than guessing.

Call multiple tools in parallel when the question requires several lookups. For example, if the user asks about two courses, call get_course for both simultaneously rather than one at a time. This makes responses faster.

When you need to use tools, call them directly without any preceding text explanation. Do not output text like "Let me search for that" before a tool call — just call the tool. Only output text as your final answer after all tool calls are complete.

When you answer, cite your sources. If a tool result includes a URL (a url, source_url, or payment_link field), cite it as a markdown link, e.g. [UBC Academic Calendar](https://vancouver.calendar.ubc.ca/...). Otherwise cite the tool the data came from (for example, "according to walking_distance").

Present values in human units: walking distances as minutes (with metres if helpful), and money as CAD dollar amounts.

When the user does not specify a year, term, cohort, or date, assume the current or most recent one and say which you assumed — do not ask them to clarify.

The chat UI has a campus map that automatically visualizes successful tool calls: walking_distance draws the route, find_building highlights the building, and find_places pins the places. So:
- When the user asks where something is, or to show or highlight buildings, call find_building for each building they mean (even if you already know the answer from earlier in the conversation — the map only updates on a tool call).
- When the user asks about going from one building or place to another, or how far apart two things are, call walking_distance so the route is drawn.
- Buildings resolve by official code, common abbreviation, or name. If a code fails, retry find_building with the full name. Places (restaurants, cafes) are not buildings — locate them with find_places, not find_building.`;

/** SYSTEM_PROMPT plus the current date and time in campus-local time. */
export function systemPrompt(now = new Date()): string {
  const date = now.toLocaleString("en-CA", {
    timeZone: "America/Vancouver",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${SYSTEM_PROMPT}\n\nIt is now ${date} (Vancouver time).`;
}

export interface AgentDeps {
  converse: ConverseFn;
  modules: DatasetModule[];
  search: SearchClient;
}

/** The tool-calling loop against the Converse API (Requirements 2.2–2.7). */
export async function runAgentLoop(messages: ChatMessage[], deps: AgentDeps): Promise<AgentResult> {
  const toolSpecs = deps.modules.flatMap((m) => m.tools.map((t) => t.spec));
  const convo: ConverseMessage[] = messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
  const toolCalls: ToolCall[] = [];
  let lastText = "";

  for (let i = 0; ; i++) {
    // Hard cap: terminate unconditionally to prevent runaway loops
    if (i >= HARD_LIMIT) {
      return {
        message: lastText || "I ran out of processing steps. Here is what I found so far.",
        tool_calls: toolCalls,
        warning: "Response may be incomplete — processing limit reached.",
      };
    }

    // After hitting the soft limit, nudge the model to wrap up but keep tools available
    if (i === ITERATION_LIMIT) {
      convo.push({ role: "user", content: [{ text: NUDGE }] });
    }

    const res = await deps.converse({ messages: convo, system: systemPrompt(), toolSpecs });
    convo.push(res.message);
    const text = (res.message.content ?? [])
      .map((b) => b.text)
      .filter(Boolean)
      .join("");
    if (text) lastText = text;

    if (res.stopReason !== "tool_use") {
      return { message: lastText, tool_calls: toolCalls };
    }

    const results: ContentBlock[] = [];
    const toolBlocks = (res.message.content ?? []).filter((b) => b.toolUse);
    const execResults = await Promise.all(
      toolBlocks.map((block) => executeTool(deps.modules, block.toolUse!.name, block.toolUse!.input, deps.search)),
    );
    for (let i = 0; i < toolBlocks.length; i++) {
      const { toolUseId, name, input } = toolBlocks[i].toolUse!;
      const result = execResults[i];
      toolCalls.push({ name, input, result });
      results.push({
        toolResult: {
          toolUseId,
          content: [{ json: result }],
          ...(isToolError(result) ? { status: "error" as const } : {}),
        },
      });
    }
    convo.push({ role: "user", content: results });
  }
}
