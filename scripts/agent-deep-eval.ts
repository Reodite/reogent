import { readFileSync } from "node:fs";
import { streamAgent } from "@/src/server/agent/stream";
import type { ChatMessage } from "@/src/server/core/types";
import { modules } from "@/src/server/modules";
import { getSearch } from "@/src/server/search";

const envPath = `${process.cwd()}/.env`;
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  if (process.env.MEILI_URL === "http://meilisearch:7700") process.env.MEILI_URL = "http://localhost:7700";
  if (process.env.DATA_PATH === "/data") process.env.DATA_PATH = `${process.cwd()}/ubc-unified-data/data`;
} catch {}

interface EvalResult {
  query: string;
  scenario: string;
  timeMs: number;
  toolCalls: number;
  uniqueTools: string[];
  errors: string[];
  answer: string;
  hasWidget: boolean;
  correctTools: boolean;
  expectedTools: string[];
  answerLen: number;
}

const QUESTIONS: { query: string; scenario: string; expectedTools: string[] }[] = [
  // --- First-year / academic planning ---
  {
    query:
      "I just failed MATH 180. Can I take MATH 184 instead next term, and do they have grade distributions showing people do better?",
    scenario: "course-failback",
    expectedTools: ["find_courses", "get_course"],
  },
  {
    query: "I'm trying to pick between CPSC 310 and CPSC 313 — which one has higher averages?",
    scenario: "course-compare",
    expectedTools: ["find_courses"],
  },
  {
    query: "My advisor says I need a 300-level BIOL course. What are my options?",
    scenario: "course-browse",
    expectedTools: ["find_courses"],
  },
  {
    query: "I got 82% in CPSC 110. Is CPSC 121 going to be harder? What was the average for CPSC 121?",
    scenario: "course-grade-compare",
    expectedTools: ["get_course", "find_courses"],
  },
  {
    query: "What 200-level courses have the least work — I need high averages and no prerequisites.",
    scenario: "course-easy",
    expectedTools: ["find_courses"],
  },

  // --- Buildings / walking routes ---
  {
    query: "My lecture in Buchanan ends at 11am and I need to get to ICCS for 11am. How long is the walk?",
    scenario: "walking-back-to-back",
    expectedTools: ["walking_distance", "find_building"],
  },
  {
    query: "I'm at the AMS Nest and my friend is at IKB. Where should we meet in the middle? How far is each?",
    scenario: "walking-meet",
    expectedTools: ["walking_distance"],
  },
  {
    query: "Where is the chemistry building? I have a lab there at 8am tomorrow.",
    scenario: "building-find",
    expectedTools: ["find_building"],
  },

  // --- Food / places ---
  {
    query: "I'm vegetarian — what are my food options near the Nest?",
    scenario: "food-veg",
    expectedTools: ["find_places"],
  },
  {
    query: "My mom's visiting campus. Where's a nice sit-down restaurant near the botanical garden?",
    scenario: "food-visit",
    expectedTools: ["find_places"],
  },
  {
    query: "Where can I get coffee at 7am before my 8am class in the Chemistry building?",
    scenario: "food-early",
    expectedTools: ["find_places"],
  },
  {
    query: "Is there a grocery store on campus? I need to buy dinner ingredients.",
    scenario: "food-grocery",
    expectedTools: ["find_places"],
  },

  // --- Study spaces ---
  {
    query: "Where can I find a quiet room with a whiteboard near Sauder to practice presentations?",
    scenario: "study-whiteboard",
    expectedTools: ["find_study_spaces"],
  },
  {
    query: "My study group needs a room for 6 people this Thursday evening — can we book one?",
    scenario: "study-group",
    expectedTools: ["find_study_spaces"],
  },
  {
    query: "Is there anywhere to nap on campus between my 12pm and 2pm classes?",
    scenario: "study-nap",
    expectedTools: ["find_study_spaces"],
  },
  {
    query: "Which library has the most free seats at 2pm on a Tuesday?",
    scenario: "study-library",
    expectedTools: ["find_study_spaces"],
  },

  // --- Parking ---
  {
    query: "I'm commuting to campus and want to park a motorcycle near the bike cage — where can I do that?",
    scenario: "parking-moto",
    expectedTools: ["find_places"],
  },
  {
    query: "I need EV charging while I'm in class for 3 hours — which parking lot has that?",
    scenario: "parking-ev",
    expectedTools: ["find_places"],
  },
  {
    query: "Where's the cheapest visitor parking near the Rose Garden?",
    scenario: "parking-cheap",
    expectedTools: ["find_places"],
  },

  // --- Events ---
  {
    query: "Are there any free music events happening on campus this month?",
    scenario: "events-music",
    expectedTools: ["find_events"],
  },
  {
    query: "I want to go to a career fair — is there one coming up on campus?",
    scenario: "events-career",
    expectedTools: ["find_events"],
  },

  // --- Costs ---
  {
    query: "How much does a full year of residence cost including the meal plan?",
    scenario: "costs-residence",
    expectedTools: ["get_costs"],
  },
  {
    query: "I'm an international student in Arts — what's my total first-year budget including tuition and living?",
    scenario: "costs-intl",
    expectedTools: ["get_costs"],
  },
  {
    query: "Is the U-Pass included in my student fees, and how much is it?",
    scenario: "costs-upass",
    expectedTools: ["get_costs"],
  },

  // --- Key dates ---
  {
    query: "When is the last day to drop a course without a W on my transcript?",
    scenario: "dates-drop",
    expectedTools: ["get_key_dates"],
  },
  {
    query: "When do I pay the second installment of tuition for Winter 2026?",
    scenario: "dates-tuition",
    expectedTools: ["get_key_dates"],
  },
  { query: "When does the Fall 2026 reading break start?", scenario: "dates-break", expectedTools: ["get_key_dates"] },

  // --- Admissions ---
  {
    query: "I'm from Ontario doing IB. What do I need for Computer Science admission?",
    scenario: "admissions-ontario",
    expectedTools: ["find_programs", "get_admission_requirements"],
  },
  {
    query: "Can I get into UBC Engineering as a transfer student from a BC college?",
    scenario: "admissions-transfer",
    expectedTools: ["find_programs", "get_admission_requirements"],
  },
  {
    query: "What's the difference between applying to a BA vs BSc in Computer Science?",
    scenario: "admissions-ba-vs-bsc",
    expectedTools: ["find_programs"],
  },

  // --- Policies / pages ---
  {
    query: "I need to defer my exams due to a family emergency — how does academic concession work?",
    scenario: "policy-concession",
    expectedTools: ["search_ubc_pages"],
  },
  {
    query: "What's UBC's policy on academic misconduct for a student who accidentally plagiarized?",
    scenario: "policy-misconduct",
    expectedTools: ["search_ubc_pages"],
  },

  // --- Mixed / complex ---
  {
    query:
      "I have back-to-back classes: MATH 200 at 9am in Buchanan, then CPSC 210 at 11am in ICCS. How long will it take me to walk, and where can I get coffee between them?",
    scenario: "mixed-route-coffee",
    expectedTools: ["walking_distance", "find_places"],
  },
  {
    query: "What's the grade distribution for CPSC 110, and where can I study near the ICCS building after class?",
    scenario: "mixed-grades-study",
    expectedTools: ["get_course", "find_study_spaces"],
  },
];

async function iterateWithTimeout<T>(
  gen: AsyncGenerator<T>,
  onEvent: (e: T) => void,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const result = await Promise.race([
      gen.next() as Promise<{ done: boolean; value?: T }>,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), remaining)),
    ]);
    if (result.done) return;
    onEvent(result.value as T);
  }
}

async function main() {
  const results: EvalResult[] = [];

  for (const [idx, { query, scenario, expectedTools }] of QUESTIONS.entries()) {
    const messages: ChatMessage[] = [{ role: "user", content: query }];
    const toolNames: string[] = [];
    const errors: string[] = [];
    let answer = "";
    let hasWidget = false;
    const start = Date.now();

    const gen = streamAgent(messages, { modules, search: getSearch() });
    try {
      await iterateWithTimeout(
        gen,
        (event) => {
          if (event.type === "tool_end") {
            toolNames.push(event.name);
            if (
              event.result &&
              typeof event.result === "object" &&
              "status" in (event.result as object) &&
              (event.result as { status: string }).status === "error"
            ) {
              errors.push(`${event.name}: ${(event.result as { message: string }).message ?? ""}`);
            }
            if (event.name === "show_widget") hasWidget = true;
          }
          if (event.type === "done") answer = event.message;
          if (event.type === "error") answer = event.message;
        },
        30000,
      );
    } catch (e) {
      errors.push(`stream: ${e instanceof Error ? e.message : String(e)}`);
    }

    const timeMs = Date.now() - start;
    const uniqueTools = [...new Set(toolNames)];
    const usedSet = new Set(uniqueTools);
    const correctTools = expectedTools.every((t) => usedSet.has(t) || (t === "show_widget" && hasWidget));

    results.push({
      query,
      scenario,
      timeMs,
      toolCalls: toolNames.length,
      uniqueTools,
      errors,
      answer: answer.slice(0, 500),
      hasWidget,
      correctTools,
      expectedTools,
      answerLen: answer.length,
    });

    const status = errors.length > 0 ? "ERR" : toolNames.length === 0 ? "NO_TOOL" : hasWidget ? "OK" : "WANDER";
    process.stdout.write(
      `[${idx + 1}/${QUESTIONS.length}] ${status.padEnd(8)} ${String(timeMs).padStart(5)}ms ${String(toolNames.length).padStart(2)} calls`,
    );
    if (errors.length) process.stdout.write(` ${errors[0].slice(0, 60)}`);
    process.stdout.write("\n");
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Summary
  const ok = results.filter((r) => r.errors.length === 0 && r.toolCalls > 0);
  const err = results.filter((r) => r.errors.length > 0);
  const notool = results.filter((r) => r.toolCalls === 0);
  const avgTime = results.reduce((s, r) => s + r.timeMs, 0) / results.length;
  const avgCalls = results.reduce((s, r) => s + r.toolCalls, 0) / results.length;
  const correctCount = results.filter((r) => r.correctTools).length;
  const avgAnswerLen = results.reduce((s, r) => s + r.answerLen, 0) / results.length;

  console.log("\n" + "=".repeat(100));
  console.log("DEEP EVAL SUMMARY");
  console.log("=".repeat(100));
  console.log(`Total: ${QUESTIONS.length} queries`);
  console.log(`OK (tools + no errors): ${ok.length}`);
  console.log(`Errors: ${err.length}`);
  console.log(`No tools: ${notool.length}`);
  console.log(`Correct tool selection: ${correctCount}/${QUESTIONS.length}`);
  console.log(`Avg time: ${Math.round(avgTime)}ms`);
  console.log(`Avg tool calls: ${avgCalls.toFixed(1)}`);
  console.log(`Avg answer length: ${Math.round(avgAnswerLen)} chars`);

  console.log("\n--- Per-query details ---");
  for (const r of results) {
    const status = r.errors.length > 0 ? "ERR" : r.toolCalls === 0 ? "NO_TOOL" : "OK";
    const toolOk = r.correctTools ? "✓" : "✗";
    console.log(`\n[${status}] ${toolOk} ${r.query}`);
    console.log(`  ${r.timeMs}ms | ${r.toolCalls} calls | ${r.uniqueTools.join(", ")}`);
    if (r.errors.length) console.log(`  ERRORS: ${r.errors.join("; ")}`);
    console.log(`  ANSWER: ${r.answer.slice(0, 300)}`);
    if (r.answerLen > 300) console.log(`  ... (${r.answerLen - 300} more chars)`);
  }

  const report = {
    summary: {
      total: QUESTIONS.length,
      ok: ok.length,
      errors: err.length,
      noTools: notool.length,
      correctToolCount: correctCount,
      avgTimeMs: Math.round(avgTime),
      avgCalls: avgCalls.toFixed(1),
      avgAnswerLen: Math.round(avgAnswerLen),
    },
    details: results.map((r) => ({
      query: r.query,
      scenario: r.scenario,
      timeMs: r.timeMs,
      toolCalls: r.toolCalls,
      tools: r.uniqueTools,
      errors: r.errors,
      hasWidget: r.hasWidget,
      correctTools: r.correctTools,
      answerLen: r.answerLen,
    })),
  };
  console.log("\n\nJSON REPORT:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
