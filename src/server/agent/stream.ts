import type { CitationSeed } from "@/src/server/citations/extractors";
import type { Citation } from "@/src/shared/citations/citation";
import { allocateCitations } from "../citations/allocator";
import { CITATION_EXTRACTORS } from "../citations/extractors";
import { stampUsed } from "../citations/stamp-used";
import type { ChatMessage, ContentBlock, ConverseMessage, DatasetModule, SearchClient, ToolCall } from "../core/types";
import { converse, converseStream } from "../llm";
import { executeTool, isToolError } from "./executor";
import { ITERATION_LIMIT, systemPrompt } from "./loop";

const GENERATE_FOLLOW_UPS = false;

type StreamEvent =
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "text_clear" }
  | { type: "tool_start"; name: string; input: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: unknown }
  | { type: "citations"; citations: Citation[] }
  | { type: "turn_start" }
  | {
      type: "done";
      message: string;
      tool_calls: ToolCall[];
      citations: Citation[];
      warning?: string;
      follow_ups?: string[];
    }
  | { type: "error"; message: string };

interface StreamAgentDeps {
  modules: DatasetModule[];
  search: SearchClient;
}

export async function* streamAgent(messages: ChatMessage[], deps: StreamAgentDeps): AsyncGenerator<StreamEvent> {
  const toolSpecs = deps.modules.flatMap((m) => m.tools.map((t) => t.spec));
  const convo: ConverseMessage[] = messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
  const toolCalls: ToolCall[] = [];
  let fullText = "";
  const pendingCitations: CitationSeed[] = [];
  let toolNudges = 0;
  // Identical repeat calls within one question return the cached successful
  // result instead of re-executing — guards against models that re-issue the
  // same lookup across turns.
  const callCache = new Map<string, unknown>();
  const TOOL_CALL_BUDGET = 6;
  let budgetExceeded = false;
  const lastUserMsg = (messages[messages.length - 1]?.content ?? "").trim().toLowerCase();
  const isGreeting = lastUserMsg.length < 3 || /^(hi|hello|hey|greetings|sup|yo)\b/.test(lastUserMsg);

  for (let i = 0; ; i++) {
    if (i > 0) yield { type: "turn_start" as const };

    if (i === ITERATION_LIMIT) {
      convo.push({
        role: "user",
        content: [
          {
            text: "You have used many tool calls. Please provide your final answer now based on the information you have gathered so far. Do not call more tools unless absolutely necessary.",
          },
        ],
      });
    }

    // Blocks accumulate in arrival order: Gemini interleaves text and
    // functionCall parts, and history must reproduce that order or the model
    // re-issues calls it already made.
    const blocks: ContentBlock[] = [];
    let iterText = "";
    const toolUses: {
      toolUseId: string;
      name: string;
      input: Record<string, unknown>;
      thoughtSignature?: string;
    }[] = [];
    let stopReason = "end_turn";

    for await (const event of converseStream({
      messages: convo,
      system: systemPrompt(new Date(), allocateCitations(pendingCitations)),
      toolSpecs: budgetExceeded ? [] : toolSpecs,
      forceToolUse: i === 0 && !isGreeting,
    })) {
      if (event.type === "thinking") {
        yield { type: "thinking", delta: event.delta };
      } else if (event.type === "text") {
        iterText += event.delta;
        yield { type: "text", delta: event.delta };
      } else if (event.type === "tool_use") {
        if (iterText.trim()) {
          blocks.push({ text: iterText });
          iterText = "";
        }
        blocks.push({
          toolUse: {
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            ...(event.thoughtSignature ? { thoughtSignature: event.thoughtSignature } : {}),
          },
        });
        toolUses.push(event);
      } else if (event.type === "stop") {
        stopReason = event.reason;
      }
    }
    if (iterText.trim()) blocks.push({ text: iterText });

    fullText = blocks
      .map((b) => b.text ?? "")
      .filter(Boolean)
      .join("\n")
      .trim();

    convo.push({ role: "assistant", content: blocks });

    if (stopReason !== "tool_use") {
      // Detect hallucination: assistant answered with plain text before ANY
      // tool has run this question. Nudge up to NUDGE_LIMIT times to fetch
      // facts, then give up rather than loop on a model that refuses tools.
      // Once a tool has run, a text-only turn is a legitimate answer — never
      // nag then, or the model re-issues calls it already made.
      const NUDGE_LIMIT = 2;
      if (toolUses.length === 0 && iterText && toolCalls.length === 0 && toolNudges < NUDGE_LIMIT) {
        toolNudges++;
        convo.push({
          role: "user",
          content: [
            {
              text: "You answered without using any tools. UBC data (courses, tuition, buildings, routes, events, dates, admission requirements) changes yearly and your training data is not reliable for it. Call the appropriate data tool(s) to gather the facts, then give your answer. Do not answer from memory.",
            },
          ],
        });
        continue;
      }
      let follow_ups: string[] | undefined;
      if (GENERATE_FOLLOW_UPS) {
        try {
          const FOLLOW_UP_SYSTEM = `You suggest follow-up questions for a UBC campus assistant. The assistant can ONLY:
- Search courses (by subject, credits, prerequisites, term)
- Look up tuition and cost estimates
- Calculate walking distances between buildings
- Find buildings on campus
- Find places (food, services) near buildings
- Search study spaces and free rooms
- Look up grade distributions
- Search events, parking, admission requirements, key dates

Rules:
- Suggest 2-3 questions the user would naturally ask next
- Only suggest things the assistant can actually answer (from the list above)
- Never repeat what was already asked in this conversation
- Never suggest biking, transit, driving, or anything not walking-based for routes
- If the assistant said it couldn't help with something, don't suggest variations of that
- If the conversation hit a dead end, suggest a completely different topic
- Return ONLY a JSON array of strings, nothing else`;

          const summary = convo
            .slice(-6)
            .map(
              (m) =>
                `${m.role}: ${m.content
                  .map((b) => b.text)
                  .filter(Boolean)
                  .join("")
                  .slice(0, 200)}`,
            )
            .join("\n");

          const followUpResult = await converse({
            system: FOLLOW_UP_SYSTEM,
            messages: [{ role: "user", content: [{ text: summary }] }],
            toolSpecs: [],
          });
          const raw = (followUpResult.message.content ?? [])
            .map((b) => b.text)
            .filter(Boolean)
            .join("")
            .trim();
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              follow_ups = parsed.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 3);
            }
          }
        } catch {
          // Best-effort
        }
      }
      const finalCitations = stampUsed(allocateCitations(pendingCitations), fullText);
      yield { type: "citations", citations: finalCitations };
      yield { type: "done", message: fullText, tool_calls: toolCalls, citations: finalCitations, follow_ups };
      return;
    }

    for (const { name, input } of toolUses) {
      yield { type: "tool_start", name, input };
    }
    const execResults = await Promise.all(
      toolUses.map(async ({ name, input }) => {
        const key = `${name}:${JSON.stringify(input)}`;
        if (callCache.has(key)) return callCache.get(key);
        const result = await executeTool(deps.modules, name, input, deps.search);
        if (!isToolError(result)) callCache.set(key, result);
        return result;
      }),
    );
    const widgetIdx = toolUses.findIndex((tu) => tu.name === "show_widget");
    const widgetSucceeded = widgetIdx >= 0 && !isToolError(execResults[widgetIdx]);

    const results: ContentBlock[] = [];
    for (let i = 0; i < toolUses.length; i++) {
      const { toolUseId, name, input } = toolUses[i];
      const result = execResults[i];
      toolCalls.push({ name, input, result });
      yield { type: "tool_end", name, result };
      const extractor = CITATION_EXTRACTORS[name];
      if (extractor) {
        pendingCitations.push(...extractor(result, input));
        yield { type: "citations", citations: allocateCitations(pendingCitations) };
      }
      results.push({
        toolResult: {
          toolUseId,
          name,
          content: [{ json: result }],
          ...(isToolError(result) ? { status: "error" as const } : {}),
        },
      });
    }

    if (widgetSucceeded) {
      // show_widget rendered the card; any same-turn text is the answer.
      // End the turn immediately — no extra nudge round-trip.
      const finalCitations = stampUsed(allocateCitations(pendingCitations), fullText);
      yield { type: "citations", citations: finalCitations };
      yield { type: "done", message: fullText, tool_calls: toolCalls, citations: finalCitations };
      return;
    }

    // Tool results must always land in history — Gemini rejects a
    // functionCall without its matching functionResponse.
    convo.push({ role: "user", content: results });

    // Halt runaway tool loops: once the budget is crossed, strip the tool
    // specs from the next LLM call so the model can only answer with text.
    if (toolCalls.length >= TOOL_CALL_BUDGET && !budgetExceeded) {
      budgetExceeded = true;
      convo.push({
        role: "user",
        content: [
          {
            text: "You have used many tool calls. Provide your final answer now based on the information you have gathered so far. Do not call more tools.",
          },
        ],
      });
      fullText = "";
    }
  }
}
