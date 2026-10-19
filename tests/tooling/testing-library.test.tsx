import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Testing Library (ADR-15)", () => {
  it("renders an element in the DOM environment", () => {
    render(<p>Moj Ljubimac</p>);

    expect(screen.getByText("Moj Ljubimac")).toBeInTheDocument();
  });
});
