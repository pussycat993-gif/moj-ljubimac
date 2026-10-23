import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PetHeader, defaultPetHeaderLabels } from "@/components/app/pet-header"
import { dictionaries } from "@/lib/i18n"

// PetHeader (Design §6) with the optional `labels` prop (owner decision, Step 14, FR-35).
describe("PetHeader", () => {
  it("defaults to the mockup's Serbian chip-list label", () => {
    render(<PetHeader name="Luna" sex="female" species="cat" subtitle="Britanska kratkodlaka · 3 godine" chips={["Ženka"]} />)
    expect(screen.getByRole("heading", { level: 1, name: "Luna" })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Osnovni podaci" })).toHaveTextContent("Ženka")
    expect(defaultPetHeaderLabels.chips).toBe(dictionaries.sr.petRecord.basics)
  })

  it("takes the dictionary's chip-list label", () => {
    render(
      <PetHeader
        name="Maks"
        sex="male"
        subtitle="Golden Retriever · 5 years"
        chips={["Male", "Neutered"]}
        labels={{ chips: dictionaries.en.petRecord.basics }}
      />,
    )
    expect(screen.getByRole("list", { name: "Basic details" })).toHaveTextContent("MaleNeutered")
  })
})
