import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumLock } from "@/components/app/premium-lock";

describe("PremiumLock (Design §8)", () => {
  it("renders the Lock icon, the title and the trial call to action", () => {
    const { container } = render(<PremiumLock description="Dodaj neograničen broj ljubimaca." />);
    expect(container.querySelector("svg.lucide-lock")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument();
    expect(screen.getByText("Dodaj neograničen broj ljubimaca.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument();
  });

  it("shows locked content blurred and hidden from assistive tech", () => {
    render(
      <PremiumLock description="PDF izvoz kartona.">
        <p>Zaključan sadržaj</p>
      </PremiumLock>,
    );
    const wrapper = screen.getByText("Zaključan sadržaj").parentElement;
    expect(wrapper).toHaveClass("blur-sm", "select-none", "pointer-events-none");
    expect(wrapper).toHaveAttribute("aria-hidden");
    expect(screen.getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument();
  });
});
