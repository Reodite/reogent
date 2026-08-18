import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
