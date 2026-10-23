import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TransferActions } from "@/app/(auth)/poziv/[token]/invite-accept-screen"
import type { TransferView } from "@/lib/actions/transfers"
import type { ActionResult } from "@/lib/server/result"

// S14 Prihvati karton — record-transfer variants (Step 25) · from EP-60 (API §7.3): transfer (animal card with
// counts, "{organisation} zadržava kopiju…", validity, Prihvati karton / Odbij); FR-51 slot taken (403
// premium_required / transfer_slot → PremiumLock naming details.slot_pet_name, CTA → /premium); accepted;
// declined (invitation_declined); sign-in (no session); expired (410); error (404); invitation_used and
// forbidden_role inline.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

const { TransferAcceptScreen } = await import("@/app/(auth)/poziv/[token]/invite-accept-screen")
const { dictionaries } = await import("@/lib/i18n")

const TOKEN = "tr_abc.def"

const copy = (locale: "sr" | "en") => ({
  invitation: dictionaries[locale].invitation,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function view(extra: Partial<TransferView> = {}): TransferView {
  return {
    transfer_id: "f9260000-0000-4000-8000-0000000000b2",
    status: "pending",
    expires_at: "2026-11-18T10:00:00Z",
    organisation: { name: "Udruženje „Druga šansa”", city: { id: "c", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 0, longitude: 0 } },
    animal: {
      name: "Maks",
      sex: "male",
      species: "dog",
      species_other: null,
      breed: "mešanac",
      approx_age_text: "oko 2 godine",
      birth_date: null,
      microchip_number: "688 038 100 245 117",
      photo_url: null,
    },
    counts: { vaccinations: 3, vet_visits: 2, attachments: 5 },
    new_pet_id: null,
    ...extra,
  }
}

const accept = vi.fn()
const decline = vi.fn()
const actions: TransferActions = { acceptTransfer: (...a) => accept(...a), declineTransfer: (...a) => decline(...a) }

function renderScreen(initial: ActionResult<TransferView>, opts: { locale?: "sr" | "en"; signedIn?: boolean } = {}) {
  return render(
    <TransferAcceptScreen
      token={TOKEN}
      initial={initial}
      user={opts.signedIn === false ? null : { name: "Marko Jovanović", email: "marko@mojljubimac.test" }}
      locale={opts.locale ?? "sr"}
      copy={copy(opts.locale ?? "sr")}
      actions={actions}
    />,
  )
}

beforeEach(() => {
  accept.mockReset()
  decline.mockReset()
  push.mockReset()
})

describe("S14 transfer (FR-50)", () => {
  it("shows the record from the organisation with the animal card, counts, copy note and validity", () => {
    renderScreen({ ok: true, data: view() })
    expect(screen.getByText("Prenos kartona")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Stiže ti karton: Maks" })).toBeInTheDocument()
    expect(
      screen.getByText("Udruženje „Druga šansa” iz mesta Novi Sad ti šalje kompletan karton — sa svim vakcinama, pregledima i prilozima."),
    ).toBeInTheDocument()
    expect(screen.getByText("Pas · mešanac · oko 2 godine")).toBeInTheDocument()
    expect(screen.getByText("Mikročip 688 038 100 245 117")).toBeInTheDocument()
    expect(screen.getByText("3 vakcine")).toBeInTheDocument()
    expect(screen.getByText("2 pregleda")).toBeInTheDocument()
    expect(screen.getByText("5 priloga")).toBeInTheDocument()
    expect(screen.getByText("Udruženje „Druga šansa” zadržava kopiju kartona samo za čitanje.")).toBeInTheDocument()
    expect(screen.getByText("Poziv važi do 18. 11. 2026.")).toBeInTheDocument()
    expect(screen.getByText("marko@mojljubimac.test")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prihvati karton" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Odbij" })).toBeInTheDocument()
  })

  it("plural forms: 1 vakcina, 1 pregled, 1 prilog", () => {
    renderScreen({ ok: true, data: view({ counts: { vaccinations: 1, vet_visits: 1, attachments: 1 } }) })
    expect(screen.getByText("1 vakcina")).toBeInTheDocument()
    expect(screen.getByText("1 pregled")).toBeInTheDocument()
    expect(screen.getByText("1 prilog")).toBeInTheDocument()
  })

  it("Prihvati karton → accepted confirmation with a link to the pets", async () => {
    accept.mockResolvedValue({ ok: true, data: view({ status: "accepted", new_pet_id: "new-pet" }) })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati karton" }))
    expect(accept).toHaveBeenCalledWith({ token: TOKEN })
    expect(await screen.findByRole("heading", { name: "Novi ljubimac: Maks" })).toBeInTheDocument()
    expect(screen.getByText("Ceo karton je prebačen. Podesi podsetnike za sledeću vakcinu.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Idi na ljubimce" })).toHaveAttribute("href", "/ljubimci")
  })

  it("Odbij → declined (invitation_declined)", async () => {
    decline.mockResolvedValue({ ok: true, data: view({ status: "declined" }) })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Odbij" }))
    const status = await screen.findByRole("status")
    expect(within(status).getByRole("heading", { name: "Prenos kartona je odbijen" })).toBeInTheDocument()
    expect(
      within(status).getByText("Javili smo da ne prihvataš karton (ljubimac: Maks). Karton ostaje kod organizacije Udruženje „Druga šansa”."),
    ).toBeInTheDocument()
  })

  it("invitation_used and forbidden_role are inline", async () => {
    accept.mockResolvedValueOnce({ ok: false, error: { code: "forbidden_role", message: "x" } })
    accept.mockResolvedValueOnce({ ok: false, error: { code: "invitation_used", message: "x" } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati karton" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Karton može da primi samo nalog vlasnika ljubimca.")
    await userEvent.click(screen.getByRole("button", { name: "Prihvati karton" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ovaj link je već iskorišćen")
  })
})

describe("S14 slot taken (FR-51, E-20)", () => {
  it("403 premium_required / transfer_slot → PremiumLock naming the pet in the slot; the CTA opens /premium", async () => {
    accept.mockResolvedValue({
      ok: false,
      error: {
        code: "premium_required",
        message: "premium_required:transfer_slot",
        details: { limit: "transfer_slot", slot_pet_id: "c1000000-0000-4000-8000-000000000001", slot_pet_name: "Luna" },
      },
    })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati karton" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Nema slobodnog mesta za karton: Maks" })).toBeInTheDocument()
    expect(screen.getByText("Na Free planu imaš jednog aktivnog ljubimca, a to mesto već zauzima Luna.")).toBeInTheDocument()
    expect(screen.getByText("Poziv važi do 18. 11. 2026. — imaš vremena da odlučiš.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(
      screen.getByText("Uz Premium prihvataš ovaj karton i dodaješ ljubimaca koliko želiš. Prvih 7 dana je besplatno."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Prihvati karton" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(push).toHaveBeenCalledWith("/premium")
  })
})

describe("S14 other transfer variants", () => {
  it("a Visitor gets the sign-in variant with next=/poziv/<token>", () => {
    renderScreen({ ok: true, data: view() }, { signedIn: false })
    expect(screen.getByRole("heading", { level: 1, name: "Stiže ti karton: Maks" })).toBeInTheDocument()
    expect(screen.getByText("Da prihvatiš poziv, prijavi se ili napravi besplatan nalog. Poziv te čeka ovde.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Napravi nalog" })).toHaveAttribute("href", "/registracija")
    expect(screen.getByRole("link", { name: "Već imam nalog — prijavi me" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent(`/poziv/${TOKEN}`)}`,
    )
    expect(screen.queryByRole("button", { name: "Prihvati karton" })).not.toBeInTheDocument()
  })

  it("401 on accept → the sign-in variant", async () => {
    accept.mockResolvedValue({ ok: false, error: { code: "unauthenticated", message: "x" } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati karton" }))
    expect(await screen.findByRole("link", { name: "Napravi nalog" })).toBeInTheDocument()
  })

  it("410 invitation_expired → expired", () => {
    renderScreen({ ok: false, error: { code: "invitation_expired", message: "x" } })
    expect(screen.getByRole("heading", { name: "Ovaj poziv je istekao" })).toBeInTheDocument()
    expect(screen.getByText("Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv.")).toBeInTheDocument()
  })

  it("404 → error", () => {
    renderScreen({ ok: false, error: { code: "not_found", message: "x" } })
    expect(screen.getByRole("alert")).toHaveTextContent("Poziv nije pronađen")
  })

  it("an already declined transfer opens on the declined variant; an accepted one (by me) on the confirmation", () => {
    const { unmount } = renderScreen({ ok: true, data: view({ status: "declined" }) })
    expect(screen.getByRole("heading", { name: "Prenos kartona je odbijen" })).toBeInTheDocument()
    unmount()
    renderScreen({ ok: true, data: view({ status: "accepted", new_pet_id: "p" }) })
    expect(screen.getByRole("heading", { name: "Novi ljubimac: Maks" })).toBeInTheDocument()
  })

  it("a transfer accepted by someone else shows the used message and no buttons", () => {
    renderScreen({ ok: true, data: view({ status: "accepted", new_pet_id: null }) })
    expect(screen.getByRole("alert")).toHaveTextContent("Ovaj link je već iskorišćen")
    expect(screen.queryByRole("button", { name: "Prihvati karton" })).not.toBeInTheDocument()
  })

  it("English", () => {
    renderScreen({ ok: true, data: view() }, { locale: "en" })
    expect(screen.getByRole("heading", { level: 1, name: "A record is on its way: Maks" })).toBeInTheDocument()
    expect(screen.getByText("3 vaccinations")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept the record" })).toBeInTheDocument()
  })
})
