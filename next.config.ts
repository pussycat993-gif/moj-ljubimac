import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cache Components (and partialPrefetching, which requires it) is off: with it on, the
  // OpenNext adapter's Workers runtime hangs on page renders (TC RISK-11 — keep to
  // well-supported features). Pages render on every request anyway (TC ADR-18).
  cacheComponents: false,
  // CLAUDE.md is the agent instruction file; stop `next dev` from writing AGENTS.md.
  agentRules: false,
};

export default nextConfig;

// Gives `next dev` access to the Cloudflare bindings (OpenNext adapter, TC ADR-03).
initOpenNextCloudflareForDev();
