import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at runtime; ship them with every serverless function.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  webpack: (config) => {
    // The SQLite file lives in ./data; without this, every DB write triggers a dev recompile loop.
    config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.git/**", "**/data/**"] };
    return config;
  },
};

export default nextConfig;
