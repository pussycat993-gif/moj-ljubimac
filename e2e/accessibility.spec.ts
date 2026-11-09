import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// NFR-04 (TC §7, ADR-17): an automated axe check on the core-flow screens of Design §10 — sign-in and
// registration, add pet, add vaccination, mark reminder done, invite member, subscribe — plus the public legal
// pages (RC-4) and the public Šapa pomoći list. Zero critical issues passes; serious / moderate / minor issues are
// attached to the report (and printed) so Step 32 can record them, but they do not fail the run.
// Needs the local Supabase stack with the seed (`npx supabase start`) and the app env, like the other specs.

const PASSWORD = "MojLjubimac123!";
const LUNA = "c1000000-0000-4000-8000-000000000001";

type Screen = { name: string; path: string; ready: (page: Page) => Promise<void>; open?: (page: Page) => Promise<void> };

const h1 = (name: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
};

const PUBLIC_SCREENS: Screen[] = [
  { name: "S27 sign-in", path: "/prijava", ready: h1("Zdravo ponovo") },
  { name: "S28 registration", path: "/registracija", ready: h1("Napravi nalog") },
  { name: "S30 privacy", path: "/privatnost", ready: h1(/Politika privatnosti/) },
  { name: "S31 terms", path: "/uslovi", ready: h1(/Uslovi korišćenja/) },
  { name: "S32 Šapa pomoći (signed out)", path: "/sapa-pomoci", ready: h1("Šapa pomoći") },
];

const OWNER_SCREENS: Screen[] = [
  { name: "S01 pets", path: "/ljubimci", ready: h1(/Ljubimci|Moji ljubimci/) },
  { name: "S02 add pet", path: "/ljubimci/novi", ready: h1("Dodaj ljubimca") },
  { name: "S03 pet record", path: `/ljubimci/${LUNA}`, ready: h1("Luna") },
  { name: "S05 add vaccination", path: `/ljubimci/${LUNA}/vakcine/nova`, ready: h1(/vakcin/i) },
  { name: "S10 reminders", path: "/podsetnici", ready: h1("Podsetnici") },
  { name: "S11 new reminder", path: "/podsetnici/novi", ready: h1("Novi podsetnik") },
  { name: "S13 household", path: "/domacinstvo", ready: h1("Domaćinstvo") },
  {
    name: "S13 invite dialog",
    path: "/domacinstvo",
    ready: h1("Domaćinstvo"),
    open: async (page) => {
      const button = page.getByRole("button", { name: "Pozovi člana" }).first();
      await expect(async () => {
        await button.click();
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
    },
  },
  { name: "S17 Premium", path: "/premium", ready: h1(/Premium/) },
];

async function check(page: Page, screen: Screen, testInfo: TestInfo) {
  await page.goto(screen.path);
  await screen.ready(page);
  await page.waitForLoadState("networkidle");
  if (screen.open) {
    await screen.open(page);
    // Step FX: measure the opened dialog, not its fade-in (overlay and content animate their opacity).
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  }
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  await testInfo.attach(`axe ${screen.name}`, { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  console.log(`[axe] ${screen.name} (${screen.path}): ${JSON.stringify(summary)}`);
  return results.violations.filter((v) => v.impact === "critical").map((v) => `${screen.name}: ${v.id} — ${v.help}`);
}

test("public core-flow screens have no critical axe issues", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const critical: string[] = [];
  for (const screen of PUBLIC_SCREENS) critical.push(...(await check(page, screen, testInfo)));
  expect(critical).toEqual([]);
});

test("signed-in core-flow screens have no critical axe issues", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/prijava");
  await page.getByLabel("Mejl adresa").fill("ivana.petrovic@mojljubimac.test");
  await page.getByLabel("Lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });

  const critical: string[] = [];
  for (const screen of OWNER_SCREENS) critical.push(...(await check(page, screen, testInfo)));
  expect(critical).toEqual([]);
});
