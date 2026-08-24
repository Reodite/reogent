import { readFileSync } from "node:fs";
import { streamAgent } from "@/src/server/agent/stream";
import type { ChatMessage } from "@/src/server/core/types";
import { modules } from "@/src/server/modules";
import { getSearch } from "@/src/server/search";

// Load .env
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
  if (process.env.MEILI_URL === "http://meilisearch:7700") {
    process.env.MEILI_URL = "http://localhost:7700";
  }
  // Override docker-internal data path to host-local path
  if (process.env.DATA_PATH === "/data") {
    process.env.DATA_PATH = `${process.cwd()}/ubc-unified-data/data`;
  }
} catch {}

interface EvalResult {
  query: string;
  domain: string;
  toolCalls: { name: string; input: Record<string, unknown>; result: unknown }[];
  errors: { name: string; message: string }[];
  hasWidget: boolean;
  finalText: string;
  durationMs: number;
  toolCount: number;
  uniqueTools: string[];
  usedToolNames: string[];
  hasError: boolean;
  wandered: boolean;
}

const QUERIES: { query: string; domain: string; expectedTools: string[] }[] = [
  // Courses
  {
    query: "What courses does CPSC 110 require as prerequisites?",
    domain: "courses",
    expectedTools: ["get_prereq_tree", "get_course"],
  },
  { query: "Show me CPSC 310 course details", domain: "courses", expectedTools: ["get_course", "show_widget"] },
  {
    query: "What are the easiest 3rd year CPSC courses with no prerequisites?",
    domain: "courses",
    expectedTools: ["find_courses", "show_widget"],
  },
  { query: "Find 200-level MATH courses", domain: "courses", expectedTools: ["find_courses", "show_widget"] },
  {
    query: "What is the grade distribution for CPSC 110?",
    domain: "courses",
    expectedTools: ["get_course", "show_widget"],
  },
  { query: "Find courses about machine learning", domain: "courses", expectedTools: ["find_courses", "show_widget"] },
  {
    query: "What CPSC courses have the highest averages?",
    domain: "courses",
    expectedTools: ["find_courses", "show_widget"],
  },
  {
    query: "Show me CPSC 110 with grade distribution",
    domain: "courses",
    expectedTools: ["get_course", "show_widget"],
  },
  { query: "Find 4-credit courses in BIOL", domain: "courses", expectedTools: ["find_courses", "show_widget"] },
  {
    query: "What courses are offered in the Faculty of Science?",
    domain: "courses",
    expectedTools: ["find_courses", "show_widget"],
  },

  // Tuition / Costs
  {
    query: "How much is tuition for international students in Computer Science?",
    domain: "tuition",
    expectedTools: ["get_costs", "show_widget"],
  },
  {
    query: "What is the tuition for domestic Bachelor of Science students?",
    domain: "tuition",
    expectedTools: ["get_costs", "show_widget"],
  },
  { query: "What are the living costs for students at UBC?", domain: "tuition", expectedTools: ["get_costs"] },
  { query: "What student fees do UBC students pay?", domain: "tuition", expectedTools: ["get_costs"] },
  { query: "How much does it cost to study Computer Science at UBC?", domain: "tuition", expectedTools: ["get_costs"] },

  // Buildings
  {
    query: "Where is the Irving K Barber Learning Centre?",
    domain: "buildings",
    expectedTools: ["find_building", "show_widget"],
  },
  { query: "Show me the ICICS building", domain: "buildings", expectedTools: ["find_building", "show_widget"] },
  { query: "Where is the AMS Nest?", domain: "buildings", expectedTools: ["find_building", "show_widget"] },
  { query: "Find the Woodward building", domain: "buildings", expectedTools: ["find_building", "show_widget"] },

  // Walking routes
  {
    query: "How far is it from ICCS to Buchanan?",
    domain: "routes",
    expectedTools: ["walking_distance", "show_widget"],
  },
  {
    query: "Walking distance from the Nest to IKB",
    domain: "routes",
    expectedTools: ["walking_distance", "show_widget"],
  },
  {
    query: "How long to walk from the Forestry building to the Pharmacy building?",
    domain: "routes",
    expectedTools: ["walking_distance", "show_widget"],
  },

  // Places (food, services, parking)
  { query: "Find coffee shops near IKB", domain: "places", expectedTools: ["find_places", "show_widget"] },
  { query: "Where can I get food near the Nest?", domain: "places", expectedTools: ["find_places", "show_widget"] },
  { query: "Are there any libraries near Buchanan?", domain: "places", expectedTools: ["find_places", "show_widget"] },
  { query: "Find restaurants on campus", domain: "places", expectedTools: ["find_places", "show_widget"] },
  { query: "Where can I park near the Nest?", domain: "parking", expectedTools: ["find_places", "show_widget"] },
  { query: "Show me parking lots with EV charging", domain: "parking", expectedTools: ["find_places", "show_widget"] },
  {
    query: "Where is the nearest grocery store on campus?",
    domain: "places",
    expectedTools: ["find_places", "show_widget"],
  },
  { query: "Find transit stops on campus", domain: "places", expectedTools: ["find_places", "show_widget"] },

  // Study spaces
  { query: "Where can I study near IKB?", domain: "spaces", expectedTools: ["find_study_spaces", "show_widget"] },
  {
    query: "Find bookable library rooms that are free right now",
    domain: "spaces",
    expectedTools: ["find_study_spaces", "show_widget"],
  },
  { query: "Show me study spaces in the Nest", domain: "spaces", expectedTools: ["find_study_spaces", "show_widget"] },
  {
    query: "Are there any free study rooms in IKB?",
    domain: "spaces",
    expectedTools: ["find_study_spaces", "show_widget"],
  },

  // Events
  {
    query: "What events are happening on campus this week?",
    domain: "events",
    expectedTools: ["find_events", "show_widget"],
  },
  { query: "Find lectures and talks on campus", domain: "events", expectedTools: ["find_events", "show_widget"] },
  {
    query: "Are there any events happening this weekend?",
    domain: "events",
    expectedTools: ["find_events", "show_widget"],
  },

  // Admissions
  {
    query: "Tell me about the Bachelor of Computer Science program",
    domain: "admissions",
    expectedTools: ["find_programs", "show_widget"],
  },
  {
    query: "What are the admission requirements for Computer Science?",
    domain: "admissions",
    expectedTools: ["find_programs", "get_admission_requirements"],
  },
  { query: "Find engineering programs at UBC", domain: "admissions", expectedTools: ["find_programs", "show_widget"] },
  {
    query: "What do I need to get into UBC from British Columbia?",
    domain: "admissions",
    expectedTools: ["find_programs", "get_admission_requirements"],
  },

  // Key dates
  {
    query: "When is the withdrawal deadline for Winter 2026?",
    domain: "dates",
    expectedTools: ["get_key_dates", "show_widget"],
  },
  { query: "What are the key dates for this term?", domain: "dates", expectedTools: ["get_key_dates", "show_widget"] },
  { query: "When does the exam period start?", domain: "dates", expectedTools: ["get_key_dates", "show_widget"] },
  { query: "What are the UBC holidays this year?", domain: "dates", expectedTools: ["get_key_dates", "show_widget"] },

  // UBC Pages
  { query: "What is the UBC policy on academic concession?", domain: "pages", expectedTools: ["search_ubc_pages"] },
  { query: "How do I apply for a UBC scholarship?", domain: "pages", expectedTools: ["search_ubc_pages"] },
  { query: "What are the UBC residence rules?", domain: "pages", expectedTools: ["search_ubc_pages"] },

  // Mixed / complex
  {
    query: "Is there a coffee shop near the ICICS building and how far is it from Buchanan?",
    domain: "mixed",
    expectedTools: ["find_places", "walking_distance", "show_widget"],
  },
  {
    query: "What courses are available in CPSC and where can I study near the CS building?",
    domain: "mixed",
    expectedTools: ["find_courses", "find_study_spaces", "show_widget"],
  },
  {
    query: "I want to find easy elective courses and a place to park near the Nest",
    domain: "mixed",
    expectedTools: ["find_courses", "find_places", "show_widget"],
  },
];

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}... (${s.length - max} more chars)`;
}

async function iterateWithTimeout<T>(
  gen: AsyncGenerator<T>,
  onEvent: (event: T) => void,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const result = await Promise.race<{ done: boolean; value?: T }>([
      gen.next() as Promise<{ done: boolean; value?: T }>,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out")), remaining)),
    ]);
    if (result.done) return;
    onEvent(result.value as T);
  }
}

async function runQuery(query: string, domain: string, timeoutMs = 45000): Promise<EvalResult> {
  const messages: ChatMessage[] = [{ role: "user", content: query }];
  const toolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
  const errors: { name: string; message: string }[] = [];
  let finalText = "";
  let hasWidget = false;
  const start = Date.now();

  const gen = streamAgent(messages, { modules, search: getSearch() });
  try {
    await iterateWithTimeout(
      gen,
      (event) => {
        switch (event.type) {
          case "text":
            break;
          case "tool_start":
            break;
          case "tool_end":
            toolCalls.push({ name: event.name, input: event.input as Record<string, unknown>, result: event.result });
            if (
              event.result &&
              typeof event.result === "object" &&
              "status" in (event.result as object) &&
              (event.result as { status: string }).status === "error"
            ) {
              errors.push({
                name: event.name,
                message: (event.result as { message: string }).message ?? "unknown error",
              });
            }
            if (event.name === "show_widget") hasWidget = true;
            break;
          case "done":
            finalText = event.message;
            break;
          case "error":
            finalText = event.message;
            break;
        }
      },
      timeoutMs,
    );
  } catch (e) {
    finalText = `[stream error] ${String(e)}`;
  }

  const durationMs = Date.now() - start;
  const usedToolNames = toolCalls.map((t) => t.name);
  const uniqueTools = [...new Set(usedToolNames)];
  const hasError = errors.length > 0;
  // Agent wandered if it used tools but never showed a widget
  const wandered = toolCalls.length > 0 && !hasWidget && !hasError;

  return {
    query,
    domain,
    toolCalls,
    errors,
    hasWidget,
    finalText: truncate(finalText, 300),
    durationMs,
    toolCount: toolCalls.length,
    uniqueTools,
    usedToolNames,
    hasError,
    wandered,
  };
}

function scoreResult(
  result: EvalResult,
  expected: string[],
): { usedExpected: string[]; missedExpected: string[]; extra: string[] } {
  const used = new Set(result.usedToolNames);
  const usedExpected = expected.filter((t) => used.has(t));
  const missedExpected = expected.filter((t) => !used.has(t));
  const extra = result.uniqueTools.filter((t) => !expected.includes(t));
  return { usedExpected, missedExpected, extra };
}

async function main() {
  console.log(`Running ${QUERIES.length} queries through agent evaluation...\n`);

  const results: (EvalResult & { score: ReturnType<typeof scoreResult> })[] = [];

  for (const [idx, { query, domain, expectedTools }] of QUERIES.entries()) {
    process.stdout.write(`[${idx + 1}/${QUERIES.length}] ${truncate(query, 60)}... `);
    const result = await runQuery(query, domain);
    const score = scoreResult(result, expectedTools);
    result.score = score;
    results.push(result);

    const status = result.hasError ? "ERR" : result.wandered ? "WANDER" : "OK";
    process.stdout.write(`${status} (${result.toolCount} tools, ${result.durationMs}ms)\n`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Summary report
  console.log(`\n${"=".repeat(100)}`);
  console.log("EVAL SUMMARY");
  console.log("=".repeat(100));

  const byDomain = new Map<string, typeof results>();
  for (const r of results) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r);
    byDomain.set(r.domain, list);
  }

  let totalErrors = 0;
  let totalWandered = 0;
  let totalNoWidget = 0;
  const toolErrors = new Map<string, number>();

  for (const r of results) {
    if (r.hasError) totalErrors++;
    if (r.wandered) totalWandered++;
    if (!r.hasWidget && r.toolCount > 0) totalNoWidget++;
    for (const e of r.errors) {
      toolErrors.set(e.name, (toolErrors.get(e.name) ?? 0) + 1);
    }
  }

  console.log(`\nTotal: ${results.length} queries`);
  console.log(`OK: ${results.length - totalErrors - totalWandered}`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`Wandered (tools but no widget): ${totalWandered}`);
  console.log(`No widget (tools but no final card): ${totalNoWidget}`);

  if (toolErrors.size > 0) {
    console.log("\nTool errors breakdown:");
    for (const [tool, count] of toolErrors) {
      console.log(`  ${tool}: ${count}`);
    }
  }

  console.log("\nPer-domain results:");
  console.log(
    `${"DOMAIN".padEnd(20)} ${"#".padEnd(5)} ${"OK".padEnd(5)} ${"ERR".padEnd(5)} ${"WANDER".padEnd(8)} ${"AVG TOOLS".padEnd(10)} ${"AVG MS".padEnd(8)}`,
  );
  console.log("-".repeat(70));
  for (const [domain, list] of byDomain) {
    const ok = list.filter((r) => !r.hasError && !r.wandered).length;
    const err = list.filter((r) => r.hasError).length;
    const wander = list.filter((r) => r.wandered).length;
    const avgTools = list.reduce((s, r) => s + r.toolCount, 0) / list.length;
    const avgMs = list.reduce((s, r) => s + r.durationMs, 0) / list.length;
    console.log(
      `${domain.padEnd(20)} ${String(list.length).padEnd(5)} ${String(ok).padEnd(5)} ${String(err).padEnd(5)} ${String(wander).padEnd(8)} ${avgTools.toFixed(1).padEnd(10)} ${String(Math.round(avgMs)).padEnd(8)}`,
    );
  }

  console.log("\nDetailed results:");
  for (const r of results) {
    const status = r.hasError ? "ERROR" : r.wandered ? "WANDER" : "OK";
    console.log(`\n[${status}] ${r.query}`);
    console.log(`  Tools: ${r.usedToolNames.join(", ")}`);
    if (r.score.missedExpected.length > 0) console.log(`  Expected but missed: ${r.score.missedExpected.join(", ")}`);
    if (r.score.extra.length > 0) console.log(`  Extra tools: ${r.score.extra.join(", ")}`);
    if (r.hasWidget) console.log("  Widget: yes");
    if (r.errors.length > 0) {
      console.log(`  Errors (${r.errors.length}):`);
      for (const e of r.errors) {
        console.log(`    ${e.name}: ${e.message}`);
      }
    }
    console.log(`  Duration: ${r.durationMs}ms`);
  }

  // JSON output for machine processing
  const report = {
    summary: {
      total: results.length,
      ok: results.length - totalErrors - totalWandered,
      errors: totalErrors,
      wandered: totalWandered,
      noWidget: totalNoWidget,
      toolErrors: Object.fromEntries(toolErrors),
    },
    byDomain: Object.fromEntries(
      [...byDomain.entries()].map(([d, list]) => [
        d,
        {
          count: list.length,
          errors: list.filter((r) => r.hasError).length,
          wandered: list.filter((r) => r.wandered).length,
          avgTools: list.reduce((s, r) => s + r.toolCount, 0) / list.length,
          avgMs: Math.round(list.reduce((s, r) => s + r.durationMs, 0) / list.length),
        },
      ]),
    ),
    details: results.map((r) => ({
      query: r.query,
      domain: r.domain,
      status: r.hasError ? "error" : r.wandered ? "wandered" : "ok",
      tools: r.usedToolNames,
      toolCount: r.toolCount,
      hasWidget: r.hasWidget,
      errors: r.errors,
      durationMs: r.durationMs,
      missedExpected: r.score.missedExpected,
      extraTools: r.score.extra,
    })),
  };

  console.log("\n\nJSON REPORT:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
