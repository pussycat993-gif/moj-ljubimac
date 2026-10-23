import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Partner } from "@/lib/actions/partners"

// S25 Profil partnera (Step 27) · EP-65 Partner: default renders every field present — logo, name, type, distance,
// address and city, the four quick actions, description, working hours (today marked, missing weekdays closed),
// phone, messaging number and channel, email, website, Instagram (FR-54); minimal omits the absent ones and their
// quick actions (E-24); each quick action calls EP-66 and a failure never blocks the link (FR-55); error on 404 / 5xx
// (partner = null) with a retry; loading has an h1.

const click = vi.fn()
vi.mock("@/lib/actions/partners", () => ({
  listPartnersNearby: vi.fn(),
  recordPartnerClick: (...a: unknown[]) => click(...a),
}))
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const { PartnerProfileScreen, PartnerProfileLoading } = await import("@/app/(app)/partneri/[id]/partner-profile-screen")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en" = "sr") => ({
  partnerProfile: dictionaries[locale].partnerProfile,
  partners: dictionaries[locale].partners,
  common: dictionaries[locale].common,
})
const NOVI_SAD = { id: "c0000000-0000-4000-8000-000000000026", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.255134, longitude: 19.845176 }

const full: Partner = {
  id: "e1000000-0000-4000-8000-000000000001",
  type: "vet",
  name: "Veterinarska ambulanta „Dr Vet“",
  initials: "DV",
  address: "Bulevar oslobođenja 45",
  city: NOVI_SAD,
  phone: "+381 21 455 100",
  message_channel: "whatsapp",
  message_number: "+381 64 455 1000",
  email: "kontakt@drvet.rs",
  website: "https://drvet.rs",
  instagram: "drvet.ns",
  description: "Ambulanta za male životinje sa 15 godina iskustva.",
  logo_url: "https://r2.test/p/e1/logo.png?X-Amz-Expires=600",
  latitude: 45.2541,
  longitude: 19.8425,
  featured: true,
  paid_until: "2027-12-31",
  active: true,
  distance_km: 1.2,
  hours: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "08:00", closes: "20:00" })),
    { weekday: 6, opens: "09:00", closes: "14:00" },
  ],
  today_hours: { weekday: 1, opens: "08:00", closes: "20:00" },
}

const minimal: Partner = {
  ...full,
  id: "e1000000-0000-4000-8000-000000000006",
  type: "pet_shop",
  name: "Pet shop „Kod Ćire“",
  initials: "KĆ",
  address: "Kisačka 33",
  phone: "+381 21 470 115",
  message_channel: "none",
  message_number: null,
  email: null,
  website: null,
  instagram: null,
  description: null,
  logo_url: null,
  featured: false,
  distance_km: null,
  hours: [],
  today_hours: null,
}

let blocked: boolean[] = []
const onWindowClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest("a")) {
    blocked.push(e.defaultPrevented)
    e.preventDefault()
  }
}

beforeEach(() => {
  click.mockReset()
  click.mockResolvedValue({ ok: true, data: null })
  refresh.mockReset()
  blocked = []
  window.addEventListener("click", onWindowClick)
})
afterEach(() => window.removeEventListener("click", onWindowClick))

describe("S25 default (FR-54)", () => {
  it("renders every Partner field present", () => {
    render(<PartnerProfileScreen partner={full} todayWeekday={1} locale="sr" copy={copy()} />)

    expect(screen.getByRole("heading", { level: 1, name: "Veterinarska ambulanta „Dr Vet“" })).toBeInTheDocument()
    expect(screen.getByText("DV")).toBeInTheDocument()
    expect(screen.getByText("Veterinar")).toBeInTheDocument()
    expect(screen.getByText("1,2 km od tebe")).toBeInTheDocument()
    expect(screen.getByText("Bulevar oslobođenja 45, Novi Sad")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "O nama" })).toBeInTheDocument()
    expect(screen.getByText(full.description!)).toBeInTheDocument()

    const contact = screen.getByRole("heading", { name: "Kontakt" }).closest("[data-slot='card']") as HTMLElement
    expect(within(contact).getByText("+381 21 455 100")).toBeInTheDocument()
    expect(within(contact).getByText("+381 64 455 1000 · WhatsApp")).toBeInTheDocument()
    expect(within(contact).getByText("kontakt@drvet.rs")).toBeInTheDocument()
    expect(within(contact).getByRole("link", { name: "drvet.rs" })).toHaveAttribute("href", "https://drvet.rs")
    expect(within(contact).getByRole("link", { name: "Instagram: drvet.ns" })).toHaveAttribute(
      "href",
      "https://instagram.com/drvet.ns",
    )
    expect(within(contact).getByRole("link", { name: "Uputstva do adrese" })).toHaveAttribute(
      "href",
      `https://maps.google.com/?q=${encodeURIComponent("Bulevar oslobođenja 45, Novi Sad")}`,
    )
  })

  it("working hours: every weekday, today marked, a weekday without a row is closed", () => {
    render(<PartnerProfileScreen partner={full} todayWeekday={1} locale="sr" copy={copy()} />)
    const hours = screen.getByRole("heading", { name: "Radno vreme" }).closest("[data-slot='card']") as HTMLElement
    const rows = within(hours).getAllByRole("term").map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ["Ponedeljak · danas", "08:00 – 20:00"],
      ["Utorak", "08:00 – 20:00"],
      ["Sreda", "08:00 – 20:00"],
      ["Četvrtak", "08:00 – 20:00"],
      ["Petak", "08:00 – 20:00"],
      ["Subota", "09:00 – 14:00"],
      ["Nedelja", "Zatvoreno"],
    ])
  })
})

describe("S25 quick actions (FR-55)", () => {
  it("the four actions as large buttons, Poruka by the partner's channel", () => {
    render(<PartnerProfileScreen partner={full} todayWeekday={1} locale="sr" copy={copy()} />)
    const actions = screen.getByRole("region", { name: "Brzi kontakt" })
    const links = within(actions).getAllByRole("link")
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Pozovi", "tel:+38121455100"],
      ["Poruka (WhatsApp)", "https://wa.me/381644551000"],
      ["Pošalji mejl", "mailto:kontakt@drvet.rs"],
      ["Poseti sajt", "https://drvet.rs"],
    ])
  })

  it("each tap calls EP-66 and a failure does not block the link", () => {
    render(<PartnerProfileScreen partner={full} todayWeekday={1} locale="sr" copy={copy()} />)
    const actions = screen.getByRole("region", { name: "Brzi kontakt" })
    click.mockRejectedValueOnce(new Error("network"))
    for (const name of ["Pozovi", "Poruka (WhatsApp)", "Pošalji mejl", "Poseti sajt"]) {
      fireEvent.click(within(actions).getByRole("link", { name }))
    }
    expect(click.mock.calls).toEqual([
      [full.id, "call"],
      [full.id, "message"],
      [full.id, "email"],
      [full.id, "website"],
    ])
    expect(blocked).toEqual([false, false, false, false])
  })
})

describe("S25 minimal (E-24)", () => {
  it("omits absent fields and their quick actions", () => {
    render(<PartnerProfileScreen partner={minimal} todayWeekday={3} locale="sr" copy={copy()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Pet shop „Kod Ćire“" })).toBeInTheDocument()
    expect(screen.getByText("Pet shop")).toBeInTheDocument()
    expect(screen.getByText("KĆ")).toBeInTheDocument()
    expect(document.querySelector("img")).toBeNull()
    expect(screen.queryByText(/od tebe/)).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "O nama" })).not.toBeInTheDocument()

    const actions = screen.getByRole("region", { name: "Brzi kontakt" })
    expect(within(actions).getAllByRole("link").map((a) => a.textContent)).toEqual(["Pozovi"])

    const contact = screen.getByRole("heading", { name: "Kontakt" }).closest("[data-slot='card']") as HTMLElement
    expect(within(contact).getAllByRole("listitem")).toHaveLength(1)
    expect(within(contact).queryByRole("link", { name: /Instagram/ })).not.toBeInTheDocument()

    const hours = screen.getByRole("heading", { name: "Radno vreme" }).closest("[data-slot='card']") as HTMLElement
    expect(within(hours).getAllByText("Zatvoreno")).toHaveLength(7)
    expect(within(hours).getAllByRole("term").map((dt) => dt.textContent)).toContain("Sreda · danas")
  })
})

describe("S25 loading / error", () => {
  it("error on 404 / 5xx with a retry that re-reads the page", async () => {
    const user = userEvent.setup()
    render(<PartnerProfileScreen partner={null} todayWeekday={1} locale="sr" copy={copy()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Profil partnera" })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.getByRole("link", { name: "Partneri" })).toHaveAttribute("href", "/partneri")
    await user.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("loading shows skeletons under an h1", () => {
    render(<PartnerProfileLoading copy={copy()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Profil partnera" })).toBeInTheDocument()
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
  })

  it("English", () => {
    render(<PartnerProfileScreen partner={full} todayWeekday={1} locale="en" copy={copy("en")} />)
    expect(screen.getByText("1.2 km from you")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Message (WhatsApp)" })).toBeInTheDocument()
    expect(screen.getAllByRole("term").map((dt) => dt.textContent)).toContain("Monday · today")
  })
})
