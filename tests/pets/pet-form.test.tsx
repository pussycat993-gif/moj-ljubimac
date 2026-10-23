import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S02 Dodaj / izmeni ljubimca (FR-01, FR-02, FR-03) and the EP-03 / EP-04 server actions behind it.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => "/ljubimci/novi",
}))

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const createPet = vi.fn()
const updatePet = vi.fn()
vi.mock("@/lib/actions/pets", () => ({
  createPet: (...args: unknown[]) => createPet(...args),
  updatePet: (...args: unknown[]) => updatePet(...args),
}))
const requestUpload = vi.fn()
const confirmUpload = vi.fn()
vi.mock("@/lib/actions/uploads", () => ({
  requestUpload: (...args: unknown[]) => requestUpload(...args),
  confirmUpload: (...args: unknown[]) => confirmUpload(...args),
}))

const supabase = { current: null as unknown }
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { PetFormClient } = await import("@/app/(app)/ljubimci/novi/pet-form-client")
const { dictionaries } = await import("@/lib/i18n")
const actions = await vi.importActual<typeof import("@/lib/actions/pets")>("@/lib/actions/pets")

const copy = (locale: "sr" | "en") => ({
  petForm: dictionaries[locale].petForm,
  pet: dictionaries[locale].pet,
  petsHome: dictionaries[locale].petsHome,
  common: dictionaries[locale].common,
})

const LUNA_ID = "c1000000-0000-4000-8000-000000000001"

const lunaPet = {
  id: LUNA_ID,
  owner_id: "a1000000-0000-4000-8000-000000000001",
  organisation_id: null,
  name: "Luna",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  sex: "female",
  birth_date: "2023-04-12",
  birth_year: null,
  colour_markings: "Plavo-siva, bela mrlja na grudima",
  microchip_number: "688038000123456",
  passport_number: "RS-NS-0451-23",
  neutered: "yes",
  has_photo: true,
  photo_file_name: "0b1c-luna-profil.jpg",
  vet_name: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  vet_phone: "021 456 789",
  weight_unit: "kg",
  note: "Ne voli transporter — staviti ćebe unutra.",
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
} as const

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  // Radix RadioGroup measures its items.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  toast.mockClear()
  toast.error.mockClear()
  createPet.mockReset()
  updatePet.mockReset()
  requestUpload.mockReset()
  confirmUpload.mockReset()
})

async function fillRequired(user: ReturnType<typeof userEvent.setup>, speciesLabel = "Mačka") {
  await user.type(screen.getByLabelText("Ime *"), "Luna")
  await user.click(screen.getByRole("combobox", { name: "Vrsta *" }))
  await user.click(await screen.findByRole("option", { name: speciesLabel }))
  await user.click(screen.getByRole("radio", { name: "Ženka" }))
}

describe("S02 create — FR-01", () => {
  it("species 'Ostalo' without the free text: inline message and no request sent", async () => {
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user, "Ostalo")
    expect(screen.getByLabelText("Koja vrsta? *")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(screen.getByText("Upiši koja je vrsta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Koja vrsta? *")).toHaveAttribute("aria-invalid", "true")
    expect(createPet).not.toHaveBeenCalled()
  })

  it("required fields missing: inline messages, no request", async () => {
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(screen.getByText("Upiši ime ljubimca.")).toBeInTheDocument()
    expect(screen.getByText("Izaberi vrstu.")).toBeInTheDocument()
    expect(screen.getByText("Izaberi pol.")).toBeInTheDocument()
    expect(createPet).not.toHaveBeenCalled()
  })

  it("all required fields → EP-03 with the form values, then toast and redirect to S03", async () => {
    createPet.mockResolvedValue({ ok: true, data: { ...lunaPet, has_photo: false } })
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user, "Ostalo")
    await user.type(screen.getByLabelText("Koja vrsta? *"), "degu")
    await user.click(screen.getByRole("radio", { name: "Znam okvirnu godinu" }))
    await user.type(screen.getByLabelText("Okvirna godina rođenja"), "2021")
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(createPet).toHaveBeenCalledWith({
      name: "Luna",
      species: "other",
      species_other: "degu",
      sex: "female",
      breed: null,
      colour_markings: null,
      microchip_number: null,
      passport_number: null,
      birth_date: null,
      birth_year: 2021,
      neutered: "unknown",
      vet_name: null,
      vet_phone: null,
      weight_unit: "kg",
      note: null,
    })
    expect(toast).toHaveBeenCalledWith("Luna je sada među tvojim ljubimcima.")
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA_ID}`)
  })

  it("FR-03: the unit set to grams is saved", async () => {
    createPet.mockResolvedValue({ ok: true, data: { ...lunaPet, weight_unit: "g" } })
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user)
    await user.click(screen.getByRole("radio", { name: "Grami (g)" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(createPet).toHaveBeenCalledWith(expect.objectContaining({ species: "cat", weight_unit: "g" }))
  })

  it("premium_required (second active pet on Free) → PremiumLock, no redirect", async () => {
    createPet.mockResolvedValue({ ok: false, error: { code: "premium_required", message: "", details: { limit: "pets" } } })
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(await screen.findByText("Dostupno u Premiumu")).toBeInTheDocument()
    expect(screen.getByText(/Na Free planu imaš jednog aktivnog ljubimca/)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("422 field codes render inline; an unmapped code shows the form-level error", async () => {
    createPet.mockResolvedValueOnce({ ok: false, error: { code: "validation_failed", message: "", fields: { name: "required" } } })
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(await screen.findByText("Upiši ime ljubimca.")).toBeInTheDocument()
    expect(screen.getByLabelText("Ime *")).toHaveAttribute("aria-invalid", "true")

    createPet.mockResolvedValueOnce({ ok: false, error: { code: "validation_failed", message: "", fields: { microchip_number: "too_long" } } })
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nismo uspeli da sačuvamo ljubimca. Proveri označena polja i pokušaj ponovo.",
    )
  })

  it("5xx → the X state; 'Pokušaj ponovo' dismisses it", async () => {
    createPet.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "" } })
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    const alert = await screen.findByRole("alert")
    await user.click(within(alert).getByRole("button", { name: "Pokušaj ponovo" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("a chosen photo is uploaded through EP-13 after the pet exists; 'Ukloni fotografiju' clears it before saving", async () => {
    createPet.mockResolvedValue({ ok: true, data: { ...lunaPet, has_photo: false } })
    requestUpload.mockResolvedValue({
      ok: true,
      data: { upload_token: "up_x.y", put_url: "https://r2.test/put", method: "PUT", headers: { "Content-Type": "image/png", "Content-Length": "4" } },
    })
    confirmUpload.mockResolvedValue({ ok: true, data: lunaPet })
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<PetFormClient locale="sr" copy={copy("sr")} />)
    const file = new File(["abcd"], "luna.png", { type: "image/png" })
    await user.upload(screen.getByTestId("pet-photo-input"), file)
    expect(screen.getByText("luna.png")).toBeInTheDocument()
    // The button is labelled by "Fotografija"; its text says what it does.
    const photoButton = screen.getByRole("button", { name: "Fotografija" })
    expect(photoButton).toHaveTextContent("Ukloni fotografiju")
    await user.click(photoButton)
    expect(photoButton).toHaveTextContent("Izaberi fotografiju")
    expect(screen.getByText("Još nema fotografije")).toBeInTheDocument()
    await user.upload(screen.getByTestId("pet-photo-input"), file)
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: "Sačuvaj ljubimca" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalled())
    expect(requestUpload).toHaveBeenCalledWith({
      purpose: "pet_photo",
      target_id: LUNA_ID,
      file_name: "luna.png",
      mime_type: "image/png",
      size_bytes: 4,
    })
    expect(fetchMock).toHaveBeenCalledWith("https://r2.test/put", expect.objectContaining({ method: "PUT", body: file }))
    expect(confirmUpload).toHaveBeenCalledWith({ upload_token: "up_x.y" })
    expect(toast.error).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe("S02 edit — FR-02", () => {
  it("preloads every field from the EP-02 pet", () => {
    render(<PetFormClient pet={lunaPet as never} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni profil: Luna" })).toBeInTheDocument()
    expect(screen.getByLabelText("Ime *")).toHaveValue("Luna")
    expect(screen.getByRole("combobox", { name: "Vrsta *" })).toHaveTextContent("Mačka")
    expect(screen.getByLabelText("Rasa")).toHaveValue("Britanska kratkodlaka")
    expect(screen.getByRole("radio", { name: "Ženka" })).toBeChecked()
    expect(screen.getByRole("button", { name: /Datum rođenja/ })).toHaveTextContent("12. 4. 2023.")
    expect(screen.getByLabelText("Boja i oznake")).toHaveValue("Plavo-siva, bela mrlja na grudima")
    expect(screen.getByText("0b1c-luna-profil.jpg")).toBeInTheDocument()
    expect(screen.getByLabelText("Broj mikročipa")).toHaveValue("688038000123456")
    expect(screen.getByLabelText("Broj pasoša")).toHaveValue("RS-NS-0451-23")
    expect(screen.getByRole("radio", { name: "Da" })).toBeChecked()
    expect(screen.getByLabelText("Ime veterinara ili ambulante")).toHaveValue("Veterinarska ambulanta „Dr Vet”, Novi Sad")
    expect(screen.getByLabelText("Telefon")).toHaveValue("021 456 789")
    expect(screen.getByRole("radio", { name: "Kilogrami (kg)" })).toBeChecked()
    expect(screen.getByLabelText("Napomena")).toHaveValue("Ne voli transporter — staviti ćebe unutra.")
    expect(screen.getByRole("link", { name: "Nazad na karton" })).toHaveAttribute("href", `/ljubimci/${LUNA_ID}`)
  })

  it("a changed field is saved through EP-04 for this pet, then toast and S03", async () => {
    updatePet.mockResolvedValue({ ok: true, data: { ...lunaPet, name: "Luna Mia", weight_unit: "g" } })
    const user = userEvent.setup()
    render(<PetFormClient pet={lunaPet as never} locale="sr" copy={copy("sr")} />)
    await user.clear(screen.getByLabelText("Ime *"))
    await user.type(screen.getByLabelText("Ime *"), "Luna Mia")
    await user.click(screen.getByRole("radio", { name: "Grami (g)" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj promene" }))
    expect(updatePet).toHaveBeenCalledWith(
      LUNA_ID,
      expect.objectContaining({ name: "Luna Mia", species: "cat", birth_date: "2023-04-12", birth_year: null, weight_unit: "g" }),
    )
    expect(createPet).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Promene za Luna Mia su sačuvane.")
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA_ID}`)
  })

  it("English: the form reads the en dictionary", () => {
    render(<PetFormClient pet={lunaPet as never} locale="en" copy={copy("en")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Edit profile: Luna" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Species *" })).toHaveTextContent("Cat")
    expect(screen.getByRole("button", { name: /Date of birth/ })).toHaveTextContent("12 Apr 2023")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })
})

// The server actions (EP-03 / EP-04) with a fake server client.
function fakeClient({ insertError = null as null | { code: string; message: string } } = {}) {
  const writes: { op: string; row: Record<string, unknown> }[] = []
  const client = {
    writes,
    auth: {
      getUser: async () => ({
        data: { user: { id: "a1000000-0000-4000-8000-000000000002", email: "m@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from(table: string) {
      let pending: { op: string; row: Record<string, unknown> } | null = null
      const resolve = () => {
        if (table === "profiles") return { data: { id: "a1000000-0000-4000-8000-000000000002", deletion_requested_at: null }, error: null }
        if (table === "organisation_memberships") return { data: [], error: null }
        if (pending) writes.push(pending)
        if (insertError) return { data: null, error: insertError }
        return { data: { id: LUNA_ID, photo_r2_key: null, price_minor: null, ...pending?.row }, error: null }
      }
      const builder = {
        select: () => builder,
        insert: (row: Record<string, unknown>) => ((pending = { op: "insert", row }), builder),
        update: (row: Record<string, unknown>) => ((pending = { op: "update", row }), builder),
        eq: () => builder,
        single: async () => resolve(),
        maybeSingle: async () => resolve(),
        then: (r: (v: unknown) => void) => r(resolve()),
      }
      return builder
    },
  }
  return client
}

const validInput = { name: "Kiki", species: "rabbit" as const, sex: "female" as const }

describe("EP-03 / EP-04 server actions", () => {
  it("species other without species_other → validation_failed, nothing written", async () => {
    const client = fakeClient()
    supabase.current = client
    const result = await actions.createPet({ ...validInput, species: "other", species_other: "  " })
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { species_other: "required" } } })
    expect(client.writes).toHaveLength(0)
  })

  it("field rules: name 1–60, birth_year 1990…now, birth_date not in the future, date XOR year", async () => {
    supabase.current = fakeClient()
    expect(await actions.createPet({ ...validInput, name: "x".repeat(61) })).toMatchObject({ error: { fields: { name: "too_long" } } })
    expect(await actions.createPet({ ...validInput, birth_year: 1989 })).toMatchObject({ error: { fields: { birth_year: "out_of_range" } } })
    expect(await actions.createPet({ ...validInput, birth_date: "2999-01-01" })).toMatchObject({ error: { fields: { birth_date: "out_of_range" } } })
    expect(await actions.createPet({ ...validInput, birth_date: "2020-01-01", birth_year: 2020 })).toMatchObject({
      error: { fields: { birth_year: "invalid" } },
    })
    expect(await actions.createPet({ ...validInput, breeding_status: "active" } as never)).toMatchObject({
      error: { fields: { breeding_status: "invalid" } },
    })
  })

  it("an owner's pet is inserted with owner_id = caller and returned as Pet", async () => {
    const client = fakeClient()
    supabase.current = client
    const result = await actions.createPet({ ...validInput, weight_unit: "g" })
    expect(client.writes[0]).toEqual({
      op: "insert",
      row: expect.objectContaining({
        name: "Kiki",
        species: "rabbit",
        species_other: null,
        sex: "female",
        weight_unit: "g",
        owner_id: "a1000000-0000-4000-8000-000000000002",
        organisation_id: null,
      }),
    })
    expect(result).toMatchObject({ ok: true, data: { id: LUNA_ID, has_photo: false, photo_file_name: null, price: null, weight_unit: "g" } })
  })

  it("the Free limit trigger's premium_required:pets → premium_required { limit: pets }", async () => {
    supabase.current = fakeClient({ insertError: { code: "P0001", message: "premium_required:pets" } })
    expect(await actions.createPet(validInput)).toMatchObject({
      ok: false,
      error: { code: "premium_required", details: { limit: "pets" } },
    })
  })

  it("update: lifecycle / photo_r2_key are not writable through EP-04", async () => {
    supabase.current = fakeClient()
    expect(await actions.updatePet(LUNA_ID, { lifecycle: "memorial" } as never)).toMatchObject({
      error: { code: "validation_failed", fields: { lifecycle: "invalid" } },
    })
    const client = fakeClient()
    supabase.current = client
    expect((await actions.updatePet(LUNA_ID, { weight_unit: "g" })).ok).toBe(true)
    expect(client.writes[0]).toEqual({ op: "update", row: { weight_unit: "g" } })
  })
})
