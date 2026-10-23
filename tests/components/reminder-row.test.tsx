import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ReminderRow, defaultReminderRowLabels } from "@/components/app/reminder-row"
import { dictionaries } from "@/lib/i18n"

// ReminderRow (Design §6) with the optional `labels` and `canMarkDone` props (owner decision, Step 17, FR-35).
const row = { id: "o1", title: "Kupi seno", when: "Danas u 17:30", status: "today" as const, channels: ["email" as const] }

describe("ReminderRow", () => {
  it("defaults to the mockup's Serbian copy and shows 'Urađeno'", () => {
    render(<ReminderRow reminder={row} />)
    expect(screen.getByText("Za mene")).toBeInTheDocument()
    expect(screen.getByLabelText("Mejl")).toBeInTheDocument()
    expect(screen.getByText("Danas")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Urađeno" })).toBeInTheDocument()
    expect(defaultReminderRowLabels.forMe).toBe(dictionaries.sr.reminders.forMe)
    expect(defaultReminderRowLabels.done).toBe(dictionaries.sr.reminders.markDone)
  })

  it("takes the dictionary's labels; canMarkDone false hides the button", () => {
    const t = dictionaries.en.reminders
    render(
      <ReminderRow
        reminder={row}
        canMarkDone={false}
        labels={{
          forMe: t.forMe,
          done: t.markDone,
          channels: { email: t.channelEmail, push: t.channelPush, whatsapp: t.channelWhatsapp },
          status: { today: t.statusToday },
        }}
      />,
    )
    expect(screen.getByText("For me")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
