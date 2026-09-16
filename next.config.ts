import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./ubc-unified-data/**/*", "./.cache/**/*"] },
  allowedDevOrigins: ["*"],
  devIndicators: false,
  env: { NEXT_PUBLIC_REOGENT_VERSION: pkg.version },
};

export default nextConfig;
