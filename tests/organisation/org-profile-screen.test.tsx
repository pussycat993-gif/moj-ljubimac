import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OrgProfileActions } from "@/app/(org)/organizacija/profil/org-profile-screen"
import type { MyOrganisation, Organisation } from "@/lib/actions/organisation"

// S29 Javni profil organizacije (Step 24) · FR-60 #1: the Admin saves description, phone, email and website
// through EP-72 and the screen shows the saved values and the "Sačuvano" status; the logo goes through EP-13
// (organisation_logo: ticket → PUT → confirm) and "X" removes it on save; inline field errors. FR-60 #2:
// access.can_edit = false (Volunteer) → the read-only view with the volunteer banner.

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const { OrgProfileScreen } = await import("@/app/(org)/organizacija/profil/org-profile-screen")
const { dictionaries } = await import("@/lib/i18n")

const ORG = "b2000000-0000-4000-8000-000000000001"

function organisation(extra: Partial<Organisation> = {}): Organisation {
  return {
    id: ORG,
    type: "shelter",
    name: "Azil Šapica",
    slug: "azil-sapica",
    public_path: "/o/azil-sapica",
    city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 },
    approval_status: "approved",
    rejection_reason: null,
    tax_id: null,
    registration_note: null,
    description: "Mali azil u Bečeju.",
    phone: "021 123 456",
    email: "kontakt@azilsapica.rs",
    website: null,
    logo_url: null,
    donation: null,
    member_count: 2,
    member_limit: 20,
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  }
}

function view(role: "org_admin" | "volunteer" = "org_admin", extra: Partial<Organisation> = {}): MyOrganisation {
  return {
    organisation: organisation(extra),
    team: [],
    pending_invitations: [],
    breeder_plan_active: false,
    access: { role, can_edit: role === "org_admin", can_delete: role === "org_admin" },
  }
}

const actions = {
  updateOrganisationProfile: vi.fn(),
  requestUpload: vi.fn(),
  confirmUpload: vi.fn(),
} satisfies Record<keyof OrgProfileActions, unknown>

const copy = (locale: "sr" | "en") => ({
  orgProfile: dictionaries[locale].orgProfile,
  orgAnimals: dictionaries[locale].orgAnimals,
  common: dictionaries[locale].common,
})

function renderScreen(v: MyOrganisation = view(), locale: "sr" | "en" = "sr") {
  return render(
    <OrgProfileScreen
      initial={{ ok: true, data: v }}
      locale={locale}
      copy={copy(locale)}
      actions={actions as unknown as OrgProfileActions}
    />,
  )
}

beforeEach(() => vi.clearAllMocks())

describe("S29 Admin (FR-60 #1)", () => {
  it("saves description, phone, email and website through EP-72 and shows the saved state", async () => {
    actions.updateOrganisationProfile.mockResolvedValue({
      ok: true,
      data: organisation({ description: "Novi opis.", website: "https://azilsapica.rs" }),
    })
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Javni profil" })).toBeInTheDocument()
    expect(screen.getByText("Azil Šapica, Bečej")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pogledaj javnu stranicu" })).toHaveAttribute("href", "/o/azil-sapica")
    expect(screen.getByText("19 / 1000")).toBeInTheDocument()

    const description = screen.getByLabelText("Opis")
    await userEvent.clear(description)
    await userEvent.type(description, "Novi opis.")
    await userEvent.type(screen.getByLabelText("Sajt"), "https://azilsapica.rs")
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))

    expect(actions.updateOrganisationProfile).toHaveBeenCalledWith({
      organisation_id: ORG,
      description: "Novi opis.",
      phone: "021 123 456",
      email: "kontakt@azilsapica.rs",
      website: "https://azilsapica.rs",
    })
    expect(await screen.findByRole("status")).toHaveTextContent("Sačuvano. Javna stranica prikazuje izmene za najviše 5 minuta.")
    expect(screen.getByLabelText("Opis")).toHaveValue("Novi opis.")
    expect(screen.getByLabelText("Sajt")).toHaveValue("https://azilsapica.rs")
  })

  it("inline errors: website without https://, a bad email; nothing is saved", async () => {
    renderScreen()
    await userEvent.type(screen.getByLabelText("Sajt"), "http://azilsapica.rs")
    const email = screen.getByLabelText("Mejl")
    await userEvent.clear(email)
    await userEvent.type(email, "nije mejl")
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    expect(screen.getByText("Adresa sajta počinje sa https://")).toBeInTheDocument()
    expect(screen.getByText("Upiši ispravnu mejl adresu.")).toBeInTheDocument()
    expect(actions.updateOrganisationProfile).not.toHaveBeenCalled()
  })

  it("a server field error maps to the field's message", async () => {
    actions.updateOrganisationProfile.mockResolvedValue({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { description: "too_long" } },
    })
    renderScreen()
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    expect(await screen.findByText("Opis može imati najviše 1000 znakova.")).toBeInTheDocument()
  })

  it("EP-13 organisation_logo: ticket → PUT → confirm; the logo chip shows the file", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    actions.requestUpload.mockResolvedValue({
      ok: true,
      data: {
        upload_token: "up_x.y",
        put_url: "https://r2.test/put",
        method: "PUT",
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
        expires_at: "2026-10-23T10:10:00Z",
        file_name: "logo.png",
        position: null,
      },
    })
    actions.confirmUpload.mockResolvedValue({
      ok: true,
      data: organisation({
        logo_url: { kind: "organisation_logo", id: ORG, url: "https://r2.test/o/x/logo-1.png?sig", expires_at: null, mime_type: null },
      }),
    })
    renderScreen()
    const file = new File(["logo"], "logo.png", { type: "image/png" })
    await userEvent.upload(screen.getByTestId("logo-input"), file)
    await waitFor(() =>
      expect(actions.requestUpload).toHaveBeenCalledWith({
        purpose: "organisation_logo",
        target_id: ORG,
        file_name: "logo.png",
        mime_type: "image/png",
        size_bytes: 4,
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith("https://r2.test/put", expect.objectContaining({ method: "PUT" }))
    expect(actions.confirmUpload).toHaveBeenCalledWith({ upload_token: "up_x.y" })
    expect(await screen.findByText("logo.png")).toBeInTheDocument()

    // X removes the logo on save (EP-72 logo_r2_key = null).
    actions.updateOrganisationProfile.mockResolvedValue({ ok: true, data: organisation() })
    await userEvent.click(screen.getByRole("button", { name: "Ukloni logo logo.png" }))
    expect(screen.getByRole("button", { name: "Dodaj logo" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    expect(actions.updateOrganisationProfile).toHaveBeenCalledWith(expect.objectContaining({ logo_r2_key: null }))
    vi.unstubAllGlobals()
  })
})

describe("S29 read-only (FR-60 #2)", () => {
  it("access.can_edit = false (Volunteer) → banner and the values read-only, no form", () => {
    renderScreen(view("volunteer", { website: "https://azilsapica.rs" }))
    expect(
      screen.getByText(
        "Ti si volonter u ovoj organizaciji. Javni profil menjaju samo admini — javi im se ako nešto treba ispraviti.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Sačuvaj profil" })).not.toBeInTheDocument()
    expect(screen.getByText("Mali azil u Bečeju.")).toBeInTheDocument()
    expect(screen.getByText("021 123 456")).toBeInTheDocument()
    expect(screen.getByText("https://azilsapica.rs")).toBeInTheDocument()
    expect(screen.getByText("Nije dodat")).toBeInTheDocument()
  })

  it("English", () => {
    renderScreen(view("volunteer"), "en")
    expect(screen.getByRole("heading", { level: 1, name: "Public profile" })).toBeInTheDocument()
    expect(screen.getByText("Not added")).toBeInTheDocument()
  })
})
