import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Design §6 "Known prohibition": lucide brand icons must never be imported.
const BRANDS = [
  "Instagram", "Whatsapp", "WhatsApp", "Viber", "Facebook", "Twitter", "Github", "Gitlab", "Linkedin",
  "Youtube", "Twitch", "Slack", "Figma", "Framer", "Dribbble", "Codepen", "Codesandbox", "Chrome",
  "Chromium", "Trello", "Pocket", "Tiktok", "Telegram", "Discord", "Pinterest", "Reddit", "Snapchat",
];
const BRAND_RE = new RegExp(`^(?:Lucide)?(?:${BRANDS.join("|")})(?:Icon)?$`);
const ROOTS = ["app", "components", "lib"];
const IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']lucide-react["']/g;
const DEEP_IMPORT = new RegExp(`from\\s*["']lucide-react/icons/(${BRANDS.join("|")})`, "i");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function brandImports(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(IMPORT)) {
    for (const spec of m[1].split(",")) {
      const name = spec.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name && BRAND_RE.test(name)) found.push(name);
    }
  }
  const deep = source.match(DEEP_IMPORT);
  if (deep) found.push(deep[1]);
  return found;
}

describe("no lucide brand icons (Design §6)", () => {
  it("no source file imports a brand icon", () => {
    const offenders = ROOTS.flatMap((r) => walk(join(process.cwd(), r))).flatMap((f) =>
      brandImports(readFileSync(f, "utf8")).map((n) => `${relative(process.cwd(), f)}: ${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it("detects brand imports (self-check)", () => {
    expect(brandImports('import { Instagram, Mail } from "lucide-react"')).toEqual(["Instagram"]);
    expect(brandImports('import { Phone, FacebookIcon as F } from "lucide-react"')).toEqual(["FacebookIcon"]);
    expect(brandImports('import { Whatsapp } from "lucide-react"')).toEqual(["Whatsapp"]);
    expect(brandImports('import Github from "lucide-react/icons/github"')).toEqual(["github"]);
    expect(brandImports('import { MessageCircle, AtSign } from "lucide-react"')).toEqual([]);
  });
});
