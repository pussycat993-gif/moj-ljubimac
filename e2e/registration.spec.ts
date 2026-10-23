import { expect, test, type APIRequestContext } from "@playwright/test";

// ADR-15 flow "registration" (FR-33): email + password sign-up → "Proveri mejl" → the app is
// refused until the email is verified → the local verification link → /ljubimci.
// Needs the local Supabase stack (`npx supabase start`); its mail lands in Mailpit.

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

test("register with email and password; the product is usable only after verification", async ({ page, request }) => {
  const email = `e2e.registracija.${Date.now()}@mojljubimac.test`;

  await page.goto("/registracija");
  await expect(page.getByRole("heading", { name: "Napravi nalog" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Vlasnik/ })).toBeChecked();
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill("MojaLozinka123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Napravi nalog" }).click();

  await expect(page.getByRole("heading", { name: "Proveri mejl" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Not verified: a signed-in surface is refused.
  await page.goto("/ljubimci");
  await expect(page).toHaveURL(/\/prijava$/);

  // Signing in before verification is refused too (403 email_not_verified).
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill("MojaLozinka123");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByText("Mejl adresa još nije potvrđena.", { exact: false })).toBeVisible();

  // The local verification link → /auth/callback → complete_registration → /ljubimci.
  await page.goto(await verificationLink(request, email));
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });

  // The account now works: S18 renders in the app shell with the registered email.
  await page.goto("/profil");
  await expect(page.getByRole("heading", { level: 1, name: "Profil" })).toBeVisible();
  await expect(page.getByLabel("Mejl adresa")).toHaveValue(email);
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" }).first()).toBeVisible();
});
