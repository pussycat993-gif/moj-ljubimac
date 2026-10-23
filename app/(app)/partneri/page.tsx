import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { listPartnersNearby, type Partner } from "@/lib/actions/partners"
import type { PetSpecies } from "@/components/app/pet-avatar"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { PartnersLoading, PartnersScreen, type PartnersCopy, type VetBannerPet } from "./partners-screen"

// S24 Partneri u blizini · /partneri · EP-43 (locale, profile city — the distance reference when the
// browser location is not used, BR-42 / E-22), EP-64 (first read: the profile city, every type) and
// EP-01 (view:pet_summaries_api, active rows by name: the first pet with vet_name = null names the
// vet-suggestion banner, FR-56). The loading state shows while the reads are in flight.

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

function copyFor(locale: Locale): PartnersCopy {
  const dict = getDictionary(locale)
  return { partners: dict.partners, common: dict.common }
}

async function PartnersView({ me, locale }: { me: Me | null; locale: Locale }) {
  const supabase = await createClient()
  const city = me?.city ?? null
  const [pets, partners] = await Promise.all([
    supabase
      .from("pet_summaries_api")
      .select("id, name, sex, species, vet_name")
      .eq("lifecycle", "active")
      .order("name", { ascending: true }),
    city ? listPartnersNearby({ city_id: city.id }) : null,
  ])
  if (pets.error) console.error("[partneri] pet_summaries_api:", pets.error.message)
  if (partners && !partners.ok) console.error("[partneri] partners_nearby:", partners.error.message)

  const noVet = (pets.data ?? []).find((p) => !p.vet_name || p.vet_name.trim() === "")
  const vetPet: VetBannerPet | null = noVet?.id && noVet.name
    ? {
        id: noVet.id,
        name: noVet.name,
        sex: (noVet.sex ?? "unknown") as VetBannerPet["sex"],
        species: noVet.species ? AVATAR_SPECIES[noVet.species as PetSummary["species"]] : undefined,
      }
    : null

  const initialPartners: Partner[] | null = partners === null ? [] : partners.ok ? partners.data : null

  return (
    <PartnersScreen initialPartners={initialPartners} city={city} vetPet={vetPet} locale={locale} copy={copyFor(locale)} />
  )
}

export default async function PartnersPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[partneri] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  return (
    <Suspense fallback={<PartnersLoading copy={copyFor(locale)} />}>
      <PartnersView me={me} locale={locale} />
    </Suspense>
  )
}
