// Publishes a Pulse round from a JSON seed file, locking the current round.
// Validates the whole seed before touching the database; exits non-zero on failure.
// Usage: npm run pulse:publish -- data/pulse/round.example.json
import { readFileSync } from "node:fs";
import { getPool } from "../src/server/db";
import { publishRound } from "../src/server/pulse/store";

const MAX_QUESTION_LENGTH = 280;

function loadSeed(path: string): { title: string | null; questions: string[] } {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { questions?: unknown }).questions)) {
    throw new Error("Seed must be an object with a questions array");
  }
  const { title, questions } = raw as { title?: unknown; questions: unknown[] };
  if (title !== undefined && typeof title !== "string") throw new Error("title must be a string when present");
  if (questions.length === 0) throw new Error("questions must not be empty");
  const seen = new Set<string>();
  const cleaned = questions.map((q, i) => {
    if (typeof q !== "string" || q.trim() === "") throw new Error(`questions[${i}] must be a non-empty string`);
    const text = q.trim();
    if (text.length > MAX_QUESTION_LENGTH) throw new Error(`questions[${i}] exceeds ${MAX_QUESTION_LENGTH} characters`);
    const key = text.toLowerCase();
    if (seen.has(key)) throw new Error(`questions[${i}] duplicates an earlier question`);
    seen.add(key);
    return text;
  });
  return { title: title?.trim() || null, questions: cleaned };
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run pulse:publish -- <seed.json>");
    process.exit(1);
  }
  const seed = loadSeed(path);
  const result = await publishRound(seed);
  const locked = result.lockedRoundId === null ? "No previous active round." : `Locked round ${result.lockedRoundId}.`;
  const title = seed.title ? ` ("${seed.title}")` : "";
  console.log(`${locked} Published round ${result.roundId}${title} with ${seed.questions.length} questions.`);
}

main()
  .catch((e) => {
    console.error("Publish failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    // Close the pool so the process can exit; it never opened if the run failed early.
    try {
      void getPool().end();
    } catch {
      // Pool was never created (missing DATABASE_URL); nothing to close.
    }
  });
