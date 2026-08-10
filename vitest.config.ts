import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["src/**/*.test.ts", "app/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
