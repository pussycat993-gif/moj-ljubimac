// @vitest-environment node
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EXPORT_TTL_MS,
  MAX_ARCHIVE_BYTES,
  formatArchiveSize,
  processExport,
  type ExportDb,
} from "@/app/api/internal/exports/build-archive";
import { renderEmail, type EmailTemplate } from "@/lib/integrations/resend";

// FR-41 (archive delivery), EP-50 side effects — the builder of /api/internal/exports with the service-role client,
// R2 and Resend faked. For a seeded-like user it produces one ZIP with data.json (profile, pets, records, care log,
// moments, reminders, …) and files/<r2_key> for the attachments and photos; the row becomes ready with r2_key,
// size_bytes, ready_at and expires_at = ready_at + 7 days and the data_export_ready email is sent; a failing R2
// read (or upload, or > 90 MB) sets the row to failed and sends nothing.

type Row = Record<string, unknown>;

const USER = "00000000-0000-0000-0000-000000000002";
const OTHER = "00000000-0000-0000-0000-000000000001";
const PET = "c1000000-0000-0000-0000-000000000003";
const OTHER_PET = "c1000000-0000-0000-0000-000000000009";
const EXPORT_ID = "e1000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-19T08:00:00Z");

const PET_PHOTO = `u/${USER}/pets/${PET}/photo/aaaa-kiki.jpg`;
const ATTACHMENT = `u/${USER}/pets/${PET}/visits/v1/bbbb-nalaz.pdf`;
const MOMENT_PHOTO = `u/${USER}/pets/${PET}/moments/m1/1-cccc-park.jpg`;
const LISTING_PHOTO = `u/${USER}/listings/l1/dddd-oglas.jpg`;

function seed(): Record<string, Row[]> {
  return {
    profiles: [
      { id: USER, full_name: "Marko Marković", email: "marko@example.com", locale: "sr-Latn", account_type: "owner" },
      { id: OTHER, full_name: "Ivana", email: "ivana@example.com", locale: "en", account_type: "owner" },
    ],
    subscriptions: [
      {
        id: "s1",
        user_id: USER,
        plan: "premium_monthly",
        status: "active",
        provider_customer_id: "ctm_test_1",
        provider_subscription_id: "sub_test_1",
        card_brand: "visa",
      },
    ],
    pets: [
      { id: PET, owner_id: USER, name: "Kiki", photo_r2_key: PET_PHOTO, lifecycle: "active" },
      { id: OTHER_PET, owner_id: OTHER, name: "Tuđi", photo_r2_key: null, lifecycle: "active" },
    ],
    weight_entries: [{ id: "w1", pet_id: PET, value: 4.2 }, { id: "w2", pet_id: OTHER_PET, value: 9 }],
    vaccinations: [{ id: "va1", pet_id: PET, name: "Besnilo" }],
    treatments: [{ id: "t1", pet_id: PET, name: "Milbemax" }],
    dose_logs: [{ id: "d1", treatment_id: "t1" }],
    vet_visits: [{ id: "v1", pet_id: PET, reason: "Kontrola" }],
    attachments: [{ id: "a1", pet_id: PET, vet_visit_id: "v1", file_name: "nalaz.pdf", r2_key: ATTACHMENT }],
    memorial_records: [],
    feeding_entries: [{ id: "f1", pet_id: PET, type: "dry" }],
    stool_entries: [{ id: "st1", pet_id: PET, consistency: "normal" }],
    moments: [{ id: "m1", pet_id: PET, text: "Park" }],
    moment_photos: [{ id: "mp1", moment_id: "m1", position: 1, r2_key: MOMENT_PHOTO }],
    moment_public_links: [{ id: "ml1", moment_id: "m1", slug: "kiki-park" }],
    reminders: [{ id: "r1", user_id: USER, pet_id: PET, type: "vaccination" }, { id: "r2", user_id: OTHER, type: "custom" }],
    reminder_occurrences: [{ id: "o1", reminder_id: "r1" }, { id: "o2", reminder_id: "r2" }],
    reminder_preferences: [{ id: "rp1", user_id: USER, type: "vaccination" }],
    user_channels: [{ id: "uc1", user_id: USER, channel: "whatsapp" }],
    households: [{ id: "h1", owner_id: USER, name: "Kod Marka" }, { id: "h2", owner_id: OTHER, name: "Kod Ivane" }],
    household_memberships: [{ id: "hm1", household_id: "h1", user_id: OTHER }, { id: "hm2", household_id: "h2", user_id: USER }],
    household_pets: [{ household_id: "h1", pet_id: PET }],
    listings: [{ id: "l1", author_id: USER, title: "Poklanjam mace" }],
    listing_photos: [{ id: "lp1", listing_id: "l1", position: 1, r2_key: LISTING_PHOTO }],
    conversations: [{ id: "c1", listing_id: "l1", starter_id: OTHER, owner_id: USER }],
    messages: [{ id: "mg1", conversation_id: "c1", sender_id: OTHER, body: "Zdravo" }],
    reports: [{ id: "rep1", reporter_id: USER, reason: "spam" }],
    user_blocks: [{ id: "b1", blocker_id: USER, blocked_id: OTHER }],
    data_exports: [{ id: EXPORT_ID, user_id: USER, status: "preparing", requested_at: "2026-10-19T07:55:00Z" }],
  };
}

/** In-memory stand-in for the service-role client: select/in/eq/order/range/limit and update/eq. */
function fakeDb(tables: Record<string, Row[]>, failTables: Set<string> = new Set()): ExportDb {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let limit: number | null = null;
      let patch: Row | null = null;
      const run = () => {
        if (failTables.has(table)) return { data: null, error: { message: "boom" } };
        const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (patch) {
          for (const row of rows) Object.assign(row, patch);
          return { data: null, error: null };
        }
        let out = rows.map((row) => ({ ...row }));
        if (range) out = out.slice(range[0], range[1] + 1);
        if (limit !== null) out = out.slice(0, limit);
        return { data: out, error: null };
      };
      const query = {
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: readonly unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        order() {
          return query;
        },
        range(from: number, to: number) {
          range = [from, to];
          return query;
        },
        limit(count: number) {
          limit = count;
          return query;
        },
        then<T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return {
        select: () => query,
        update: (values: Row) => {
          patch = values;
          return query;
        },
      };
    },
  } as unknown as ExportDb;
}

function fakeStorage(objects: Record<string, Uint8Array>) {
  const puts: { key: string; body: Uint8Array; contentType: string }[] = [];
  const gets: string[] = [];
  return {
    puts,
    gets,
    failGet: new Set<string>(),
    failPut: false,
    async get(key: string) {
      gets.push(key);
      if (this.failGet.has(key) || !(key in objects)) throw new Error("R2 GET failed with 500");
      return objects[key];
    },
    async put(key: string, body: Uint8Array, contentType: string) {
      if (this.failPut) throw new Error("R2 PUT failed with 500");
      puts.push({ key, body, contentType });
    },
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);

let tables: Record<string, Row[]>;
let storage: ReturnType<typeof fakeStorage>;
let sent: { to: string; template: EmailTemplate; locale: string }[];
const send = vi.fn(async (input: { to: string; template: EmailTemplate; locale: "sr" | "en" }) => {
  sent.push(input);
  return { status: "delivered" as const, id: "local-1" };
});

beforeEach(() => {
  tables = seed();
  storage = fakeStorage({
    [PET_PHOTO]: bytes("kiki-photo"),
    [ATTACHMENT]: bytes("%PDF-nalaz"),
    [MOMENT_PHOTO]: bytes("park-photo"),
    [LISTING_PHOTO]: bytes("oglas-photo"),
  });
  sent = [];
  send.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const row = () => ({ id: EXPORT_ID, user_id: USER, requested_at: "2026-10-19T07:55:00Z" });
const deps = () => ({ supabase: fakeDb(tables), storage, send, now: () => NOW, siteUrl: "https://mojljubimac.rs" });

describe("data export builder (FR-41, EP-50)", () => {
  it("builds one ZIP with all the user's data, records, attachments and photos", async () => {
    const outcome = await processExport(row(), deps());
    expect(outcome.status).toBe("ready");

    expect(storage.puts).toHaveLength(1);
    const [upload] = storage.puts;
    expect(upload.key).toBe(`exports/${USER}/${EXPORT_ID}.zip`);
    expect(upload.contentType).toBe("application/zip");

    const files = unzipSync(upload.body);
    expect(Object.keys(files).sort()).toEqual(
      ["data.json", `files/${ATTACHMENT}`, `files/${LISTING_PHOTO}`, `files/${MOMENT_PHOTO}`, `files/${PET_PHOTO}`].sort(),
    );
    expect(new TextDecoder().decode(files[`files/${ATTACHMENT}`])).toBe("%PDF-nalaz");
    expect(new TextDecoder().decode(files[`files/${PET_PHOTO}`])).toBe("kiki-photo");

    const data = JSON.parse(new TextDecoder().decode(files["data.json"])) as Record<string, Row[] & Row>;
    expect(data.exported_at).toBe(NOW.toISOString());
    expect((data.profile as Row).id).toBe(USER);
    expect(data.pets.map((p) => p.id)).toEqual([PET]);
    for (const table of ["weight_entries", "vaccinations", "treatments", "dose_logs", "vet_visits", "attachments"]) {
      expect(data[table].length, table).toBe(1);
    }
    expect(data.feeding_entries).toHaveLength(1);
    expect(data.stool_entries).toHaveLength(1);
    expect(data.moments).toHaveLength(1);
    expect(data.moment_photos).toHaveLength(1);
    expect(data.reminders.map((r) => r.id)).toEqual(["r1"]);
    expect(data.reminder_occurrences.map((o) => o.id)).toEqual(["o1"]);
    expect(data.reminder_preferences).toHaveLength(1);
    expect(data.households.map((h) => h.id).sort()).toEqual(["h1", "h2"]);
    expect(data.household_memberships.map((m) => m.id).sort()).toEqual(["hm1", "hm2"]);
    expect(data.listings).toHaveLength(1);
    expect(data.conversations).toHaveLength(1);
    expect(data.messages).toHaveLength(1);
    expect(data.reports).toHaveLength(1);
    expect(data.user_blocks).toHaveLength(1);
    // Nothing of other users' own records, and no provider ids (Step 31: the Paddle customer / subscription ids).
    expect(data.weight_entries.map((w) => w.id)).toEqual(["w1"]);
    expect(data.subscriptions[0]).not.toHaveProperty("provider_customer_id");
    expect(data.subscriptions[0]).not.toHaveProperty("provider_subscription_id");
    expect(data.subscriptions[0]).toMatchObject({ plan: "premium_monthly", status: "active", card_brand: "visa" });
  });

  it("marks the row ready with r2_key, size_bytes, ready_at and expires_at = ready_at + 7 days", async () => {
    const outcome = await processExport(row(), deps());
    const stored = tables.data_exports[0];
    expect(stored.status).toBe("ready");
    expect(stored.r2_key).toBe(`exports/${USER}/${EXPORT_ID}.zip`);
    expect(stored.size_bytes).toBe(storage.puts[0].body.byteLength);
    expect(outcome).toEqual({ status: "ready", r2_key: stored.r2_key, size_bytes: stored.size_bytes });
    expect(stored.ready_at).toBe(NOW.toISOString());
    expect(new Date(stored.expires_at as string).getTime() - new Date(stored.ready_at as string).getTime()).toBe(EXPORT_TTL_MS);
    expect(EXPORT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("sends the data_export_ready email in the recipient's locale", async () => {
    await processExport(row(), deps());
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toBe("marko@example.com");
    expect(email.locale).toBe("sr");
    expect(email.template.id).toBe("data_export_ready");
    const variables = email.template.variables as { size: string; date: string; url: string };
    expect(variables.date).toBe("26. 10. 2026.");
    expect(variables.url).toBe("https://mojljubimac.rs/profil/podaci");
    expect(variables.size).toMatch(/^\d+ kB$/);

    const rendered = renderEmail(email.template, "sr");
    expect(rendered.subject).toBe("Tvoji podaci su spremni");
    expect(rendered.text).toContain(`je spremna (${variables.size}). Link važi do 26. 10. 2026.\n`);
    expect(rendered.text).toContain("Preuzmi podatke: https://mojljubimac.rs/profil/podaci");
  });

  it("renders the English email and formats the size with Intl", () => {
    const rendered = renderEmail(
      { id: "data_export_ready", variables: { size: formatArchiveSize(13_002_342, "en"), date: "26 Oct 2026", url: "https://x/profil/podaci" } },
      "en",
    );
    expect(rendered.subject).toBe("Your data is ready");
    expect(rendered.text).toContain("The archive with all your data and records is ready (12.4 MB). The link is valid until 26 Oct 2026.");
    expect(rendered.text).toContain("Download data: https://x/profil/podaci");
    expect(formatArchiveSize(13_002_342, "sr")).toBe("12,4 MB");
    expect(formatArchiveSize(2048, "sr")).toBe("2 kB");
  });

  it("a failing R2 read sets the row to failed, uploads nothing and sends no email", async () => {
    storage.failGet.add(ATTACHMENT);
    const outcome = await processExport(row(), deps());
    expect(outcome.status).toBe("failed");
    expect(tables.data_exports[0].status).toBe("failed");
    expect(tables.data_exports[0].r2_key).toBeUndefined();
    expect(storage.puts).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("a failing upload or database read sets failed too", async () => {
    storage.failPut = true;
    expect((await processExport(row(), deps())).status).toBe("failed");
    expect(tables.data_exports[0].status).toBe("failed");

    tables = seed();
    const failing = { ...deps(), supabase: fakeDb(tables, new Set(["vet_visits"])) };
    expect((await processExport(row(), failing)).status).toBe("failed");
    expect(tables.data_exports[0].status).toBe("failed");
  });

  it("an archive over 90 MB fails without uploading (owner decision)", async () => {
    const big = new Uint8Array(MAX_ARCHIVE_BYTES / 2 + 1);
    storage = fakeStorage({ [PET_PHOTO]: big, [ATTACHMENT]: big, [MOMENT_PHOTO]: bytes("x"), [LISTING_PHOTO]: bytes("y") });
    expect((await processExport(row(), deps())).status).toBe("failed");
    expect(storage.puts).toHaveLength(0);
    expect(tables.data_exports[0].status).toBe("failed");
  });

  it("a failed email keeps the archive ready", async () => {
    send.mockImplementationOnce(async () => ({ status: "failed" as const, id: "", error: "resend_500" }) as never);
    expect((await processExport(row(), deps())).status).toBe("ready");
    expect(tables.data_exports[0].status).toBe("ready");
  });
});
