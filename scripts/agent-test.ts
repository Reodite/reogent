import { readFileSync } from "node:fs";
import { streamAgent } from "@/src/server/agent/stream";
import type { ChatMessage } from "@/src/server/core/types";
import { modules } from "@/src/server/modules";
import { getSearch } from "@/src/server/search";

// Load .env into process.env (tsx doesn't auto-load it)
const envPath = `${process.cwd()}/.env`;
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  // Override docker-internal URL with host-local equivalent
  if (process.env.MEILI_URL === "http://meilisearch:7700") {
    process.env.MEILI_URL = "http://localhost:7700";
  }
  if (process.env.DATA_PATH === "/data") {
    process.env.DATA_PATH = `${process.cwd()}/ubc-unified-data/data`;
  }
} catch {} // silently ignore

const queries = [
  "What courses does CPSC 110 require as prerequisites?",
  "How much is tuition for international students in Computer Science?",
  "Find me a place to study near IKB",
  "What's the walking distance from ICCS to Buchanan?",
  "Tell me about the Bachelor of Computer Science program and its admission requirements",
  "What events are happening on campus this week?",
  "Where can I park near the Nest?",
  "What are the key dates for Winter 2026 term?",
  "Show me easy electives with high averages in CPSC",
  "Find buildings on campus that have coffee shops nearby",
  "What are the living costs for students at UBC?",
  "Find me a course about machine learning",
  "What fees do UBC students have to pay?",
  "Find study spaces in IKB that are bookable right now",
  "What is the grade distribution for CPSC 110?",
];

async function runQuery(query: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`QUERY: ${query}`);
  console.log(`${"=".repeat(80)}`);

  const messages: ChatMessage[] = [{ role: "user", content: query }];
  const toolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];

  let finalText = "";
  let error = "";

  try {
    for await (const event of streamAgent(messages, { modules, search: getSearch() })) {
      switch (event.type) {
        case "thinking":
          // Skip thinking for the log
          break;
        case "text":
          finalText += event.delta;
          break;
        case "tool_start":
          console.log(`\n  TOOL: ${event.name}`);
          console.log(`  PARAMS: ${JSON.stringify(event.input, null, 4)}`);
          break;
        case "tool_end":
          console.log(`  RESULT: ${truncate(JSON.stringify(event.result, null, 2), 500)}`);
          toolCalls.push({ name: event.name, input: event.input, result: event.result });
          break;
        case "done":
          console.log(`\n  FINAL ANSWER: ${truncate(event.message, 1000)}`);
          finalText = event.message;
          break;
        case "error":
          error = event.message;
          console.log(`\n  ERROR: ${event.message}`);
          break;
      }
    }
  } catch (e) {
    error = String(e);
    console.log(`\n  EXCEPTION: ${error}`);
  }

  return { query, toolCalls, finalText, error };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}... (${s.length - max} more chars)`;
}

async function main() {
  const results: { query: string; toolCalls: { name: string; input: Record<string, unknown> }[] }[] = [];

  for (const query of queries) {
    const result = await runQuery(query);
    results.push(result);
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Summary
  console.log(`\n\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}`);

  for (const r of results) {
    const toolNames = r.toolCalls.map((t) => t.name);
    console.log(`\n[${r.toolCalls.length} tools] ${r.query}`);
    console.log(`  Tools: ${toolNames.join(", ")}`);
  }
}

main().catch(console.error);
