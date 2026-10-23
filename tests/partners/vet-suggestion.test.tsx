import { render, screen, waitFor, within } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 "Predlog veterinara u blizini" (Step 27, FR-56, BR-43, Design §12 S03, CR-22). A personal pet with an empty
// vet_name: the aside shows the first 2 vets from EP-64 — rpc:partners_nearby with p_type = vet, p_limit = 2 and
// p_city_id = the EP-43 profile city (lib/actions/partners.ts suggestNearbyVets, run here against a fake server
// client) — names linking to S25, distance · address, a call button and "Svi partneri →" to /partneri. EP-64 [] → no
// block; a pet with a vet shows the "Moj veterinar" card and makes no EP-64 call; no profile city or a failure → no
// block (owner decision, Step 27); organisation animals get none.

type Row = Record<string, unknown>

const IVANA = "a1000000-0000-4000-8000-000000000001"
const LUNA = "c1000000-0000-4000-8000-000000000001"
const NOVI_SAD = { id: "c0000000-0000-4000-8000-000000000026", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.255134, longitude: 19.845176 }

const state = {
  rpcCalls: [] as { name: string; args: Row }[],
  city: NOVI_SAD as typeof NOVI_SAD | null,
  vets: [] as Row[],
  nearbyError: null as null | { code: string; message: string },
}

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/components/ui/sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock("@/lib/integrations/r2", () => ({ r2: () => ({ presignGet: vi.fn() }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }))

const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")
const { dictionaries } = await import("@/lib/i18n")

function client() {
  const query = (table: string) => {
    const run = async () => ({ data: table === "profiles" ? [{ id: IVANA, deletion_requested_at: null }] : [], error: null })
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: (await run()).data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    }
    return api
  }
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: query,
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args })
      if (name === "get_me") return { data: { id: IVANA, city: state.city }, error: null }
      if (name === "partners_nearby") return state.nearbyError ? { data: null, error: state.nearbyError } : { data: state.vets, error: null }
      throw new Error(`unexpected rpc ${name}`)
    },
  }
}

function vet(n: number, name: string, distance: number | null) {
  return {
    id: `e1000000-0000-4000-8000-00000000000${n}`,
    type: "vet",
    name,
    initials: "V",
    address: n === 1 ? "Bulevar oslobođenja 45, Novi Sad" : "Futoška 12, Novi Sad",
    city: NOVI_SAD,
    phone: n === 1 ? "+381 21 455 100" : "+381 21 520 330",
    message_channel: "none",
    message_number: null,
    email: null,
    website: null,
    instagram: null,
    description: null,
    logo_url: null,
    latitude: 45.25,
    longitude: 19.84,
    featured: n === 1,
    paid_until: "2027-12-31",
    active: true,
    distance_km: distance,
    hours: [],
    today_hours: null,
  }
}

const copy = (locale: "sr" | "en" = "sr") => ({
  petRecord: dictionaries[locale].petRecord,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

function record({ vetName = null as string | null, role = "owner", organisationId = null as string | null } = {}) {
  return {
    pet: {
      id: LUNA,
      owner_id: organisationId ? null : IVANA,
      organisation_id: organisationId,
      name: "Luna",
      species: "cat",
      species_other: null,
      breed: null,
      sex: "female",
      birth_date: "2023-04-12",
      birth_year: null,
      colour_markings: null,
      microchip_number: null,
      passport_number: null,
      neutered: "yes",
      has_photo: false,
      photo_file_name: null,
      vet_name: vetName,
      vet_phone: vetName ? "021 456 789" : null,
      weight_unit: "kg",
      note: null,
      lifecycle: "active",
      shelter_status: null,
      offspring_status: null,
      breeding_status: null,
      litter_id: null,
      price: null,
      public_description: null,
      approx_age_text: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    access: { role, can_edit: true, can_delete: role === "owner" },
    can_log: true,
    read_only_reason: null,
    owner_name: "Ivana Petrović",
    memorial: null,
    upcoming_reminders: [],
    vaccinations: [],
    treatments: [],
    vet_visits: [],
    weights: [],
    attachment_count: 0,
  } as never
}

function renderRecord(rec: never, locale: "sr" | "en" = "sr") {
  return render(<PetRecordClient record={rec} now="2026-10-19T10:00:00Z" locale={locale} copy={copy(locale)} />)
}

const nearbyCalls = () => state.rpcCalls.filter((c) => c.name === "partners_nearby")

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  state.rpcCalls = []
  state.city = NOVI_SAD
  state.vets = [vet(1, "Veterinarska ambulanta „Dr Vet“", 1.2), vet(5, "Veterinarska stanica „Zdrava šapa“", 2.4)]
  state.nearbyError = null
})

describe("S03 vet suggestion (FR-56)", () => {
  it("a pet with an empty vet_name: the first 2 vets from EP-64 (p_type vet, p_limit 2, the profile city)", async () => {
    renderRecord(record())

    const block = (await screen.findByRole("heading", { name: "Predlog veterinara u blizini" })).closest(
      "[data-testid='vet-suggestion']",
    ) as HTMLElement
    expect(nearbyCalls()).toEqual([
      { name: "partners_nearby", args: { p_type: "vet", p_limit: 2, p_city_id: NOVI_SAD.id } },
    ])
    expect(within(block).getByText("Luna nema upisanog veterinara.")).toBeInTheDocument()

    expect(within(block).getByRole("link", { name: "Veterinarska ambulanta „Dr Vet“" })).toHaveAttribute(
      "href",
      "/partneri/e1000000-0000-4000-8000-000000000001",
    )
    expect(within(block).getByRole("link", { name: "Veterinarska stanica „Zdrava šapa“" })).toHaveAttribute(
      "href",
      "/partneri/e1000000-0000-4000-8000-000000000005",
    )
    expect(within(block).getByText("1,2 km · Bulevar oslobođenja 45, Novi Sad")).toBeInTheDocument()
    expect(within(block).getByRole("link", { name: "Pozovi: Veterinarska ambulanta „Dr Vet“" })).toHaveAttribute(
      "href",
      "tel:+38121455100",
    )
    expect(within(block).getByRole("link", { name: "Svi partneri →" })).toHaveAttribute("href", "/partneri")
    expect(screen.queryByRole("heading", { name: "Moj veterinar" })).not.toBeInTheDocument()
  })

  it("EP-64 [] → no block", async () => {
    state.vets = []
    renderRecord(record())
    await waitFor(() => expect(nearbyCalls()).toHaveLength(1))
    expect(screen.queryByRole("heading", { name: "Predlog veterinara u blizini" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Moj veterinar" })).not.toBeInTheDocument()
  })

  it("a pet with a vet shows the Moj veterinar card and makes no EP-64 call", async () => {
    renderRecord(record({ vetName: "Veterinarska ambulanta „Dr Vet”" }))
    expect(screen.getByRole("heading", { name: "Moj veterinar" })).toBeInTheDocument()
    expect(screen.getByText("Veterinarska ambulanta „Dr Vet”")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 0))
    expect(state.rpcCalls).toEqual([])
    expect(screen.queryByRole("heading", { name: "Predlog veterinara u blizini" })).not.toBeInTheDocument()
  })

  it("no profile city, or a failing EP-64 → no block", async () => {
    state.city = null
    const { unmount } = renderRecord(record())
    await waitFor(() => expect(state.rpcCalls.map((c) => c.name)).toEqual(["get_me"]))
    expect(screen.queryByRole("heading", { name: "Predlog veterinara u blizini" })).not.toBeInTheDocument()
    unmount()

    state.city = NOVI_SAD
    state.rpcCalls = []
    state.nearbyError = { code: "P0001", message: "validation_failed" }
    renderRecord(record({ role: "member" }))
    await waitFor(() => expect(nearbyCalls()).toHaveLength(1))
    expect(screen.queryByRole("heading", { name: "Predlog veterinara u blizini" })).not.toBeInTheDocument()
  })

  it("organisation animals get no suggestion", async () => {
    renderRecord(record({ role: "admin", organisationId: "b2000000-0000-4000-8000-000000000001" }))
    await new Promise((r) => setTimeout(r, 0))
    expect(state.rpcCalls).toEqual([])
    expect(screen.queryByRole("heading", { name: "Predlog veterinara u blizini" })).not.toBeInTheDocument()
  })

  it("English", async () => {
    renderRecord(record(), "en")
    expect(await screen.findByRole("heading", { name: "Suggested vets nearby" })).toBeInTheDocument()
    expect(screen.getByText("Luna has no vet on record.")).toBeInTheDocument()
    expect(screen.getByText("1.2 km · Bulevar oslobođenja 45, Novi Sad")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "All partners →" })).toHaveAttribute("href", "/partneri")
  })
})
