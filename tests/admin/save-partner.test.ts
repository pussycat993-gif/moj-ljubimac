// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-57 #2 — EP-69 savePartner / createPartnerLogoUpload / geocodeAddress (lib/actions/admin.ts) over fake
// clients: the Operator's session (profiles.is_operator, cities, rpc:partners_nearby and
// rpc:admin_list_partners as the database answers them) and the service-role rpc:save_partner (upsert,
// partner_hours replaced, BR-41 featured trigger, old logo queued). Create and update with every FR-54 field,
// hours, featured and paid_until show up in partners_nearby; a 4th featured partner per type and city → 409
// featured_limit_reached; a partner whose paid_until was yesterday is absent from partners_nearby but listed
// by admin_list_partners. Geocoding (Nominatim) runs when both coordinates are null; R2 is faked.
// The database side is proven in supabase/tests/admin_partners.test.sql.

type Row = Record<string, unknown>;
type StoredPartner = Row & { id: string; city_id: string; type: string; featured: boolean; paid_until: string; logo_r2_key: string | null };

const ANA = "a1000000-0000-4000-8000-000000000006";
const IVANA = "a1000000-0000-4000-8000-000000000001";
const NOVI_SAD = "c0000000-0000-4000-8000-000000000001";
const KG = "c0000000-0000-4000-8000-000000000002";
const CITIES: Record<string, { name_sr: string; name_en: string; latitude: number; longitude: number }> = {
  [NOVI_SAD]: { name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.2671, longitude: 19.8335 },
  [KG]: { name_sr: "Kragujevac", name_en: "Kragujevac", latitude: 44.0128, longitude: 20.9114 },
};

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000 * 2).toISOString().slice(0, 10);

const state = {
  user: ANA,
  operators: new Set([ANA]),
  partners: [] as StoredPartner[],
  hours: {} as Record<string, { weekday: number; opens: string; closes: string }[]>,
  queue: [] as string[],
  saveCalls: [] as Row[],
};

const geocode = vi.fn(async (input: { address: string; city: string }) => ({
  ok: true as const,
  data: { latitude: 44.0141, longitude: 20.9161, display_name: `${input.address}, ${input.city}` },
}));
vi.mock("@/lib/integrations/nominatim", () => ({ geocode: (input: { address: string; city: string }) => geocode(input) }));

const r2 = {
  presignPut: vi.fn(async (key: string) => ({ url: `https://r2.test/${key}?put`, expires_at: "2026-10-28T10:10:00Z" })),
  presignGet: vi.fn(async (key: string) => ({ url: `https://r2.test/${key}?get`, expires_at: "2026-10-28T10:10:00Z" })),
  head: vi.fn(async (key: string) => (key ? { size: 1000, content_type: "image/png" } : null) as { size: number; content_type: string } | null),
};
vi.mock("@/lib/integrations/r2", () => ({ r2: () => r2, safeFileName: (s: string) => s.toLowerCase() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => serviceClient() }));

const { savePartner, createPartnerLogoUpload, geocodeAddress } = await import("@/lib/actions/admin");
const { listPartnersNearby } = await import("@/lib/actions/partners");

function partnerJson(p: StoredPartner) {
  const city = CITIES[p.city_id];
  return {
    ...p,
    initials: "VS",
    city: { id: p.city_id, ...city },
    logo_url: null,
    active: p.paid_until >= today(),
    distance_km: null,
    hours: [...(state.hours[p.id] ?? [])].sort((a, b) => a.weekday - b.weekday),
    today_hours: null,
  };
}

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

function sessionClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const filters: Row = {};
      const api = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return api;
        },
        maybeSingle: async () => {
          if (table === "profiles") return { data: { id: state.user, deletion_requested_at: null, is_operator: state.operators.has(state.user) }, error: null };
          if (table === "cities") {
            const city = CITIES[String(filters.id)];
            return { data: city ? { name_sr: city.name_sr } : null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return api;
    },
    rpc: async (name: string, args: Row) => {
      if (name === "partners_nearby") {
        const rows = state.partners
          .filter((p) => p.city_id === args.p_city_id && p.paid_until >= today())
          .sort((a, b) => Number(b.featured) - Number(a.featured))
          .map((p) => ({ ...partnerJson(p), logo_r2_key: undefined }));
        return { data: rows, error: null };
      }
      if (name === "admin_list_partners") {
        if (!state.operators.has(state.user)) return dbError("forbidden_role");
        const items = state.partners.map((p) => ({
          ...partnerJson(p),
          featured_count: state.partners.filter((f) => f.city_id === p.city_id && f.type === p.type && f.featured).length,
        }));
        return { data: { items, total: items.length }, error: null };
      }
      throw new Error(`unexpected session rpc ${name}`);
    },
  };
}

/** rpc:save_partner and the partners read as supabase/migrations/*_operator_admin.sql do them. */
function serviceClient() {
  return {
    from: (table: string) => {
      if (table !== "partners") throw new Error(`unexpected table ${table}`);
      const filters: Row = {};
      const api = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return api;
        },
        maybeSingle: async () => ({ data: state.partners.find((p) => p.id === filters.id) ?? null, error: null }),
      };
      return api;
    },
    rpc: async (name: string, args: Row) => {
      if (name !== "save_partner") throw new Error(`unexpected rpc ${name}`);
      state.saveCalls.push(args);
      const fields = args.p_fields as Row;
      let partner: StoredPartner;
      if (args.p_id) {
        const existing = state.partners.find((p) => p.id === args.p_id);
        if (!existing) return dbError("not_found");
        partner = { ...existing, ...fields } as StoredPartner;
      } else {
        partner = {
          id: `f2800000-0000-4000-8000-${String(state.partners.length + 1).padStart(12, "0")}`,
          message_channel: "none",
          featured: false,
          logo_r2_key: null,
          ...fields,
        } as unknown as StoredPartner;
      }
      if (
        partner.featured &&
        state.partners.filter((p) => p.id !== partner.id && p.city_id === partner.city_id && p.type === partner.type && p.featured).length >= 3
      ) {
        return dbError("featured_limit_reached");
      }
      const old = state.partners.find((p) => p.id === partner.id);
      if (old?.logo_r2_key && "logo_r2_key" in fields && old.logo_r2_key !== fields.logo_r2_key) state.queue.push(old.logo_r2_key);
      state.partners = [...state.partners.filter((p) => p.id !== partner.id), partner];
      if (args.p_hours !== undefined) state.hours[partner.id] = args.p_hours as never;
      return { data: partnerJson(partner), error: null };
    },
  };
}

const fullInput = {
  type: "vet" as const,
  name: "Veterinarska ambulanta „Šumarice“",
  address: "Kralja Petra I 10",
  city_id: KG,
  phone: "+381 34 300 100",
  email: "kontakt@sumarice.rs",
  website: "sumarice.rs",
  instagram: "@sumarice.vet",
  description: "Pregledi i vakcinacija.",
  message_channel: "viber" as const,
  message_number: "+381 64 300 1000",
  latitude: 44.0128,
  longitude: 20.9114,
  featured: true,
  paid_until: "2027-12-31",
  hours: [
    { weekday: 2, opens: "08:00", closes: "20:00" },
    { weekday: 1, opens: "08:00", closes: "20:00" },
    { weekday: 7, opens: "00:00", closes: "24:00" },
  ],
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-secret");
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) vi.stubEnv(key, "");
  state.user = ANA;
  state.partners = [];
  state.hours = {};
  state.queue = [];
  state.saveCalls = [];
  geocode.mockClear();
  r2.head.mockClear();
});

describe("savePartner (EP-69)", () => {
  it("FR-57 #2: create with every FR-54 field, hours, featured and paid_until — shown by partners_nearby", async () => {
    const created = await savePartner(fullInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({
      name: fullInput.name,
      type: "vet",
      phone: fullInput.phone,
      email: fullInput.email,
      website: "sumarice.rs",
      instagram: "sumarice.vet",
      message_channel: "viber",
      message_number: fullInput.message_number,
      featured: true,
      paid_until: "2027-12-31",
      hours: [
        { weekday: 1, opens: "08:00", closes: "20:00" },
        { weekday: 2, opens: "08:00", closes: "20:00" },
        { weekday: 7, opens: "00:00", closes: "24:00" },
      ],
    });
    expect(geocode).not.toHaveBeenCalled();

    state.user = IVANA;
    const nearby = await listPartnersNearby({ city_id: KG });
    expect(nearby.ok && nearby.data.map((p) => p.name)).toEqual([fullInput.name]);
  });

  it("FR-57 #2: update changes only the fields sent and replaces the hours", async () => {
    const created = await savePartner(fullInput);
    if (!created.ok) throw new Error("create failed");
    const updated = await savePartner({
      id: created.data.id,
      name: "Veterinarska klinika „Šumarice“",
      paid_until: "2028-06-30",
      hours: [{ weekday: 3, opens: "09:00", closes: "17:00" }],
    });
    expect(updated).toMatchObject({
      ok: true,
      data: {
        name: "Veterinarska klinika „Šumarice“",
        phone: fullInput.phone,
        paid_until: "2028-06-30",
        hours: [{ weekday: 3, opens: "09:00", closes: "17:00" }],
      },
    });
    expect(state.saveCalls[1].p_fields).toEqual({ name: "Veterinarska klinika „Šumarice“", paid_until: "2028-06-30" });
    expect(geocode).not.toHaveBeenCalled();
  });

  it("FR-57 #2: a 4th featured partner of the type in the city → 409 featured_limit_reached", async () => {
    for (let i = 1; i <= 3; i++) {
      expect((await savePartner({ ...fullInput, name: `Vet ${i}` })).ok).toBe(true);
    }
    expect(await savePartner({ ...fullInput, name: "Vet 4" })).toMatchObject({ ok: false, error: { code: "featured_limit_reached" } });
    const plain = await savePartner({ ...fullInput, name: "Vet 5", featured: false });
    if (!plain.ok) throw new Error("create failed");
    expect(await savePartner({ id: plain.data.id, featured: true })).toMatchObject({
      ok: false,
      error: { code: "featured_limit_reached" },
    });
    // A pet shop in the same city is counted separately.
    expect((await savePartner({ ...fullInput, type: "pet_shop", name: "Shop 1" })).ok).toBe(true);
  });

  it("FR-57 #2 / E-23: paid_until yesterday → absent from partners_nearby, listed by admin_list_partners", async () => {
    const expired = await savePartner({ ...fullInput, featured: false, name: "Grooming „Istekao“", type: "grooming", paid_until: yesterday() });
    if (!expired.ok) throw new Error("create failed");
    expect(expired.data.active).toBe(false);

    const supabase = sessionClient();
    const admin = (await supabase.rpc("admin_list_partners", { p_limit: 20, p_offset: 0 })).data as { items: { id: string; active: boolean }[] };
    expect(admin.items).toEqual([expect.objectContaining({ id: expired.data.id, active: false })]);

    state.user = IVANA;
    const nearby = await listPartnersNearby({ city_id: KG });
    expect(nearby).toEqual({ ok: true, data: [] });
  });

  it("ADR-11: geocodes the address when both coordinates are null; geocoding_failed → 502 and nothing saved", async () => {
    const created = await savePartner({ ...fullInput, latitude: null, longitude: null });
    expect(geocode).toHaveBeenCalledWith({ address: "Kralja Petra I 10", city: "Kragujevac" });
    expect(created).toMatchObject({ ok: true, data: { latitude: 44.0141, longitude: 20.9161 } });

    geocode.mockResolvedValueOnce({ ok: false, error: "geocoding_failed" } as never);
    const failed = await savePartner({ ...fullInput, name: "Drugi", latitude: null, longitude: null });
    expect(failed).toMatchObject({ ok: false, error: { code: "geocoding_failed" } });
    expect(state.partners).toHaveLength(1);

    // Coordinates entered manually are saved without geocoding.
    geocode.mockClear();
    expect((await savePartner({ ...fullInput, name: "Treći", featured: false })).ok).toBe(true);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("validation: required on create, message number with a channel, one coordinate, hours, URL, email", async () => {
    expect(await savePartner({ name: "X" })).toMatchObject({
      ok: false,
      error: {
        code: "validation_failed",
        fields: { type: "required", address: "required", city_id: "required", phone: "required", paid_until: "required" },
      },
    });
    expect(await savePartner({ ...fullInput, message_number: null })).toMatchObject({
      error: { fields: { message_number: "required" } },
    });
    expect(await savePartner({ ...fullInput, longitude: null })).toMatchObject({ error: { fields: { longitude: "required" } } });
    expect(await savePartner({ ...fullInput, hours: [{ weekday: 1, opens: "18:00", closes: "08:00" }] })).toMatchObject({
      error: { fields: { hours: "invalid" } },
    });
    expect(
      await savePartner({ ...fullInput, hours: [{ weekday: 1, opens: "08:00", closes: "12:00" }, { weekday: 1, opens: "13:00", closes: "18:00" }] }),
    ).toMatchObject({ error: { fields: { hours: "invalid" } } });
    expect(await savePartner({ ...fullInput, website: "nije sajt" })).toMatchObject({ error: { fields: { website: "invalid" } } });
    expect(await savePartner({ ...fullInput, email: "ne-mejl" })).toMatchObject({ error: { fields: { email: "invalid" } } });
    expect(await savePartner({ ...fullInput, description: "a".repeat(1001) })).toMatchObject({
      error: { fields: { description: "too_long" } },
    });
    expect(state.saveCalls).toHaveLength(0);
  });

  it("a non-Operator → 403 forbidden_role and nothing is saved", async () => {
    state.user = IVANA;
    expect(await savePartner(fullInput)).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(await geocodeAddress({ address: "A 1", city_id: KG })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(
      await createPartnerLogoUpload({ partner_id: "f2800000-0000-4000-8000-000000000001", file_name: "a.png", mime_type: "image/png", size_bytes: 10 }),
    ).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.saveCalls).toHaveLength(0);
  });

  it("update of an unknown partner → 404 not_found", async () => {
    expect(await savePartner({ id: "f2800000-0000-4000-8000-0000000000ff", name: "X" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("partner logo (EP-69, owner decision: create → ticket → PUT → save the key)", () => {
  it("issues an UploadTicket for p/<id>/logo-<uuid>.<ext>; images ≤ 10 MB only", async () => {
    const created = await savePartner(fullInput);
    if (!created.ok) throw new Error("create failed");
    const ticket = await createPartnerLogoUpload({ partner_id: created.data.id, file_name: "Logo.PNG", mime_type: "image/png", size_bytes: 2048 });
    expect(ticket.ok).toBe(true);
    if (!ticket.ok) return;
    expect(ticket.data.r2_key).toMatch(new RegExp(`^p/${created.data.id}/logo-[0-9a-f-]{36}\\.png$`));
    expect(ticket.data).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png", "Content-Length": "2048" },
      file_name: "Logo.PNG",
      position: null,
    });
    expect(ticket.data.upload_token).toMatch(/^up_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    expect(
      await createPartnerLogoUpload({ partner_id: created.data.id, file_name: "a.pdf", mime_type: "application/pdf", size_bytes: 10 }),
    ).toMatchObject({ ok: false, error: { code: "file_type_not_allowed" } });
    expect(
      await createPartnerLogoUpload({ partner_id: created.data.id, file_name: "a.png", mime_type: "image/png", size_bytes: 10_485_761 }),
    ).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(
      await createPartnerLogoUpload({ partner_id: "f2800000-0000-4000-8000-0000000000ff", file_name: "a.png", mime_type: "image/png", size_bytes: 10 }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("saves the key, signs logo_url, queues the replaced key; keys of another partner are refused", async () => {
    const created = await savePartner(fullInput);
    if (!created.ok) throw new Error("create failed");
    const id = created.data.id;

    const first = await savePartner({ id, logo_r2_key: `p/${id}/logo-1.png` });
    expect(first).toMatchObject({ ok: true, data: { logo_url: `https://r2.test/p/${id}/logo-1.png?get` } });
    expect(first.ok && "logo_r2_key" in first.data).toBe(false);

    await savePartner({ id, logo_r2_key: `p/${id}/logo-2.png` });
    expect(state.queue).toEqual([`p/${id}/logo-1.png`]);

    expect(await savePartner({ id, logo_r2_key: "p/someone-else/logo-3.png" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { logo_r2_key: "invalid" } },
    });
    expect(await savePartner({ ...fullInput, name: "Novi", featured: false, logo_r2_key: "p/x/logo.png" })).toMatchObject({
      error: { fields: { logo_r2_key: "invalid" } },
    });
  });

  it("checks with R2 HEAD that the object exists when R2 is configured", async () => {
    const created = await savePartner(fullInput);
    if (!created.ok) throw new Error("create failed");
    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) vi.stubEnv(key, "set");
    r2.head.mockResolvedValueOnce(null);
    expect(await savePartner({ id: created.data.id, logo_r2_key: `p/${created.data.id}/logo-9.png` })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { logo_r2_key: "not_uploaded" } },
    });
    expect(r2.head).toHaveBeenCalledWith(`p/${created.data.id}/logo-9.png`);
  });
});

describe("geocodeAddress (EP-69)", () => {
  it("returns the coordinates for the address in the city; nothing found → 502 geocoding_failed", async () => {
    expect(await geocodeAddress({ address: "Kralja Petra I 10", city_id: KG })).toEqual({
      ok: true,
      data: { latitude: 44.0141, longitude: 20.9161, display_name: "Kralja Petra I 10, Kragujevac" },
    });
    geocode.mockResolvedValueOnce({ ok: false, error: "geocoding_failed" } as never);
    expect(await geocodeAddress({ address: "Nepostojeća 1", city_id: KG })).toMatchObject({
      ok: false,
      error: { code: "geocoding_failed" },
    });
    expect(await geocodeAddress({ address: "", city_id: KG })).toMatchObject({
      error: { code: "validation_failed", fields: { address: "required" } },
    });
  });
});
