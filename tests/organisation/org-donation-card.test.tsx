import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OrgProfileActions, UpdateDonationInfoAction } from "@/app/(org)/organizacija/profil/org-profile-screen"
import type { DonationInfo, MyOrganisation, Organisation } from "@/lib/actions/organisation"

// S29 Donacije card (Step 28b) · FR-72 #1 the Shelter Admin saves the four donation fields through EP-88
// (updateDonationInfo) → toast; FR-72 #2 a Volunteer sees the values read-only (no inputs, no save) and breeders
// never see the card; FR-72 #3 fields.payment_url / fields.bank_account "invalid" → inline errors.

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const { OrgProfileScreen } = await import("@/app/(org)/organizacija/profil/org-profile-screen")
const { dictionaries } = await import("@/lib/i18n")

const ORG = "b2000000-0000-4000-8000-000000000001"

function donation(extra: Partial<DonationInfo> = {}): DonationInfo {
  return {
    organisation_id: ORG,
    organisation_name: "Azil Šapica",
    city: null,
    bank_account: "160-0000012345678-90",
    payment_url: "https://azilsapica.rs/doniraj",
    dropoff_address: "Temerinski put 120, Novi Sad",
    dropoff_hours: "Subota 10:00 – 14:00",
    payment_purpose: null,
    has_any: true,
    ...extra,
  }
}

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
    donation: donation(),
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
    breeder_plan_active: true,
    access: { role, can_edit: role === "org_admin", can_delete: role === "org_admin" },
  }
}

const actions = {
  updateOrganisationProfile: vi.fn(),
  requestUpload: vi.fn(),
  confirmUpload: vi.fn(),
} satisfies Record<keyof OrgProfileActions, unknown>
const updateDonationInfo = vi.fn<UpdateDonationInfoAction>()

function renderScreen(v: MyOrganisation = view(), locale: "sr" | "en" = "sr") {
  return render(
    <OrgProfileScreen
      initial={{ ok: true, data: v }}
      locale={locale}
      copy={{ orgProfile: dictionaries[locale].orgProfile, orgAnimals: dictionaries[locale].orgAnimals, common: dictionaries[locale].common }}
      actions={actions as unknown as OrgProfileActions}
      updateDonationInfo={updateDonationInfo}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.updateOrganisationProfile.mockImplementation(async () => ({ ok: true, data: organisation() }))
})

describe("S29 Donacije — Shelter Admin (FR-72 #1)", () => {
  it("prefills from Organisation.donation, saves the changed values through EP-88 and shows the toast", async () => {
    updateDonationInfo.mockResolvedValue({
      ok: true,
      data: donation({ payment_url: "https://azilsapica.rs/uplata", dropoff_hours: null }),
    })
    renderScreen()
    expect(screen.getByRole("heading", { level: 2, name: "Donacije" })).toBeInTheDocument()
    expect(
      screen.getByText(
        "Prikazuje se kad neko klikne „Doniraj“ na potrebi azila u Šapi pomoći. Novac ne prolazi kroz Moj Ljubimac — uplate stižu direktno vama.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Broj računa")).toHaveValue("160-0000012345678-90")
    expect(screen.getByLabelText("Adresa za donošenje")).toHaveValue("Temerinski put 120, Novi Sad")

    const url = screen.getByLabelText("Link za uplatu")
    await userEvent.clear(url)
    await userEvent.type(url, "https://azilsapica.rs/uplata")
    await userEvent.clear(screen.getByLabelText("Radno vreme za donošenje"))
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))

    await waitFor(() =>
      expect(updateDonationInfo).toHaveBeenCalledWith({ payment_url: "https://azilsapica.rs/uplata", dropoff_hours: null }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sačuvano. Javna stranica prikazuje izmene za najviše 5 minuta."))
    expect(screen.getByLabelText("Link za uplatu")).toHaveValue("https://azilsapica.rs/uplata")
    expect(screen.getByLabelText("Radno vreme za donošenje")).toHaveValue("")
  })

  it("all four values from an empty card", async () => {
    updateDonationInfo.mockResolvedValue({ ok: true, data: donation() })
    renderScreen(view("org_admin", { donation: donation({ bank_account: null, payment_url: null, dropoff_address: null, dropoff_hours: null, has_any: false }) }))
    await userEvent.type(screen.getByLabelText("Broj računa"), "160-0000012345678-90")
    await userEvent.type(screen.getByLabelText("Link za uplatu"), "https://azilsapica.rs/doniraj")
    await userEvent.type(screen.getByLabelText("Adresa za donošenje"), "Temerinski put 120, Novi Sad")
    await userEvent.type(screen.getByLabelText("Radno vreme za donošenje"), "Subota 10:00 – 14:00")
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    await waitFor(() =>
      expect(updateDonationInfo).toHaveBeenCalledWith({
        bank_account: "160-0000012345678-90",
        payment_url: "https://azilsapica.rs/doniraj",
        dropoff_address: "Temerinski put 120, Novi Sad",
        dropoff_hours: "Subota 10:00 – 14:00",
      }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it("unchanged donation fields are not sent", async () => {
    renderScreen()
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    await waitFor(() => expect(actions.updateOrganisationProfile).toHaveBeenCalled())
    expect(await screen.findByRole("status")).toBeInTheDocument()
    expect(updateDonationInfo).not.toHaveBeenCalled()
  })
})

describe("S29 Donacije — read-only and breeders (FR-72 #2)", () => {
  it("a Volunteer sees the four values read-only, no inputs and no save", () => {
    renderScreen(view("volunteer"))
    expect(screen.getByRole("heading", { level: 2, name: "Donacije" })).toBeInTheDocument()
    expect(screen.getByText("160-0000012345678-90")).toBeInTheDocument()
    expect(screen.getByText("https://azilsapica.rs/doniraj")).toBeInTheDocument()
    expect(screen.getByText("Temerinski put 120, Novi Sad")).toBeInTheDocument()
    expect(screen.getByText("Subota 10:00 – 14:00")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Broj računa")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Sačuvaj profil" })).not.toBeInTheDocument()
  })

  it("English read-only labels", () => {
    renderScreen(view("volunteer"), "en")
    expect(screen.getByRole("heading", { level: 2, name: "Donations" })).toBeInTheDocument()
    expect(screen.getByText("Bank account")).toBeInTheDocument()
    expect(screen.getByText("Drop-off hours")).toBeInTheDocument()
  })

  it("a breeder never sees the card (Admin or Volunteer)", () => {
    const { unmount } = renderScreen(view("org_admin", { type: "breeder", donation: null }))
    expect(screen.queryByText("Donacije")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Broj računa")).not.toBeInTheDocument()
    unmount()
    renderScreen(view("volunteer", { type: "breeder", donation: null }))
    expect(screen.queryByText("Donacije")).not.toBeInTheDocument()
  })
})

describe("S29 Donacije — inline errors (FR-72 #3)", () => {
  it("client-side: a non-https link and a malformed account block the save", async () => {
    renderScreen()
    const url = screen.getByLabelText("Link za uplatu")
    await userEvent.clear(url)
    await userEvent.type(url, "http://azilsapica.rs")
    const account = screen.getByLabelText("Broj računa")
    await userEvent.clear(account)
    await userEvent.type(account, "160-123")
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    expect(screen.getByText("Link za uplatu počinje sa https://")).toBeInTheDocument()
    expect(screen.getByText("Upiši račun u obliku 160-0000012345678-90.")).toBeInTheDocument()
    expect(actions.updateOrganisationProfile).not.toHaveBeenCalled()
    expect(updateDonationInfo).not.toHaveBeenCalled()
  })

  it("server 422 fields.payment_url and fields.bank_account = invalid render inline errors", async () => {
    updateDonationInfo.mockResolvedValue({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { payment_url: "invalid", bank_account: "invalid" } },
    })
    renderScreen()
    const url = screen.getByLabelText("Link za uplatu")
    await userEvent.clear(url)
    await userEvent.type(url, "https://azilsapica.rs/novi")
    await userEvent.click(screen.getByRole("button", { name: "Sačuvaj profil" }))
    expect(await screen.findByText("Link za uplatu počinje sa https://")).toBeInTheDocument()
    expect(screen.getByText("Upiši račun u obliku 160-0000012345678-90.")).toBeInTheDocument()
    expect(screen.getByLabelText("Link za uplatu")).toHaveAttribute("aria-invalid", "true")
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
