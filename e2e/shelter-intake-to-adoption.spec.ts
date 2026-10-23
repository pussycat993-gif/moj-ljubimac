import { createHash, createHmac, randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ADR-15 flow "shelter intake to adoption" (FR-44 … FR-47, FR-50): the seeded shelter admin Milica records an
// intake on S20 and makes the animal available; the animal shows on the public page /o/azil-sapica (S23, rendered on
// every request — TC ADR-18); the seeded Premium owner Ivana sends an adoption request from S23; Milica accepts it on
// S21 (the animal becomes Reserved and leaves the public page) and sends the record; Ivana accepts the transfer on
// S14 and owns the record (S01). Owner decisions (Step 26): the seeded shelter is approved with the service role in
// setup; after "Pošalji karton" the spec mints a tr_ token for the newest transfer, overwrites its token_hash and
// accepts as the seeded Premium owner (the email is not read). Needs the local Supabase stack with the seed and the
// app env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_SITE_URL=http://localhost:3000, ACTION_TOKEN_SECRET; R2_* may be placeholders — no file is copied).
// The run's animals, Ivana's copy and her request rate-limit counter are removed before and after, and the shelter
// goes back to pending, so the spec can repeat.

const SHELTER = "b2000000-0000-4000-8000-000000000001";
const IVANA = "a1000000-0000-4000-8000-000000000001";
const PASSWORD = "MojLjubimac123!";
const NAME_PREFIX = "E2E Bubi";

function serviceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed for this spec.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Removes the run's animals (the shelter's original cascades its intake, request and transfer) and Ivana's copy. */
async function cleanUp() {
  const db = serviceRole();
  for (const [column, value] of [
    ["organisation_id", SHELTER],
    ["owner_id", IVANA],
  ] as const) {
    const removed = await db.from("pets").delete().eq(column, value).like("name", `${NAME_PREFIX}%`);
    if (removed.error) throw new Error(removed.error.message);
  }
  const counters = await db.from("rate_limit_counters").delete().eq("user_id", IVANA).eq("operation", "org_requests.create");
  if (counters.error) throw new Error(counters.error.message);
}

async function setShelterApproval(status: "approved" | "pending") {
  const result = await serviceRole().from("organisations").update({ approval_status: status }).eq("id", SHELTER);
  if (result.error) throw new Error(result.error.message);
}

function base64url(bytes: Buffer) {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A tr_ token in the API §9.3 format (signed like lib/server/action-tokens.ts) and its stored SHA-256 hash. */
function mintTransferToken(transferId: string) {
  const secret = process.env.ACTION_TOKEN_SECRET || "e2e-local-secret";
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const payload = ["tr", transferId, String(exp), base64url(randomBytes(12))].join("|");
  const signed = `tr_${base64url(Buffer.from(payload, "utf8"))}`;
  const token = `${signed}.${base64url(createHmac("sha256", secret).update(signed).digest())}`;
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

async function signIn(page: Page, email: string) {
  await page.goto("/prijava");
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test.beforeAll(async () => {
  await cleanUp();
  await setShelterApproval("approved");
});

test.afterAll(async () => {
  await cleanUp();
  await setShelterApproval("pending");
});

test("a shelter takes in an animal, an adopter requests it on the public page, and receives the record", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const name = `${NAME_PREFIX} ${Date.now() % 100_000}`;

  // S20 as the shelter admin: intake.
  const shelter = await newPage(browser);
  await signIn(shelter, "milica.stojanovic@mojljubimac.test");
  await shelter.waitForURL((url) => url.pathname === "/organizacija", { timeout: 20_000 });
  const intakeButton = shelter.getByRole("button", { name: "Novi prijem" }).first();
  const intake = shelter.getByRole("dialog", { name: "Novi prijem" });
  await expect(async () => {
    await intakeButton.click();
    await expect(intake).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await intake.getByLabel("Ime ili nadimak *").fill(name);
  await intake.getByRole("combobox", { name: "Način dolaska *" }).click();
  await shelter.getByRole("option", { name: "Pronađen" }).click();
  await intake.getByRole("button", { name: "Sačuvaj prijem" }).click();
  await expect(intake).toBeHidden({ timeout: 15_000 });

  // … then "Za udomljavanje" from the row menu.
  await shelter.getByRole("button", { name: `Radnje za ${name}` }).click();
  await shelter.getByRole("menuitem", { name: "Promeni status" }).click();
  await shelter.getByRole("menuitemradio", { name: "Za udomljavanje" }).click();
  await expect(shelter.getByRole("row", { name: new RegExp(name) })).toContainText("Za udomljavanje", { timeout: 15_000 });

  // S23 as the adopter: the animal is on the public page (next request, no cache) → send a request.
  const adopter = await newPage(browser);
  await signIn(adopter, "ivana.petrovic@mojljubimac.test");
  await adopter.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });
  await adopter.goto("/o/azil-sapica");
  await expect(adopter.getByRole("heading", { level: 1, name: "Azil Šapica" })).toBeVisible();
  const card = adopter.locator('[data-slot="card"]').filter({ has: adopter.getByRole("heading", { level: 3, name }) });
  await expect(card).toBeVisible();
  const request = adopter.getByRole("dialog", { name: `Zahtev za udomljavanje — ${name}` });
  await expect(async () => {
    await card.getByRole("button", { name: "Pošalji zahtev" }).click();
    await expect(request).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(request.getByLabel("Ime i prezime *")).toHaveValue("Ivana Petrović");
  await request.getByLabel("Telefon *").fill("+381 64 555 1234");
  await request.getByLabel("Poruka").fill("Imam dvorište i iskustva sa psima.");
  await request.getByRole("button", { name: "Pošalji zahtev" }).click();
  await expect(adopter.getByRole("dialog", { name: "Zahtev je poslat" })).toBeVisible({ timeout: 15_000 });

  // S21 as the shelter: accept (Reserved) and send the record.
  await shelter.goto("/organizacija/zahtevi");
  const requestCard = shelter
    .locator('[data-slot="card"]')
    .filter({ has: shelter.getByRole("heading", { level: 2, name }) })
    .filter({ hasText: "Ivana Petrović" });
  await expect(requestCard).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await requestCard.getByRole("button", { name: "Prihvati" }).click({ timeout: 1_000 });
    await expect(shelter.getByText(`${name} — status: Rezervisan. Poslali smo mejl: Ivana Petrović.`)).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 20_000 });

  // The reserved animal is no longer on the public page (next request).
  await adopter.goto("/o/azil-sapica");
  await expect(adopter.getByRole("heading", { level: 1, name: "Azil Šapica" })).toBeVisible();
  await expect(adopter.getByRole("heading", { level: 3, name })).toHaveCount(0);

  await requestCard.getByRole("button", { name: "Pošalji karton" }).click();
  const transfer = shelter.getByRole("dialog", { name: `Pošalji karton — ${name}` });
  await expect(transfer.getByLabel("Mejl novog vlasnika *")).toHaveValue("ivana.petrovic@mojljubimac.test");
  await transfer.getByRole("button", { name: "Pošalji poziv" }).click();
  await expect(shelter.getByText(`Karton za ${name} je poslat na ivana.petrovic@mojljubimac.test.`)).toBeVisible({
    timeout: 15_000,
  });

  // The emailed link is not read: mint a tr_ token for the newest transfer and store its hash (owner decision).
  const db = serviceRole();
  const original = await db.from("pets").select("id").eq("organisation_id", SHELTER).eq("name", name).single();
  if (original.error) throw new Error(original.error.message);
  const newest = await db
    .from("record_transfers")
    .select("id")
    .eq("pet_id", original.data.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (newest.error) throw new Error(newest.error.message);
  const { token, hash } = mintTransferToken(newest.data.id);
  const stored = await db.from("record_transfers").update({ token_hash: hash }).eq("id", newest.data.id);
  if (stored.error) throw new Error(stored.error.message);

  // S14 as the adopter: accept the record → it is hers (S01).
  await adopter.goto(`/poziv/${token}`);
  await expect(adopter.getByRole("heading", { level: 1, name: `Stiže ti karton: ${name}` })).toBeVisible({ timeout: 15_000 });
  await adopter.getByRole("button", { name: "Prihvati karton" }).click();
  await expect(adopter.getByRole("heading", { name: `Novi ljubimac: ${name}` })).toBeVisible({ timeout: 20_000 });
  await adopter.getByRole("link", { name: "Idi na ljubimce" }).click();
  await adopter.waitForURL((url) => url.pathname === "/ljubimci");
  await expect(adopter.getByRole("heading", { name })).toBeVisible();

  const copy = await db.from("pets").select("owner_id, organisation_id").eq("owner_id", IVANA).eq("name", name).single();
  if (copy.error) throw new Error(copy.error.message);
  expect(copy.data).toEqual({ owner_id: IVANA, organisation_id: null });
});
