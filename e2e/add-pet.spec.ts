import { expect, test, type APIRequestContext } from "@playwright/test";

// ADR-15 flow "add pet" (FR-01): a signed-in Free owner with no pet creates a pet on S02 and sees
// it active on S01. The owner is a fresh verified account (registration path of Step 12), so the
// run starts with no active pet. Needs the local Supabase stack (`npx supabase start`).

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

test("a Free owner adds a pet on S02 and sees it active on S01", async ({ page, request }) => {
  const email = `e2e.ljubimac.${Date.now()}@mojljubimac.test`;

  // A verified Free owner with no pet.
  await page.goto("/registracija");
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill("MojaLozinka123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Napravi nalog" }).click();
  await expect(page.getByRole("heading", { name: "Proveri mejl" })).toBeVisible();
  await page.goto(await verificationLink(request, email));
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });

  // S01 empty state → S02.
  await expect(page.getByRole("heading", { name: "Dodaj svog prvog ljubimca" })).toBeVisible();
  await page.getByRole("link", { name: "Dodaj ljubimca" }).first().click();
  await page.waitForURL("**/ljubimci/novi");
  await expect(page.getByRole("heading", { level: 1, name: "Dodaj ljubimca" })).toBeVisible();

  // Required fields: name, species, sex.
  await page.getByLabel("Ime *").fill("Luna");
  await page.getByRole("combobox", { name: "Vrsta *" }).click();
  await page.getByRole("option", { name: "Mačka" }).click();
  await page.getByRole("radio", { name: "Ženka" }).check();
  await page.getByLabel("Rasa").fill("Britanska kratkodlaka");
  await page.getByRole("button", { name: "Sačuvaj ljubimca" }).click();

  // Saved: toast, then the redirect to the record (S03 arrives in Step 14).
  await expect(page.getByText("Luna je sada među tvojim ljubimcima.")).toBeVisible();
  await page.waitForURL(/\/ljubimci\/[0-9a-f-]{36}$/);

  // S01: the pet is active, and on Free the next "Dodaj ljubimca" opens PremiumLock.
  await page.goto("/ljubimci");
  await expect(page.getByRole("heading", { level: 3, name: "Luna" })).toBeVisible();
  await expect(page.getByText("Britanska kratkodlaka")).toBeVisible();
  await expect(page.getByText("Free · 1 / 1 aktivan ljubimac")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dodaj ljubimca" })).toHaveAttribute("href", "#premium-lock");
  await expect(page.getByText("Dostupno u Premiumu")).toBeVisible();
});
