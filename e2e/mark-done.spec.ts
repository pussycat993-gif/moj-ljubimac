import { expect, test, type Page } from "@playwright/test";

// ADR-15 flow "mark done" (FR-24 in the product, FR-21): the seeded owner Ivana creates a manual reminder
// for tomorrow on S11, finds it on S10 under Uskoro (its title opens S11 edit, CR-12), marks it "Urađeno"
// and sees it under Urađeno with the time and her first name. Needs the local Supabase stack with the seed
// (`npx supabase start`; seed users: supabase/seed.sql).

/** Clicks an S10 tab until it is selected (the first click can land before hydration). */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("an owner marks a reminder done on S10 and sees it under Urađeno with time and name", async ({ page }) => {
  const title = `Kupi seno — e2e ${Date.now()}`;

  await page.goto("/prijava");
  await page.getByLabel("Mejl adresa").fill("ivana.petrovic@mojljubimac.test");
  await page.getByLabel("Lozinka").fill("MojLjubimac123!");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });

  // S11: a reminder just for me, tomorrow at 09:00.
  await page.goto("/podsetnici/novi");
  await expect(page.getByRole("heading", { level: 1, name: "Novi podsetnik" })).toBeVisible();
  await page.getByLabel("Naslov *").fill(title);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  await page.getByRole("button", { name: /^Datum/ }).click();
  const dialog = page.getByRole("dialog");
  if (tomorrow.getMonth() !== new Date().getMonth()) await dialog.getByRole("button", { name: "Go to the Next Month" }).click();
  await dialog.locator(`[data-day="${iso}"] button`).click();
  await page.getByRole("button", { name: "Sačuvaj podsetnik" }).click();
  await expect(page.getByText(`Podsetnik „${title}“ je sačuvan`)).toBeVisible();
  await page.waitForURL((url) => url.pathname === "/podsetnici");

  // S10 Uskoro: the manual reminder links to S11 edit.
  await openTab(page, /Uskoro/);
  const row = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: title });
  await expect(row.getByRole("link", { name: title })).toHaveAttribute("href", /^\/podsetnici\/[0-9a-f-]{36}$/);

  // "Urađeno" → the row moves to Urađeno with the time and the first name (FR-24).
  await row.getByRole("button", { name: "Urađeno" }).click();
  await expect(page.getByRole("tabpanel").getByText(title)).toHaveCount(0);
  await openTab(page, /Urađeno/);
  const done = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: title });
  await expect(done).toContainText(/\d{1,2}\. \d{1,2}\. \d{4}\. u \d{2}:\d{2} · Ivana/);
  await expect(done.getByRole("button", { name: "Urađeno" })).toHaveCount(0);

  // After a reload it is still done (EP-25 filter=done).
  await page.reload();
  await openTab(page, /Urađeno/);
  await expect(page.getByRole("tabpanel").getByText(title)).toBeVisible();
});
