import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReminderTypeIcon, reminderTypeLabel, type ReminderType } from "@/components/app/reminder-type-icon";
import { dictionaries } from "@/lib/i18n";

// Design §6 ReminderTypeIcon mapping; `message` (the S12 Poruke row) since Step 28c.
const CASES: [ReminderType, string][] = [
  ["treatment_dose", "lucide-droplet"],
  ["vaccination", "lucide-syringe"],
  ["vet_follow_up", "lucide-stethoscope"],
  ["meal", "lucide-utensils-crossed"],
  ["birthday", "lucide-cake"],
  ["manual", "lucide-bell"],
  ["message", "lucide-message-circle"],
];

describe("ReminderTypeIcon", () => {
  it.each(CASES)("%s renders %s with an accessible label", (type, iconClass) => {
    const { container } = render(<ReminderTypeIcon type={type} sex="female" />);
    expect(container.querySelector("svg")).toHaveClass(iconClass);
    expect(screen.getByText(reminderTypeLabel[type])).toHaveClass("sr-only");
  });

  it("message is labelled Poruke (the S12 card title; Messages in English)", () => {
    expect(reminderTypeLabel.message).toBe("Poruke");
    expect(dictionaries.sr.reminderSettings.typeMessage).toBe("Poruke");
    expect(dictionaries.en.reminderSettings.typeMessage).toBe("Messages");
  });

  it("defaults to the manual Bell icon", () => {
    const { container } = render(<ReminderTypeIcon />);
    expect(container.querySelector("svg")).toHaveClass("lucide-bell");
  });

  it("pet reminders use the pet accent; 'Za mene' reminders a neutral tile", () => {
    const pet = render(<ReminderTypeIcon type="meal" sex="male" />).container.firstElementChild;
    expect(pet).toHaveAttribute("data-pet-sex", "male");
    expect(pet).toHaveClass("bg-pet-accent-soft", "text-pet-accent");

    const forMe = render(<ReminderTypeIcon type="manual" forMe />).container.firstElementChild;
    expect(forMe).not.toHaveAttribute("data-pet-sex");
    expect(forMe).toHaveClass("bg-foreground/5");
  });
});
