// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-50 #1, FR-50 #2 and FR-51 — EP-60 getTransfer / acceptTransfer / declineTransfer (lib/actions/transfers.ts)
// over a fake server client (rpc:get_transfer_by_token, get_transfer_copy_plan, accept_record_transfer,
// decline_record_transfer, get_me) and a fake R2: accept copies the photo and every attachment server-side to new
// keys under u/<recipient>/pets/<new_pet_id>/… and then creates the recipient's pet (weight, vaccinations,
// treatments + dose logs, vet visits + attachments, photo) in one database call; a failed database step or R2 copy
// deletes the copied objects; a Free recipient whose slot is taken → 403 premium_required with details.limit =
// transfer_slot and the slot pet's id and name (Me.usage.free_slot_pet); expiry → 410; decline; a Visitor sees the
// transfer but cannot accept (401). The copy itself and the organisation's read-only original are proven in
// supabase/tests/record_transfers.test.sql.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const TOKEN = "tr_c29tZXRoaW5n.c2lnbmF0dXJl";
const ORG = "o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004";
const PHOTO = `${ORG}/photo/11111111-1111-4111-8111-111111111111-zuca.jpg`;
const VISIT = "f9260000-0000-4000-8000-000000000002";
const ATTACHMENT = `${ORG}/visits/${VISIT}/22222222-2222-4222-8222-222222222222-nalaz.pdf`;

type Pet = {
  id: string;
  owner_id: string;
  photo_r2_key: string | null;
  weight_entries: number;
  vaccinations: number;
  treatments: number;
  dose_logs: number;
  vet_visits: string[];
  attachments: { vet_visit_id: string; r2_key: string; file_name: string }[];
};

const state = {
  user: IVANA as string | null,
  status: "pending" as "pending" | "accepted" | "declined" | "expired",
  expired: false,
  failAccept: null as string | null,
  failCopyAt: -1,
  objects: new Set<string>(),
  pets: [] as Pet[],
  rpcCalls: [] as { name: string; args: Row }[],
};

const storage = {
  copy: vi.fn(async (source: string, target: string) => {
    if (storage.copy.mock.calls.length - 1 === state.failCopyAt) throw new Error("R2 copy failed with 500");
    if (!state.objects.has(source)) throw new Error("R2 copy failed with 404");
    state.objects.add(target);
  }),
  remove: vi.fn(async (key: string) => {
    state.objects.delete(key);
    return true;
  }),
  presignGet: vi.fn(async (key: string) => ({ url: `https://r2.test/${key}?sig`, expires_at: "2026-10-23T10:10:00Z" })),
};
vi.mock("@/lib/integrations/r2", () => ({
  r2: () => storage,
  safeFileName: (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 100),
}));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { getTransfer, acceptTransfer, declineTransfer } = await import("@/lib/actions/transfers");
const { hashToken } = await import("@/lib/server/action-tokens");

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

function view(extra: Row = {}) {
  return {
    transfer_id: "f9260000-0000-4000-8000-0000000000b2",
    status: state.status,
    expires_at: "2026-11-22T10:00:00Z",
    organisation: { name: "Azil Šapica", city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 } },
    animal: {
      name: "Žuća",
      sex: "female",
      species: "dog",
      species_other: null,
      breed: "Mešanac",
      approx_age_text: "oko 6 meseci",
      birth_date: null,
      microchip_number: "688038100245117",
      photo_url: null,
      photo_r2_key: PHOTO,
    },
    counts: { vaccinations: 1, vet_visits: 1, attachments: 1 },
    new_pet_id: null,
    ...extra,
  };
}

/** The checks get_transfer_copy_plan / accept_record_transfer share. */
function checks() {
  if (state.status === "accepted" || state.status === "declined") return dbError("invitation_used");
  if (state.expired) return dbError("invitation_expired");
  if (state.user === MARKO) return dbError("premium_required:transfer_slot");
  return null;
}

async function rpc(name: string, args: Row) {
  state.rpcCalls.push({ name, args });
  if (args.p_token_hash !== undefined && args.p_token_hash !== (await hashToken(TOKEN))) return dbError("not_found");
  switch (name) {
    case "get_transfer_by_token":
      if (state.expired) return dbError("invitation_expired");
      return { data: view(), error: null };
    case "get_transfer_copy_plan":
      return (
        checks() ?? {
          data: {
            transfer_id: "f9260000-0000-4000-8000-0000000000b2",
            owner_id: state.user,
            photo_r2_key: PHOTO,
            vet_visits: [{ id: VISIT }],
            attachments: [{ id: "a1", vet_visit_id: VISIT, r2_key: ATTACHMENT, file_name: "Nalaz krvi.pdf" }],
          },
          error: null,
        }
      );
    case "accept_record_transfer": {
      const failed = checks();
      if (failed) return failed;
      if (state.failAccept) return dbError(state.failAccept);
      const visitMap = args.p_visit_id_map as Record<string, string>;
      const keyMap = args.p_key_map as Record<string, string>;
      const newPet = String(args.p_new_pet_id);
      state.pets.push({
        id: newPet,
        owner_id: String(state.user),
        photo_r2_key: keyMap[PHOTO] ?? null,
        weight_entries: 1,
        vaccinations: 1,
        treatments: 1,
        dose_logs: 1,
        vet_visits: [visitMap[VISIT]],
        attachments: [{ vet_visit_id: visitMap[VISIT], r2_key: keyMap[ATTACHMENT], file_name: "Nalaz krvi.pdf" }],
      });
      state.status = "accepted";
      return { data: view({ status: "accepted", new_pet_id: newPet, animal: { ...view().animal, photo_r2_key: PHOTO } }), error: null };
    }
    case "decline_record_transfer": {
      const failed = state.status !== "pending" ? dbError("invitation_used") : state.expired ? dbError("invitation_expired") : null;
      if (failed) return failed;
      state.status = "declined";
      return { data: view({ status: "declined" }), error: null };
    }
    case "get_me":
      return {
        data: { usage: { free_slot_pet: state.user === MARKO ? { id: "c1000000-0000-4000-8000-000000000003", name: "Kiki" } : null } },
        error: null,
      };
  }
  throw new Error(`unexpected rpc ${name}`);
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "u@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: { id: state.user, deletion_requested_at: null }, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "organisation_memberships" ? [] : [], error: null }).then(resolve),
      };
      return api;
    },
    rpc: (name: string, args: Row = {}) => rpc(name, args),
  };
}

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  state.user = IVANA;
  state.status = "pending";
  state.expired = false;
  state.failAccept = null;
  state.failCopyAt = -1;
  state.objects = new Set([PHOTO, ATTACHMENT]);
  state.pets = [];
  state.rpcCalls = [];
  storage.copy.mockClear();
  storage.remove.mockClear();
  storage.presignGet.mockClear();
});

describe("FR-50 #1 — accepting a transfer gives the recipient the full record", () => {
  it("copies the photo and attachments in R2 under the recipient's u/ prefix and creates the new pet", async () => {
    const result = await acceptTransfer({ token: TOKEN });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("accepted");
    const pet = state.pets[0];
    expect(result.data.new_pet_id).toBe(pet.id);
    expect(pet.owner_id).toBe(IVANA);
    expect(pet).toMatchObject({ weight_entries: 1, vaccinations: 1, treatments: 1, dose_logs: 1 });

    const prefix = `u/${IVANA}/pets/${pet.id}/`;
    expect(pet.photo_r2_key).toMatch(new RegExp(`^${prefix}photo/[0-9a-f-]{36}-zuca\\.jpg$`));
    expect(pet.vet_visits[0]).not.toBe(VISIT);
    expect(pet.attachments[0].r2_key).toMatch(
      new RegExp(`^${prefix}visits/${pet.vet_visits[0]}/[0-9a-f-]{36}-nalaz-krvi\\.pdf$`),
    );
    // R2 copy via the fake: the new objects exist, the organisation's originals stay.
    expect(storage.copy).toHaveBeenCalledTimes(2);
    expect(state.objects.has(pet.photo_r2_key!)).toBe(true);
    expect(state.objects.has(pet.attachments[0].r2_key)).toBe(true);
    expect(state.objects.has(PHOTO) && state.objects.has(ATTACHMENT)).toBe(true);
    // The copies happen before the single database call that writes the record.
    const order = state.rpcCalls.map((c) => c.name);
    expect(order).toEqual(["get_transfer_copy_plan", "accept_record_transfer"]);
  });

  it("returns the TransferView with a presigned photo URL instead of the key", async () => {
    const result = await acceptTransfer({ token: TOKEN });
    if (!result.ok) throw new Error("accept failed");
    expect(result.data.animal.photo_url).toMatchObject({ kind: "pet_photo", url: expect.stringContaining("https://r2.test/") });
    expect(result.data.animal).not.toHaveProperty("photo_r2_key");
  });

  it("a failed database step deletes the copied objects", async () => {
    state.failAccept = "invitation_used";
    const result = await acceptTransfer({ token: TOKEN });
    expect(result).toMatchObject({ ok: false, error: { code: "invitation_used" } });
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect([...state.objects].sort()).toEqual([ATTACHMENT, PHOTO].sort());
  });

  it("a failed R2 copy deletes what was copied and never calls accept", async () => {
    state.failCopyAt = 1;
    const result = await acceptTransfer({ token: TOKEN });
    expect(result).toMatchObject({ ok: false, error: { code: "internal_error" } });
    expect(state.rpcCalls.map((c) => c.name)).not.toContain("accept_record_transfer");
    expect([...state.objects].sort()).toEqual([ATTACHMENT, PHOTO].sort());
  });

  it("a second accept → 409 invitation_used", async () => {
    await acceptTransfer({ token: TOKEN });
    const again = await acceptTransfer({ token: TOKEN });
    expect(again).toMatchObject({ ok: false, error: { code: "invitation_used" } });
  });
});

describe("FR-51 — a Free recipient whose slot is taken", () => {
  it("→ 403 premium_required with limit transfer_slot and the slot pet; nothing is copied", async () => {
    state.user = MARKO;
    const result = await acceptTransfer({ token: TOKEN });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "premium_required",
        details: { limit: "transfer_slot", slot_pet_id: "c1000000-0000-4000-8000-000000000003", slot_pet_name: "Kiki" },
      },
    });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(state.pets).toHaveLength(0);
  });
});

describe("FR-50 #2 — expiry", () => {
  it("accept after expiry → 410 invitation_expired", async () => {
    state.expired = true;
    const result = await acceptTransfer({ token: TOKEN });
    expect(result).toMatchObject({ ok: false, error: { code: "invitation_expired" } });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("getTransfer after expiry → 410 invitation_expired", async () => {
    state.expired = true;
    expect(await getTransfer({ token: TOKEN })).toMatchObject({ ok: false, error: { code: "invitation_expired" } });
  });
});

describe("EP-60 get and decline", () => {
  it("a Visitor holding the token sees the transfer, but accepting → 401 unauthenticated", async () => {
    state.user = null;
    const result = await getTransfer({ token: TOKEN });
    expect(result).toMatchObject({ ok: true, data: { status: "pending", organisation: { name: "Azil Šapica" }, animal: { name: "Žuća" } } });
    expect(await acceptTransfer({ token: TOKEN })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(state.rpcCalls.map((c) => c.name)).toEqual(["get_transfer_by_token"]);
  });

  it("an unknown or malformed token → 404 not_found", async () => {
    expect(await getTransfer({ token: "tr_nope.nope" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await getTransfer({ token: "hh_abc.def" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("decline → status declined", async () => {
    const result = await declineTransfer({ token: TOKEN });
    expect(result).toMatchObject({ ok: true, data: { status: "declined" } });
    expect(storage.copy).not.toHaveBeenCalled();
  });
});
