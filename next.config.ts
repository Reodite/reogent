import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*"],
  env: { NEXT_PUBLIC_REOGENT_VERSION: pkg.version },
};

export default nextConfig;
