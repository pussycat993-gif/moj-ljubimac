import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Step 03 follow-up (done in Step F1): public/_headers is the OpenNext Cloudflare adapter's static-assets file. It
// marks the hashed /_next/static/* build files as immutable and sets nothing on app routes.
const headers = readFileSync(join(process.cwd(), "public", "_headers"), "utf8").replace(/\r\n/g, "\n");
const rules = headers.split("\n").filter((line) => line.trim() && !line.startsWith("#"));

describe("public/_headers (Workers static assets)", () => {
  it("caches /_next/static/* for a year as immutable", () => {
    expect(rules).toEqual(["/_next/static/*", "  Cache-Control: public,max-age=31536000,immutable"]);
  });
});
