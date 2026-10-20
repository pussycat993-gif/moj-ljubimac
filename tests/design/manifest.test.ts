import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const token = (name: string) => css.match(new RegExp(`\\s${name}:\\s*(#[0-9A-Fa-f]+);`))?.[1];

const BRAND_FILES = [
  "logo-full.png", "logo-mark.png", "logo-wordmark.png", "logo-original.png",
  "app-icon-180.png", "app-icon-192.png", "app-icon-512.png",
];

describe("web app manifest (Design §4 exception, ADR-05)", () => {
  const m = manifest();

  it("carries exactly the Design §4 fields and values", () => {
    expect(m).toEqual({
      name: "Moj Ljubimac",
      short_name: "Ljubimac",
      start_url: "/ljubimci",
      display: "standalone",
      theme_color: "#563218",
      background_color: "#F6F1EB",
      icons: [
        { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });

  it("theme_color equals --primary and background_color equals --background", () => {
    expect(m.theme_color?.toUpperCase()).toBe(token("--primary")?.toUpperCase());
    expect(m.background_color?.toUpperCase()).toBe(token("--background")?.toUpperCase());
  });

  it("every referenced /brand file exists in public/brand", () => {
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
    }
  });

  it.each(BRAND_FILES)("public/brand/%s equals the 04-design asset", (file) => {
    const served = readFileSync(join(process.cwd(), "public/brand", file));
    const source = readFileSync(join(process.cwd(), "docs/product/04-design/assets", file));
    expect(served.equals(source)).toBe(true);
  });
});
