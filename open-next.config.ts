import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache override: public pages render on every request (TC ADR-18).
export default defineCloudflareConfig({});
