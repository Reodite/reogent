import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*"],
  env: { __REOGENT_VERSION__: pkg.version },
};

export default nextConfig;
