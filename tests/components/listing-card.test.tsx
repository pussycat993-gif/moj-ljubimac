import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ListingCard, defaultListingCardLabels, type ListingSummary } from "@/components/app/listing-card"
import { ListingTypeTag, type ListingType } from "@/components/app/listing-type-tag"

// Composites (Step 28b): ListingCard shows "2.500 RSD" / "Po dogovoru" / "Besplatno" and links to S33
// (/sapa-pomoci/<id>); ListingTypeTag carries an icon and a label for every type (never colour-only); the optional
// labels replace the Serbian defaults (FR-35).

function listing(extra: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: "l3",
    type: "selling",
    title: "Prodajem transporter za psa",
    city: "Novi Sad",
    category: "carriers",
    species: "dog",
    priceRsd: 2500,
    author: "Marko J.",
    publishedOn: "18. 10. 2026.",
    photoCount: 4,
    ...extra,
  }
}

describe("ListingCard", () => {
  it("selling with a price shows 2.500 RSD and links to S33", () => {
    render(<ListingCard listing={listing()} />)
    expect(screen.getByText("2.500 RSD")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Prodajem transporter za psa" })).toHaveAttribute("href", "/sapa-pomoci/l3")
    expect(screen.getByText("Novi Sad · Transporteri · Psi")).toBeInTheDocument()
    expect(screen.getByText("Marko J. · 18. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByText("4 fotografije")).toBeInTheDocument()
  })

  it("selling negotiable shows Po dogovoru", () => {
    render(<ListingCard listing={listing({ id: "l6", priceRsd: undefined, negotiable: true })} />)
    expect(screen.getByText("Po dogovoru")).toBeInTheDocument()
    expect(screen.queryByText(/RSD/)).not.toBeInTheDocument()
  })

  it("giving shows Besplatno; need and seeking show no price line", () => {
    const { unmount } = render(<ListingCard listing={listing({ id: "l2", type: "giving", priceRsd: undefined })} />)
    expect(screen.getByText("Besplatno")).toBeInTheDocument()
    unmount()

    render(<ListingCard listing={listing({ id: "l1", type: "need", priceRsd: undefined })} />)
    expect(screen.queryByText("Besplatno")).not.toBeInTheDocument()
    expect(screen.queryByText("Po dogovoru")).not.toBeInTheDocument()
  })

  it("shows the cover photo when coverUrl is given, the placeholder otherwise", () => {
    const { container, unmount } = render(<ListingCard listing={listing()} coverUrl="https://r2.example/cover.jpg" />)
    expect(container.querySelector("img")).toHaveAttribute("src", "https://r2.example/cover.jpg")
    unmount()
    const second = render(<ListingCard listing={listing()} />)
    expect(second.container.querySelector("img")).toBeNull()
  })

  it("custom labels override the Serbian defaults", () => {
    render(
      <ListingCard
        listing={listing()}
        labels={{
          ...defaultListingCardLabels,
          formatPrice: (n) => `${n.toLocaleString("en-GB")} RSD`,
          photos: (n) => `${n} photos`,
          type: { need: "Need", giving: "Giving away", selling: "Selling", seeking: "Looking for" },
          category: { ...defaultListingCardLabels.category, carriers: "Carriers" },
          species: { ...defaultListingCardLabels.species, dog: "Dogs" },
        }}
      />,
    )
    expect(screen.getByText("2,500 RSD")).toBeInTheDocument()
    expect(screen.getByText("4 photos")).toBeInTheDocument()
    expect(screen.getByText("Selling")).toBeInTheDocument()
    expect(screen.getByText("Novi Sad · Carriers · Dogs")).toBeInTheDocument()
  })
})

describe("ListingTypeTag", () => {
  it.each<[ListingType, string]>([
    ["need", "Potreba"],
    ["giving", "Poklanjam"],
    ["selling", "Prodajem"],
    ["seeking", "Tražim"],
  ])("%s renders an icon and the label %s", (type, label) => {
    const { container } = render(<ListingTypeTag type={type} />)
    const tag = screen.getByText(label)
    expect(tag).toBeInTheDocument()
    const icon = container.querySelector("svg")
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute("aria-hidden")
  })

  it("a custom label replaces the Serbian one", () => {
    render(<ListingTypeTag type="seeking" label="Looking for" />)
    expect(screen.getByText("Looking for")).toBeInTheDocument()
    expect(screen.queryByText("Tražim")).not.toBeInTheDocument()
  })
})
