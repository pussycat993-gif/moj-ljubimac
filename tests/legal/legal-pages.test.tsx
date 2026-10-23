import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// The visitor's language cookie (owner decision, Step 12): ml_locale = sr | en, none → sr.
const cookieJar = new Map<string, string>()
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: () => {},
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("S30/S31 need no session")
  },
}))

const { default: PrivacyPage } = await import("@/app/(public)/privatnost/page")
const { default: TermsPage } = await import("@/app/(public)/uslovi/page")
const { TERMS_VERSION } = await import("@/lib/legal")

const PRIVACY = {
  sr: ["Ko smo", "Koje podatke prikupljamo", "Zašto ih prikupljamo", "Koliko ih čuvamo", "Tvoja prava", "Kontakt"],
  en: ["Who we are", "What data we collect", "Why we collect it", "How long we keep it", "Your rights", "Contact"],
}
const TERMS = {
  sr: ["Opšte", "Nalog", "Premium i plaćanje", "Sadržaj korisnika", "Odgovornost", "Izmene uslova", "Kontakt"],
  en: ["General", "Account", "Premium and payment", "User content", "Liability", "Changes to the terms", "Contact"],
}
const PLACEHOLDER = { sr: "Tekst dostavlja vlasnik (OQ-15).", en: "Text to be supplied by the owner (OQ-15)." }
const FOOTER = {
  sr: { privacy: "Politika privatnosti", terms: "Uslovi korišćenja" },
  en: { privacy: "Privacy policy", terms: "Terms of use" },
}

beforeEach(() => cookieJar.clear())

function expectPublicShell(lang: "sr" | "en") {
  const footer = screen.getByRole("contentinfo")
  expect(within(footer).getByRole("link", { name: FOOTER[lang].privacy })).toHaveAttribute("href", "/privatnost")
  expect(within(footer).getByRole("link", { name: FOOTER[lang].terms })).toHaveAttribute("href", "/uslovi")
  expect(document.querySelector("body > div > div > header")).toBeInTheDocument()
  expect(screen.queryByRole("navigation", { name: /Glavna navigacija|Main navigation/ })).not.toBeInTheDocument()
}

function expectSections(headings: string[], placeholder: string) {
  headings.forEach((heading, i) => {
    const h2 = screen.getByRole("heading", { level: 2, name: `${i + 1}. ${heading}` })
    const section = h2.closest("section")!
    expect(within(section).getByText(placeholder)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: `${i + 1}. ${heading}` })).toHaveAttribute("href", `#${section.id}`)
  })
  expect(screen.getAllByText(placeholder)).toHaveLength(headings.length)
}

describe.each(["sr", "en"] as const)("S30 / S31 in %s (Release Criterion 4, OQ-15 placeholders)", (lang) => {
  beforeEach(() => {
    if (lang === "en") cookieJar.set("ml_locale", "en")
  })

  it("S30 /privatnost renders in the PublicShell with every Design heading and the placeholder", async () => {
    render(await PrivacyPage())
    expectPublicShell(lang)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(lang === "sr" ? "Politika privatnosti" : "Privacy policy")
    expectSections(PRIVACY[lang], PLACEHOLDER[lang])
  })

  it("S31 /uslovi renders in the PublicShell with every Design heading, the placeholder and the version", async () => {
    render(await TermsPage())
    expectPublicShell(lang)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(lang === "sr" ? "Uslovi korišćenja" : "Terms of use")
    expectSections(TERMS[lang], PLACEHOLDER[lang])
    expect(screen.getByText(new RegExp(`${lang === "sr" ? "Verzija" : "Version"} ${TERMS_VERSION}`))).toBeInTheDocument()
  })
})

it("TERMS_VERSION is the owner's initial value", () => {
  expect(TERMS_VERSION).toBe("2026-10-20")
})
