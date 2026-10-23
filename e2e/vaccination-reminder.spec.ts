import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// ADR-15 flow "add vaccination and see the reminder" (FR-20 display): a fresh verified owner adds a pet
// and a vaccination with a next-dose date on S04; the reminder the trigger created shows on S03 Pregled
// ("Sledeći podsetnici") and on S10 under Uskoro. Needs the local Supabase stack (`npx supabase start`).

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${email}"` } });
        const { messages = [] } = (await search.json()) as { messages?: { ID: string }[] };
        if (messages.length === 0) return false;
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const { Text = "", HTML = "" } = (await message.json()) as { Text?: string; HTML?: string };
        link = `${Text}\n${HTML}`.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0]?.replace(/&amp;/g, "&");
        return !!link;
      },
      { timeout: 20_000, message: "verification email in Mailpit" },
    )
    .toBe(true);
  return link!;
}

/** Calendar day `days` from today (local), as react-day-picker's `data-day`. */
function dayFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { iso, nextMonth: d.getMonth() !== new Date().getMonth() };
}

async function pickDay(page: Page, field: RegExp, days: number) {
  const { iso, nextMonth } = dayFromToday(days);
  await page.getByRole("button", { name: field }).click();
  const dialog = page.getByRole("dialog");
  if (nextMonth) await dialog.getByRole("button", { name: "Go to the Next Month" }).click();
  await dialog.locator(`[data-day="${iso}"] button`).click();
}

/** Clicks an S10 tab until it is selected (the first click can land before hydration). */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("a vaccination with a next-dose date shows its reminder on S03 Pregled and on S10", async ({ page, request }) => {
  const email = `e2e.vakcina.${Date.now()}@mojljubimac.test`;
  const vaccine = `Besnilo — e2e ${Date.now()}`;

  // A verified Free owner with one pet.
  await page.goto("/registracija");
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill("MojaLozinka123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Napravi nalog" }).click();
  await expect(page.getByRole("heading", { name: "Proveri mejl" })).toBeVisible();
  await page.goto(await verificationLink(request, email));
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });
  await page.getByRole("link", { name: "Dodaj ljubimca" }).first().click();
  await page.waitForURL("**/ljubimci/novi");
  await page.getByLabel("Ime *").fill("Luna");
  await page.getByRole("combobox", { name: "Vrsta *" }).click();
  await page.getByRole("option", { name: "Mačka" }).click();
  await page.getByRole("radio", { name: "Ženka" }).check();
  await page.getByRole("button", { name: "Sačuvaj ljubimca" }).click();
  await page.waitForURL(/\/ljubimci\/[0-9a-f-]{36}$/);
  const recordUrl = page.url();

  // S04: a vaccination given today, next dose in 5 days.
  await page.goto(`${recordUrl}/vakcine/nova`);
  await page.getByLabel("Naziv ili vrsta vakcine *").fill(vaccine);
  await pickDay(page, /^Datum sledeće doze/, 5);
  await page.getByRole("button", { name: "Sačuvaj vakcinu" }).click();
  await page.waitForURL(recordUrl);

  // S03 Pregled: "Sledeći podsetnici" lists the vaccination reminder.
  await expect(page.getByRole("heading", { name: "Sledeći podsetnici" })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText(vaccine)).toBeVisible();
  await expect(page.getByRole("link", { name: "Svi podsetnici" })).toHaveAttribute("href", "/podsetnici");

  // S10: under Uskoro, without an edit link (generated reminders are edited at their source).
  await page.getByRole("link", { name: "Svi podsetnici" }).click();
  await page.waitForURL("**/podsetnici");
  await openTab(page, /Uskoro/);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText(vaccine)).toBeVisible();
  await expect(panel.getByRole("link", { name: vaccine })).toHaveCount(0);
});
