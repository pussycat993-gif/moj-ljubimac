// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-65 getPartner (lib/actions/partners.ts) over a fake server client: one rpc:get_partner call (distance from
// lat/lng or city_id), then the logo key is signed through the R2 presign (10 min) and dropped from the reply.
// FR-52 #1: a partner whose paid_until has passed is not_found (404) — the database raises it (proven in
// supabase/tests/partner_directory.test.sql). Also EP-64 listPartnersNearby validation and EP-66
// recordPartnerClick (the click RPC and its 422 / 404 mapping).

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const DR_VET = "e1000000-0000-4000-8000-000000000001";
const NOVI_SAD = "c0000000-0000-4000-8000-000000000026";

const state = {
  signedIn: true,
  rpcCalls: [] as { name: string; args: Row }[],
  rpcResult: {} as Record<string, { data: unknown; error: null | { code: string; message: string; details?: string } }>,
  presigned: [] as string[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/integrations/r2", () => ({
  r2: () => ({
    presignGet: async (key: string) => {
      state.presigned.push(key);
      return { url: `https://r2.test/${key}?X-Amz-Expires=600`, expires_at: "2026-10-23T10:10:00Z" };
    },
  }),
}));

const { getPartner, listPartnersNearby, recordPartnerClick } = await import("@/lib/actions/partners");
const { httpStatus } = await import("@/lib/server/result");

function query(table: string) {
  const run = async () => {
    if (table === "profiles") return { data: [{ id: IVANA, deletion_requested_at: null }], error: null };
    return { data: [], error: null };
  };
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => {
      const r = await run();
      return { data: (r.data as Row[])[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () =>
        state.signedIn
          ? { data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult[name] ?? { data: null, error: null };
    },
  };
}

function partnerRow(overrides: Row = {}) {
  return {
    id: DR_VET,
    type: "vet",
    name: "Veterinarska ambulanta „Dr Vet“",
    initials: "DV",
    address: "Bulevar oslobođenja 45, Novi Sad",
    city: { id: NOVI_SAD, name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.255134, longitude: 19.845176 },
    phone: "+381 21 455 100",
    message_channel: "whatsapp",
    message_number: "+381 64 455 1000",
    email: "kontakt@drvet.rs",
    website: "https://drvet.rs",
    instagram: "drvet.ns",
    description: "Pregledi, vakcinacija i mala hirurgija za pse i mačke.",
    logo_url: null,
    logo_r2_key: `p/${DR_VET}/logo.png`,
    latitude: 45.2541,
    longitude: 19.8425,
    featured: true,
    paid_until: "2027-12-31",
    active: true,
    distance_km: 1.2,
    hours: [{ weekday: 1, opens: "08:00", closes: "20:00" }],
    today_hours: { weekday: 1, opens: "08:00", closes: "20:00" },
    ...overrides,
  };
}

beforeEach(() => {
  state.signedIn = true;
  state.rpcCalls = [];
  state.rpcResult = {};
  state.presigned = [];
});

describe("EP-65 getPartner (FR-54, FR-55)", () => {
  it("FR-52: a partner whose paid_until has passed → 404 not_found", async () => {
    state.rpcResult.get_partner = { data: null, error: { code: "P0001", message: "not_found" } };
    const result = await getPartner({ partner_id: "e1000000-0000-4000-8000-000000000004" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
    expect(httpStatus(result.error.code)).toBe(404);
    expect(state.presigned).toEqual([]);
  });

  it("calls rpc:get_partner with the coordinates and signs the logo for 10 minutes", async () => {
    state.rpcResult.get_partner = { data: partnerRow(), error: null };
    const result = await getPartner({ partner_id: DR_VET, lat: 45.25, lng: 19.84 });

    expect(state.rpcCalls).toEqual([{ name: "get_partner", args: { p_partner_id: DR_VET, p_lat: 45.25, p_lng: 19.84 } }]);
    expect(state.presigned).toEqual([`p/${DR_VET}/logo.png`]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.logo_url).toBe(`https://r2.test/p/${DR_VET}/logo.png?X-Amz-Expires=600`);
    expect(result.data).not.toHaveProperty("logo_r2_key");
    expect(result.data).toMatchObject({ id: DR_VET, distance_km: 1.2, today_hours: { weekday: 1 }, hours: [{ weekday: 1 }] });
  });

  it("falls back to city_id for the distance; no logo → logo_url null and nothing signed", async () => {
    state.rpcResult.get_partner = { data: partnerRow({ logo_r2_key: null }), error: null };
    const result = await getPartner({ partner_id: DR_VET, city_id: NOVI_SAD });

    expect(state.rpcCalls[0]).toEqual({ name: "get_partner", args: { p_partner_id: DR_VET, p_city_id: NOVI_SAD } });
    expect(state.presigned).toEqual([]);
    expect(result.ok && result.data.logo_url).toBeNull();
  });

  it("422 validation_failed: one coordinate only, or a partner_id that is not a uuid", async () => {
    const one = await getPartner({ partner_id: DR_VET, lat: 45.25 });
    expect(one.ok ? null : one.error).toMatchObject({ code: "validation_failed", fields: { lng: "required" } });
    const bad = await getPartner({ partner_id: "dr-vet" });
    expect(bad.ok ? null : bad.error).toMatchObject({ code: "validation_failed", fields: { partner_id: "invalid" } });
    expect(state.rpcCalls).toEqual([]);
  });

  it("a Visitor → 401 unauthenticated", async () => {
    state.signedIn = false;
    const result = await getPartner({ partner_id: DR_VET });
    expect(result.ok ? null : result.error.code).toBe("unauthenticated");
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("EP-64 listPartnersNearby", () => {
  it("passes coordinates (browser location) or the city to rpc:partners_nearby", async () => {
    state.rpcResult.partners_nearby = { data: [partnerRow()], error: null };
    await listPartnersNearby({ lat: 45.25, lng: 19.84, type: "vet" });
    await listPartnersNearby({ city_id: NOVI_SAD });
    expect(state.rpcCalls).toEqual([
      { name: "partners_nearby", args: { p_lat: 45.25, p_lng: 19.84, p_type: "vet" } },
      { name: "partners_nearby", args: { p_city_id: NOVI_SAD } },
    ]);
  });

  it("neither coordinates nor city → 422 with fields.city_id = required", async () => {
    const result = await listPartnersNearby({});
    expect(result.ok ? null : result.error).toMatchObject({ code: "validation_failed", fields: { city_id: "required" } });
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("EP-66 recordPartnerClick (FR-55, FR-58)", () => {
  it("calls rpc:record_partner_click with the partner and the action", async () => {
    const result = await recordPartnerClick(DR_VET, "message");
    expect(state.rpcCalls).toEqual([{ name: "record_partner_click", args: { p_partner_id: DR_VET, p_action: "message" } }]);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("an action without data → 422 validation_failed; a hidden partner → 404 not_found", async () => {
    state.rpcResult.record_partner_click = {
      data: null,
      error: { code: "P0001", message: "validation_failed", details: "p_action:invalid" },
    };
    const noData = await recordPartnerClick(DR_VET, "website");
    expect(noData.ok ? null : noData.error).toMatchObject({ code: "validation_failed", fields: { action: "invalid" } });

    state.rpcResult.record_partner_click = { data: null, error: { code: "P0001", message: "not_found" } };
    const hidden = await recordPartnerClick(DR_VET, "call");
    expect(hidden.ok ? null : hidden.error.code).toBe("not_found");
  });
});
