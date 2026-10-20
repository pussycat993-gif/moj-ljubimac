import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadOnlyBanner } from "@/components/app/read-only-banner";

describe("ReadOnlyBanner (Design §8)", () => {
  it("renders the Eye icon and the given reason as a status", () => {
    const reason = "Ovaj karton deli sa tobom Marko. Možeš da ga pregledaš, ali ne i da menjaš.";
    render(<ReadOnlyBanner reason={reason} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(reason);
    const icon = banner.querySelector("svg.lucide-eye");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden");
  });
});
