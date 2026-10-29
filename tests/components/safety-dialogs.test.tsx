import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  BlockDialog,
  ReportDialog,
  defaultReportDialogLabels,
  reportReasonLabel,
} from "@/components/app/safety-dialogs"
import { dictionaries } from "@/lib/i18n"
import { reportDialogLabels } from "@/app/(sapa)/poruke/messages-client"

// Design §6 ReportDialog / BlockDialog (Step 28c, safety-dialogs.tsx; FR-70): reasons Spam ili reklama / Prevara /
// Neprimeren sadržaj / Dobrobit životinja / Drugo; the note is required for Drugo and limited to 500; submit goes
// through onSubmit (EP-84) → the sent confirmation (FR-70 #1) or "Već si prijavio/la …" (FR-70 #2); BlockDialog
// confirms with the destructive "Da, blokiraj".

describe("ReportDialog", () => {
  it("lists the five reasons", () => {
    render(<ReportDialog open onOpenChange={() => {}} target="listing" name="Prodajem krevet za psa" />)
    expect(screen.getByRole("heading", { name: "Prijavi oglas" })).toBeInTheDocument()
    expect(screen.getByText("Oglas: Prodajem krevet za psa")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((r) => r.id)).toEqual([
      "report-spam",
      "report-scam",
      "report-inappropriate",
      "report-animal_welfare",
      "report-other",
    ])
    for (const label of Object.values(reportReasonLabel)) expect(screen.getByLabelText(label)).toBeInTheDocument()
  })

  it("requires a reason, and a note for Drugo", async () => {
    const onSubmit = vi.fn()
    render(<ReportDialog open onOpenChange={() => {}} target="user" name="Marko J." onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Izaberi razlog prijave.")

    await userEvent.click(screen.getByLabelText("Drugo"))
    expect(screen.getByText("Napomena *")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Napiši ukratko šta nije u redu.")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("limits the note to 500 characters with a counter", async () => {
    render(<ReportDialog open onOpenChange={() => {}} target="user" name="Marko J." />)
    const note = screen.getByLabelText("Napomena (opciono)")
    expect(note).toHaveAttribute("maxLength", "500")
    await userEvent.type(note, "Traži novac")
    expect(screen.getByText("11 / 500")).toBeInTheDocument()
  })

  it("FR-70 #1: submits the reason and note, then confirms", async () => {
    const onSubmit = vi.fn(async () => ({ status: "sent" as const }))
    render(<ReportDialog open onOpenChange={() => {}} target="listing" name="Krevet" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByLabelText("Prevara"))
    await userEvent.type(screen.getByLabelText("Napomena (opciono)"), "  Traži uplatu unapred. ")
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(onSubmit).toHaveBeenCalledWith({ reason: "scam", note: "Traži uplatu unapred." })
    expect(await screen.findByRole("heading", { name: "Prijava je poslata" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Ako ti ova osoba piše i dalje, možeš i da je blokiraš.")
  })

  it("FR-70 #2: an open earlier report shows as already submitted", async () => {
    const onSubmit = vi.fn(async () => ({ status: "already_submitted" as const }))
    const { rerender } = render(
      <ReportDialog open onOpenChange={() => {}} target="listing" name="Krevet" onSubmit={onSubmit} />,
    )
    await userEvent.click(screen.getByLabelText("Spam ili reklama"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Već si prijavio/la ovaj oglas.")

    rerender(<ReportDialog open={false} onOpenChange={() => {}} target="listing" name="Krevet" onSubmit={onSubmit} />)
    render(<ReportDialog open onOpenChange={() => {}} target="user" name="Marko J." onSubmit={onSubmit} />)
    await userEvent.click(screen.getByLabelText("Spam ili reklama"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Već si prijavio/la ovog korisnika.")
  })

  it("shows the error message onSubmit returns", async () => {
    const onSubmit = vi.fn(async () => ({ status: "error" as const, message: "Nešto nije u redu. Pokušaj ponovo." }))
    render(<ReportDialog open onOpenChange={() => {}} target="user" name="Marko J." onSubmit={onSubmit} />)
    await userEvent.click(screen.getByLabelText("Prevara"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("defaults equal the Serbian dictionary, and English labels come from en.ts", () => {
    expect(reportDialogLabels(dictionaries.sr.sapa.common)).toEqual(defaultReportDialogLabels)
    render(
      <ReportDialog
        open
        onOpenChange={() => {}}
        target="user"
        name="Marko J."
        labels={reportDialogLabels(dictionaries.en.sapa.common)}
      />,
    )
    expect(screen.getByRole("heading", { name: "Report user" })).toBeInTheDocument()
    expect(screen.getByLabelText("Animal welfare")).toBeInTheDocument()
  })
})

describe("BlockDialog", () => {
  it("confirms with the destructive Da, blokiraj", async () => {
    const onConfirm = vi.fn()
    render(<BlockDialog open onOpenChange={() => {}} name="Marko J." onConfirm={onConfirm} />)
    expect(screen.getByRole("alertdialog", { name: "Blokirati korisnika Marko J.?" })).toBeInTheDocument()
    expect(screen.getByText(/Ne dobija obaveštenje o blokadi/)).toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: "Da, blokiraj" })
    expect(confirm.className).toMatch(/destructive/)
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it("Otkaži does not block", async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(<BlockDialog open onOpenChange={onOpenChange} name="Marko J." onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole("button", { name: "Otkaži" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
