import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar";

// jsdom never loads images, so Radix Avatar would stay on the fallback. Report every image as loaded.
const proto = HTMLImageElement.prototype;
const original = {
  complete: Object.getOwnPropertyDescriptor(proto, "complete"),
  naturalWidth: Object.getOwnPropertyDescriptor(proto, "naturalWidth"),
};

beforeAll(() => {
  Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 100 });
});

afterAll(() => {
  if (original.complete) Object.defineProperty(proto, "complete", original.complete);
  if (original.naturalWidth) Object.defineProperty(proto, "naturalWidth", original.naturalWidth);
});

const SPECIES: [PetSpecies, string][] = [
  ["cat", "lucide-cat"],
  ["dog", "lucide-dog"],
  ["rabbit", "lucide-rabbit"],
  ["bird", "lucide-bird"],
  ["fish", "lucide-fish"],
  ["turtle", "lucide-turtle"],
];

describe("PetAvatar (Design §7)", () => {
  it("renders the photo with the pet name as alt", () => {
    render(<PetAvatar name="Maza" sex="female" species="cat" photoUrl="/maza.jpg" />);
    const img = screen.getByRole("img", { name: "Maza" });
    expect(img).toHaveAttribute("src", "/maza.jpg");
  });

  it.each(SPECIES)("without a photo, species %s renders its icon", (species, iconClass) => {
    const { container } = render(<PetAvatar name="Rex" species={species} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass(iconClass);
    expect(svg).toHaveAttribute("aria-hidden");
    expect(screen.getByText("Rex")).toHaveClass("sr-only");
    expect(screen.queryByText("R")).not.toBeInTheDocument();
  });

  it("other species renders the first initial", () => {
    const { container } = render(<PetAvatar name="žaba" species="other" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Ž")).toBeInTheDocument();
  });

  it("no species renders the first initial", () => {
    const { container } = render(<PetAvatar name="Bubi" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("wraps itself in data-pet-sex so the accent resolves", () => {
    const { container } = render(<PetAvatar name="Lord" sex="male" species="dog" />);
    expect(container.firstElementChild).toHaveAttribute("data-pet-sex", "male");
  });

  it("onSoft puts the fallback on a white circle", () => {
    render(<PetAvatar name="Bubi" onSoft />);
    expect(screen.getByText("B")).toHaveClass("bg-card");
    expect(screen.getByText("B")).not.toHaveClass("bg-pet-accent-soft");
  });
});
