import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // CLAUDE.md is the agent instruction file; stop `next dev` from writing AGENTS.md.
  agentRules: false,
};

export default nextConfig;
