import { spawnSync } from "node:child_process";

const { COMPOSE_PROJECT_NAME, MONGODB_TEST_USERNAME, MONGODB_TEST_PASSWORD, MONGODB_PORT = "27017" } = process.env;
if (!MONGODB_TEST_USERNAME || !MONGODB_TEST_PASSWORD) {
  throw new Error("Set MONGODB_TEST_USERNAME and MONGODB_TEST_PASSWORD in .env");
}

const composeArgs = ["compose", "--env-file", ".env"];
if (COMPOSE_PROJECT_NAME) composeArgs.push("-p", COMPOSE_PROJECT_NAME);
composeArgs.push("up", "-d", "--wait", "mongo");
const compose = spawnSync("docker", composeArgs, {
  stdio: "inherit",
});
if (compose.error) throw compose.error;
if (compose.status !== 0) process.exit(compose.status ?? 1);

const encode = encodeURIComponent;
const env = {
  ...process.env,
  REQUIRE_MONGODB_TESTS: "true",
  MONGODB_TEST_URI: `mongodb://${encode(MONGODB_TEST_USERNAME)}:${encode(MONGODB_TEST_PASSWORD)}@localhost:${MONGODB_PORT}/reodite_test?authSource=reodite&replicaSet=rs0&directConnection=true`,
};
const tests = spawnSync(
  "npx",
  ["vitest", "run", "--passWithNoTests=false", "src/server/db/mongo.integration.test.ts"],
  {
    env,
    encoding: "utf8",
  },
);
if (tests.error) throw tests.error;
process.stdout.write(tests.stdout ?? "");
process.stderr.write(tests.stderr ?? "");
if (tests.status !== 0) process.exit(tests.status ?? 1);
const summary = (tests.stdout ?? "").match(/Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?/);
if (!summary || Number(summary[1]) === 0 || Number(summary[2] ?? 0) > 0) {
  throw new Error("MongoDB integration tests did not all run");
}
