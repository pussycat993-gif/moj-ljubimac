import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ADR-15 flow "household invitation" (FR-26 … FR-28): the seeded Premium owner Ivana creates a link
// invitation on S13; the seeded owner Marko opens it signed out, signs in from the S14 prompt (next = the
// invitation), accepts, sees the shared pet Luna, whose medical tabs are read-only for him (member banner,
// no "Dodaj vakcinu"), and logs a weight entry. Needs the local Supabase stack with the seed
// (`npx supabase start`) and the app env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL=http://localhost:3000, ACTION_TOKEN_SECRET).
// Marko's membership and his entries on Luna are removed with the service role before and after the run,
// so the spec can repeat.

const HOUSEHOLD = "b1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const PASSWORD = "MojLjubimac123!";

function serviceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed for this spec.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Puts the seed back: Marko is not a member, has no entries on Luna, and no invitation is pending. */
async function removeMarko() {
  const db = serviceRole();
  const invitations = await db
    .from("household_invitations")
    .update({ status: "expired" })
    .eq("household_id", HOUSEHOLD)
    .eq("status", "pending");
  if (invitations.error) throw new Error(invitations.error.message);
  const membership = await db.from("household_memberships").delete().eq("household_id", HOUSEHOLD).eq("user_id", MARKO);
  if (membership.error) throw new Error(membership.error.message);
  const weights = await db.from("weight_entries").delete().eq("pet_id", LUNA).eq("created_by", MARKO);
  if (weights.error) throw new Error(weights.error.message);
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

/** Clicks a tab until it is selected (the first click can land before hydration). */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test.beforeAll(removeMarko);
test.afterAll(removeMarko);

test("a Premium owner invites by link; a second user signs in, accepts and logs weight on the shared pet", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // S13 as the Premium owner: create a link invitation.
  const owner = await newPage(browser);
  await owner.goto("/prijava");
  await signIn(owner, "ivana.petrovic@mojljubimac.test");
  await owner.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });
  await owner.goto("/domacinstvo");
  await expect(owner.getByRole("heading", { level: 1, name: "Domaćinstvo" })).toBeVisible();
  const inviteButton = owner.getByRole("button", { name: "Pozovi člana" }).first();
  const dialog = owner.getByRole("dialog");
  await expect(async () => {
    await inviteButton.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await dialog.getByRole("tab", { name: "Linkom" }).click();
  await dialog.getByRole("button", { name: "Napravi link" }).click();
  const linkField = dialog.getByLabel("Link za poziv");
  await expect(linkField).toHaveValue(/\/poziv\/hh_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  const inviteUrl = new URL(await linkField.inputValue());
  await dialog.getByRole("button", { name: "Zatvori" }).first().click();
  await expect(owner.getByText("Poziv linkom").first()).toBeVisible();

  // S14 signed out → the sign-in prompt; sign in returns to the invitation.
  const invitee = await newPage(browser);
  await invitee.goto(inviteUrl.pathname);
  await expect(invitee.getByRole("heading", { level: 1, name: "Poziv: Domaćinstvo Petrović" })).toBeVisible();
  await invitee.getByRole("link", { name: "Već imam nalog — prijavi me" }).click();
  await invitee.waitForURL((url) => url.pathname === "/prijava");
  await signIn(invitee, "marko.jovanovic@mojljubimac.test");
  await invitee.waitForURL((url) => url.pathname === inviteUrl.pathname, { timeout: 20_000 });

  // Accept.
  await expect(invitee.getByRole("heading", { level: 1, name: "Domaćinstvo Petrović" })).toBeVisible();
  await expect(invitee.getByRole("paragraph").filter({ hasText: /^Luna$/ })).toBeVisible();
  await invitee.getByRole("button", { name: "Prihvati poziv" }).click();
  await expect(invitee.getByRole("heading", { name: "Sada si član: Domaćinstvo Petrović" })).toBeVisible({ timeout: 15_000 });
  await invitee.getByRole("link", { name: "Idi na ljubimce" }).click();
  await invitee.waitForURL((url) => url.pathname === "/ljubimci");
  await expect(invitee.getByRole("heading", { name: "Luna" })).toBeVisible();

  // S03 as a member: read-only medical tabs.
  await invitee.goto(`/ljubimci/${LUNA}`);
  await expect(invitee.getByText(/Ti si član domaćinstva \(vlasnik: Ivana Petrović\)/)).toBeVisible();
  await openTab(invitee, /^Vakcine/);
  await expect(invitee.getByText("Besnilo — Rabisin").first()).toBeVisible();
  await expect(invitee.getByRole("button", { name: "Dodaj vakcinu" })).toHaveCount(0);

  // …and logs a weight entry (FR-28 #1).
  await openTab(invitee, /^Težina/);
  await invitee.getByRole("button", { name: "Dodaj merenje" }).first().click();
  const weightDialog = invitee.getByRole("dialog");
  await weightDialog.getByLabel("Težina (kg) *").fill("4,7");
  await weightDialog.getByRole("button", { name: "Sačuvaj merenje" }).click();
  await expect(invitee.getByText("Merenje je sačuvano.")).toBeVisible({ timeout: 15_000 });

  // The owner's S13 now lists Marko as a member.
  await owner.reload();
  await expect(owner.getByText("Marko Jovanović")).toBeVisible();
});
