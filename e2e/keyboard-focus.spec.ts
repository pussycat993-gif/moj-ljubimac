import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Step FX — the Step 32 NFR-04 findings, checked in the real browser (Design §10, WCAG 2.4.3 / 2.4.7 / 1.4.3):
// D-03 inactive tab labels reach 4.5:1 (axe color-contrast) on S03, S10 and the S13 invite dialog;
// D-04 after "Urađeno" on S10 keyboard focus stays in the list; D-05 the S13 invite dialog gives focus back to
// "Pozovi člana"; D-06 a focused tab panel shows a ring; D-07 the S04 date picker closes after a pick, keeps the
// required date when the selected day is clicked again, and names its buttons in Serbian.
// Needs the local Supabase stack with the seed (`npx supabase start`), like the other specs.

const LUNA = "c1000000-0000-4000-8000-000000000001";

async function signIn(page: Page) {
  await page.goto("/prijava");
  await page.getByLabel("Mejl adresa").fill("ivana.petrovic@mojljubimac.test");
  await page.getByLabel("Lozinka").fill("MojLjubimac123!");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });
}

/** Clicks an S10 tab until it is selected (the first click can land before hydration). */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

test("D-03: tab labels pass axe color-contrast on S03, S10 and the S13 invite dialog", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const failures: string[] = [];
  const contrast = async (name: string) => {
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    for (const v of results.violations) for (const n of v.nodes) failures.push(`${name}: ${n.target.join(" ")} — ${n.failureSummary ?? ""}`);
  };

  await page.goto(`/ljubimci/${LUNA}`);
  await expect(page.getByRole("heading", { level: 1, name: "Luna" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await contrast("S03");

  await page.goto("/podsetnici");
  await expect(page.getByRole("heading", { level: 1, name: "Podsetnici" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await contrast("S10");

  await page.goto("/domacinstvo");
  await expect(page.getByRole("heading", { level: 1, name: "Domaćinstvo" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const invite = page.getByRole("button", { name: "Pozovi člana" }).first();
  await expect(async () => {
    await invite.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // Measure the opened dialog, not its fade-in (the overlay and content animate their opacity).
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await contrast("S13 invite dialog");

  expect(failures).toEqual([]);
});

test("D-04 and D-06: keyboard focus after 'Urađeno' on S10 and a visible ring on the tab panel", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const title = `Fokus — e2e ${Date.now()}`;

  // A reminder for tomorrow (S11), so it is listed under Uskoro.
  await page.goto("/podsetnici/novi");
  await expect(page.getByRole("heading", { level: 1, name: "Novi podsetnik" })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Naslov *").fill(title);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  await page.getByRole("button", { name: /^Datum/ }).click();
  const calendar = page.getByRole("dialog");
  if (tomorrow.getMonth() !== new Date().getMonth()) await calendar.getByRole("button", { name: "Idi na sledeći mesec" }).click();
  await calendar.locator(`[data-day="${iso}"] button`).click();
  await page.getByRole("button", { name: "Sačuvaj podsetnik" }).click();
  await page.waitForURL((url) => url.pathname === "/podsetnici", { timeout: 20_000 });

  // D-06: Tab from the selected tab lands on the panel, which shows a ring.
  await openTab(page, /Uskoro/);
  await page.getByRole("tab", { name: /Uskoro/ }).focus();
  await page.keyboard.press("Tab");
  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeFocused();
  const ring = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, shadow: s.boxShadow };
  });
  expect(ring.outline !== "none" || (ring.shadow !== "none" && ring.shadow !== "")).toBe(true);

  // D-04: "Urađeno" with the keyboard → focus stays on the page, not on <body>.
  const row = panel.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Urađeno" }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByText(title)).toHaveCount(0);
  await expect.poll(() => activeIsBody(page)).toBe(false);
  const inPanel = await page.evaluate(() => !!document.activeElement?.closest('[role="tabpanel"]'));
  expect(inPanel).toBe(true);
});

test("D-05: the S13 invite dialog returns focus to 'Pozovi člana' on Escape", async ({ page }) => {
  await signIn(page);
  await page.goto("/domacinstvo");
  await expect(page.getByRole("heading", { level: 1, name: "Domaćinstvo" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const invite = page.getByRole("button", { name: "Pozovi člana" }).first();
  await expect(async () => {
    await invite.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(invite).toBeFocused();
});

test("D-07: the S04 date picker closes after a pick, keeps the required date and speaks Serbian", async ({ page }) => {
  await signIn(page);
  await page.goto(`/ljubimci/${LUNA}/vakcine/nova`);
  const field = page.getByRole("button", { name: /^Datum davanja/ });
  await expect(field).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const before = (await field.textContent()) ?? "";
  expect(before).toMatch(/\d{1,2}\. \d{1,2}\. \d{4}\./);

  await expect(async () => {
    await field.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const calendar = page.getByRole("dialog");
  await expect(calendar.getByRole("button", { name: "Idi na prethodni mesec" })).toBeVisible();
  await expect(calendar.getByRole("button", { name: /Go to the/ })).toHaveCount(0);
  const selected = calendar.getByRole("button", { name: /^Danas, .*izabrano$/ });
  await expect(selected).toBeVisible();

  // Clicking the already selected day: the calendar closes and the required date stays.
  await selected.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(field).toHaveText(before);
  await expect(field).toBeFocused();
});
