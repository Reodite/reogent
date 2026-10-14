import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
    // Let Happy DOM own browser storage instead of Node's process-wide storage.
    execArgv: ["--no-experimental-webstorage"],
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
