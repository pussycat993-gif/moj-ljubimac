import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// PRD UC-11 "give away an item and message the author" (FR-61 … FR-64, FR-68): the seeded Free owner Marko publishes
// a giving listing with one photo on S34; the seeded owner Jelena finds it through the S32 filters, opens S33 and
// sends a message; Marko reloads S36, sees the unread conversation, opens it and replies; Marko marks the listing
// resolved as "given" on S35 and it no longer appears on S32.
//
// External providers stay faked. Resend and Web Push use the local fallbacks (empty RESEND_API_KEY / VAPID keys).
// R2: the photo goes through the real EP-13 path (ticket → browser PUT → server HEAD on confirm → EP-15 signed GET),
// so this spec runs a fake S3-compatible R2 over HTTPS in the test process (self-signed cert made with `openssl`).
// The app must point its R2 env at it when the dev server starts:
//   R2_ACCOUNT_ID=127.0.0.1:<port>/r2  (the adapter builds https://<account>.r2.cloudflarestorage.com/<bucket>/<key>,
//                                        which becomes https://127.0.0.1:<port>/r2.r2.cloudflarestorage.com/…)
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = any placeholder
//   NODE_TLS_REJECT_UNAUTHORIZED=0      (the dev server's HEAD trusts the self-signed cert; local runs only)
// plus the usual NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_SITE_URL=http://localhost:3000 and ACTION_TOKEN_SECRET. The browser contexts ignore the cert error.
// The run's listings (title prefix below), their conversations and Jelena's message rate-limit counter are removed
// with the service role before and after the run, so the spec can repeat.

const MARKO = "a1000000-0000-4000-8000-000000000002";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const PASSWORD = "MojLjubimac123!";
const TITLE_PREFIX = "E2E Poklanjam ogradicu";

// A 1 × 1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function serviceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed for this spec.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanUp() {
  const db = serviceRole();
  const listings = await db.from("listings").select("id").like("title", `${TITLE_PREFIX}%`);
  if (listings.error) throw new Error(listings.error.message);
  const ids = (listings.data ?? []).map((l) => l.id as string);
  if (ids.length > 0) {
    const conversations = await db.from("conversations").delete().in("listing_id", ids);
    if (conversations.error) throw new Error(conversations.error.message);
    const removed = await db.from("listings").delete().in("id", ids);
    if (removed.error) throw new Error(removed.error.message);
  }
  const counters = await db.from("rate_limit_counters").delete().in("user_id", [MARKO, JELENA]).like("operation", "message%");
  if (counters.error) throw new Error(counters.error.message);
}

// ---- Fake R2 (S3 PUT / HEAD / GET / DELETE on an in-memory map, CORS open for the browser PUT and GET) ----

type StoredObject = { body: Buffer; type: string };
const objects = new Map<string, StoredObject>();
let fakeR2: Server | null = null;
let certDir: string | null = null;

function fakeR2Port(): number {
  const match = /^127\.0\.0\.1:(\d+)\/r2$/.exec(process.env.R2_ACCOUNT_ID ?? "");
  if (!match) {
    throw new Error(
      "e2e/sapa-pomoci.spec.ts needs R2_ACCOUNT_ID=127.0.0.1:<port>/r2 and NODE_TLS_REJECT_UNAUTHORIZED=0 for the dev server (see the header).",
    );
  }
  return Number(match[1]);
}

async function startFakeR2() {
  const port = fakeR2Port();
  certDir = mkdtempSync(join(tmpdir(), "fake-r2-"));
  const key = join(certDir, "key.pem");
  const cert = join(certDir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", key, "-out", cert, "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
  ], { stdio: "ignore" });

  fakeR2 = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, PUT, DELETE",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "ETag",
    };
    const path = new URL(req.url ?? "/", "https://127.0.0.1").pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        objects.set(path, { body: Buffer.concat(chunks), type: String(req.headers["content-type"] ?? "application/octet-stream") });
        res.writeHead(200, { ...cors, ETag: '"e2e"' }).end();
      });
      return;
    }
    const found = objects.get(path);
    if (req.method === "DELETE") {
      objects.delete(path);
      res.writeHead(204, cors).end();
      return;
    }
    if (!found) {
      res.writeHead(404, cors).end();
      return;
    }
    res.writeHead(200, { ...cors, "Content-Type": found.type, "Content-Length": String(found.body.length) });
    if (req.method === "HEAD") res.end();
    else res.end(found.body);
  });
  await new Promise<void>((resolve) => fakeR2!.listen(port, "127.0.0.1", resolve));
}

async function stopFakeR2() {
  if (fakeR2) await new Promise<void>((resolve) => fakeR2!.close(() => resolve()));
  if (certDir) rmSync(certDir, { recursive: true, force: true });
}

// ---- helpers ----

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/prijava");
  await page.getByLabel("Mejl adresa").fill(email);
  await page.getByLabel("Lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => url.pathname === "/ljubimci", { timeout: 20_000 });
  return page;
}

/** Picks an option in a Radix Select (the first click can land before hydration). */
async function choose(page: Page, combobox: string, option: string) {
  const trigger = page.getByRole("combobox", { name: combobox });
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole("option", { name: option, exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
}

/** S32 filters: "Poklanjam", Nameštaj za ljubimce, Mačke, Bečej. */
async function filterGifts(page: Page) {
  await page.goto("/sapa-pomoci");
  await expect(page.getByRole("heading", { level: 1, name: "Šapa pomoći" })).toBeVisible();
  const chip = page.getByRole("group", { name: "Vrsta oglasa" }).getByRole("button", { name: "Poklanjam" });
  await expect(async () => {
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await choose(page, "Kategorija", "Nameštaj za ljubimce");
  await choose(page, "Za koga", "Mačke");
  await choose(page, "Grad", "Bečej");
}

test.beforeAll(async () => {
  await cleanUp();
  await startFakeR2();
});

test.afterAll(async () => {
  await stopFakeR2();
  await cleanUp();
});

test("an owner gives away an item with a photo, a second user messages them, and the listing is resolved as given", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const title = `${TITLE_PREFIX} ${Date.now()}`;
  const question = `Zdravo! Da li je ogradica još slobodna? (${Date.now()})`;
  const reply = "Jeste, javi kad možeš da je preuzmeš.";

  // S34 as Marko: a giving listing with one photo.
  const author = await signedIn(browser, "marko.jovanovic@mojljubimac.test");
  await author.goto("/sapa-pomoci/nova");
  await expect(author.getByRole("heading", { level: 1, name: "Novi oglas" })).toBeVisible();
  const giving = author.getByRole("radio", { name: "Poklanjam" });
  await expect(async () => {
    await giving.click();
    await expect(giving).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await author.getByLabel("Naslov *").fill(title);
  await author.getByLabel("Opis *").fill("Drvena ogradica za mačke, 80 cm. Preuzimanje u Bečeju.");
  await choose(author, "Kategorija *", "Nameštaj za ljubimce");
  await choose(author, "Za koga *", "Mačke");
  await choose(author, "Grad *", "Bečej");
  await author.getByTestId("listing-photo-input").setInputFiles({ name: "ogradica.png", mimeType: "image/png", buffer: PNG });
  await expect(author.getByTestId("photo-count")).toContainText("1");
  await author.getByRole("button", { name: "Objavi oglas" }).click();

  await expect(author.getByText(/Oglas je objavljen i aktivan je do/)).toBeVisible({ timeout: 20_000 });
  await author.waitForURL(/\/sapa-pomoci\/[0-9a-f-]{36}$/);
  const listingPath = new URL(author.url()).pathname;
  await expect(author.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(author.getByText("Ovo je tvoj oglas")).toBeVisible();
  // The photo was PUT to (fake) R2, confirmed by the server's HEAD, and S33 shows it from a signed GET.
  expect(objects.size).toBe(1);
  const photo = author.locator("main img").first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // S32 as Jelena: the filters find it; S33 → "Pošalji poruku".
  const buyer = await signedIn(browser, "jelena.nikolic@mojljubimac.test");
  await filterGifts(buyer);
  const card = buyer.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await buyer.waitForURL((url) => url.pathname === listingPath);
  await expect(buyer.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const messageButton = buyer.getByRole("button", { name: "Pošalji poruku" });
  const dialog = buyer.getByRole("dialog");
  await expect(async () => {
    await messageButton.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await dialog.getByLabel("Tvoja poruka").fill(question);
  await dialog.getByRole("button", { name: "Pošalji", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Poruka je poslata.", { timeout: 15_000 });

  // S36 as Marko after a reload: the conversation is unread; open it and reply.
  await author.goto("/poruke");
  await author.reload();
  const inbox = author.getByRole("region", { name: "Razgovori" });
  const row = inbox.getByRole("button").filter({ hasText: `Tvoj oglas: ${title}` });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("nepročitane");
  await expect(row).toContainText(question.slice(0, 30));
  await expect(async () => {
    await row.click();
    await expect(author.getByRole("list", { name: "Poruke u razgovoru" })).toContainText(question, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await author.getByLabel("Nova poruka").fill(reply);
  await author.getByRole("button", { name: "Pošalji poruku" }).click();
  await expect(author.getByRole("list", { name: "Poruke u razgovoru" })).toContainText(reply, { timeout: 15_000 });
  await author.reload();
  await expect(inbox.getByRole("button").filter({ hasText: `Tvoj oglas: ${title}` })).not.toContainText("nepročitane");

  // S35 as Marko: resolve as "given".
  await author.goto("/sapa-pomoci/moje");
  await expect(author.getByRole("heading", { level: 1, name: "Moji oglasi" })).toBeVisible();
  const actions = author.getByRole("button", { name: `Radnje: ${title}` });
  await expect(async () => {
    await actions.click();
    await expect(author.getByRole("menuitem", { name: "Označi kao rešeno" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await author.getByRole("menuitem", { name: "Označi kao rešeno" }).click();
  const confirm = author.getByRole("alertdialog");
  await expect(confirm).toContainText("Označiti kao rešeno — Poklonjeno?");
  await confirm.getByRole("button", { name: "Da, rešeno je" }).click();
  await expect(author.getByText("Oglas je označen kao rešen — Poklonjeno.")).toBeVisible({ timeout: 15_000 });

  // S32 as Jelena: the listing is gone from the filtered list.
  await filterGifts(buyer);
  await expect(buyer.getByText(/oglas(a)? · najnoviji prvo|Nema oglasa za ove filtere/)).toBeVisible({ timeout: 15_000 });
  await expect(buyer.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
});
