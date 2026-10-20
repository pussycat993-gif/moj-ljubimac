import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge, type Status } from "@/components/app/status-badge";

// Design §8 status badges; Design §10: status is never colour-only.
const CASES: [Status, string, string][] = [
  ["done", "Urađeno", "bg-success-soft"],
  ["soon", "Uskoro", "bg-warning-soft"],
  ["missed", "Propušteno", "bg-destructive-soft"],
  ["today", "Danas", "bg-primary"],
  ["premium", "Premium", "border-primary"],
];

describe("StatusBadge", () => {
  it.each(CASES)("%s renders the visible label %s", (status, label, fill) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toBeVisible();
    expect(badge).not.toHaveClass("sr-only");
    expect(badge).toHaveClass(fill);
  });

  it.each(["done", "soon", "missed"] as Status[])("%s pastel pill uses foreground text", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.firstElementChild).toHaveClass("text-foreground");
  });

  it("a custom label replaces the default text", () => {
    render(<StatusBadge status="soon" label="Ističe za 3 dana" />);
    expect(screen.getByText("Ističe za 3 dana")).toBeVisible();
  });
});
