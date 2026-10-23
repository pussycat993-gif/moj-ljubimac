import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AccountDataActions } from "@/app/(app)/profil/podaci/account-data-screen"
import type { DataExport, DataOverview } from "@/lib/actions/data-control"

// S19 Moji podaci (Step 23) from real responses (EP-50 / EP-51 "States"): FR-41 default → "Pripremi arhivu" →
// preparing; preparing and ready (with download_url) from data; a failed export shows the default card plus the
// error line (owner decision). FR-40 #1: the delete AlertDialog (checkbox, heir line) → EP-51 request →
// pending_deletion; pending from EP-43 deletion fields with the export card hidden (owner decision); FR-40 #2
// "Otkaži brisanje" → default. 5xx on EP-50 → error.

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { AccountDataScreen } = await import("@/app/(app)/profil/podaci/account-data-screen")
const { dictionaries } = await import("@/lib/i18n")

const copy = { accountData: dictionaries.sr.accountData, common: dictionaries.sr.common }
const EMAIL = "ivana.petrovic@mojljubimac.test"

const noDeletion = { email: EMAIL, deletion_requested_at: null, deletion_due_at: null, deletion_days_left: null }
const pendingMe = {
  email: EMAIL,
  deletion_requested_at: "2026-10-19T10:00:00.000Z",
  deletion_due_at: "2026-11-18T10:00:00.000Z",
  deletion_days_left: 26,
}

function exportRow(extra: Partial<DataExport> = {}): DataExport {
  return {
    id: "e1000000-0000-4000-8000-000000000001",
    status: "preparing",
    file_name: "moj-ljubimac-podaci-2026-10-19.zip",
    size_bytes: null,
    requested_at: "2026-10-19T08:00:00.000Z",
    ready_at: null,
    expires_at: null,
    download_url: null,
    ...extra,
  }
}

function overview(latest: DataExport | null = null, heir: string | null = "Marko Jovanović"): DataOverview {
  return {
    latest_export: latest,
    summary: { pet_names: ["Luna", "Maks"], attachment_count: 27, moment_count: 12 },
    deletion: { requested_at: null, due_at: null, days_left: null, heir_full_name: heir },
  }
}

const fns = {
  requestDataExport: vi.fn(),
  getMyDataOverview: vi.fn(),
  requestAccountDeletion: vi.fn(),
  cancelAccountDeletion: vi.fn(),
}
const actions: AccountDataActions = {
  requestDataExport: () => fns.requestDataExport(),
  getMyDataOverview: () => fns.getMyDataOverview(),
  requestAccountDeletion: (input) => fns.requestAccountDeletion(input),
  cancelAccountDeletion: () => fns.cancelAccountDeletion(),
}

function renderScreen(me: typeof noDeletion | typeof pendingMe, data: DataOverview | null) {
  return render(<AccountDataScreen me={me as never} overview={data} locale="sr" copy={copy} actions={actions} />)
}

beforeEach(() => {
  Object.values(fns).forEach((f) => f.mockReset())
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"))
})
afterEach(() => vi.useRealTimers())

describe("S19 export (FR-41 request side)", () => {
  it("default → Pripremi arhivu → preparing", async () => {
    const user = userEvent.setup()
    fns.requestDataExport.mockResolvedValue({ ok: true, data: exportRow() })
    renderScreen(noDeletion, overview())
    expect(screen.getByText("Kartoni: Luna, Maks")).toBeInTheDocument()
    expect(screen.getByText("27 priloga")).toBeInTheDocument()
    expect(screen.getByText("12 trenutaka")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Pripremi arhivu" }))
    expect(fns.requestDataExport).toHaveBeenCalledTimes(1)
    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("Pripremamo arhivu…")
    expect(status).toHaveTextContent(`Poslaćemo ti mejl na ${EMAIL} kad bude spremna`)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pripremi arhivu" })).not.toBeInTheDocument()
  })

  it("preparing from data", () => {
    renderScreen(noDeletion, overview(exportRow()))
    expect(screen.getByRole("status")).toHaveTextContent("Pripremamo arhivu…")
  })

  it("ready from data — file, size, link validity and Preuzmi ZIP with download_url", () => {
    renderScreen(
      noDeletion,
      overview(
        exportRow({
          status: "ready",
          size_bytes: 248_000_000,
          ready_at: "2026-10-19T08:05:00.000Z",
          expires_at: "2026-10-26T08:05:00.000Z",
          download_url: {
            kind: "data_export",
            id: "e1000000-0000-4000-8000-000000000001",
            url: "https://r2.test/exports/a.zip?signed=1",
            expires_at: "2026-10-23T10:10:00.000Z",
            mime_type: "application/zip",
          },
        }),
      ),
    )
    expect(screen.getByText("moj-ljubimac-podaci-2026-10-19.zip")).toBeInTheDocument()
    expect(screen.getByText("248 MB · link važi do 26. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Preuzmi ZIP" })).toHaveAttribute("href", "https://r2.test/exports/a.zip?signed=1")
  })

  it("failed → default card with the error line", () => {
    renderScreen(noDeletion, overview(exportRow({ status: "failed" })))
    expect(screen.getByRole("alert")).toHaveTextContent("Priprema arhive nije uspela. Pokušaj ponovo.")
    expect(screen.getByRole("button", { name: "Pripremi arhivu" })).toBeEnabled()
  })

  it("export_in_progress reloads the overview", async () => {
    const user = userEvent.setup()
    fns.requestDataExport.mockResolvedValue({ ok: false, error: { code: "export_in_progress", message: "x" } })
    fns.getMyDataOverview.mockResolvedValue({ ok: true, data: overview(exportRow()) })
    renderScreen(noDeletion, overview())
    await user.click(screen.getByRole("button", { name: "Pripremi arhivu" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Pripremamo arhivu…")
  })

  it("5xx on EP-50 → error", () => {
    renderScreen(noDeletion, null)
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.queryByRole("button", { name: "Obriši nalog" })).not.toBeInTheDocument()
  })
})

describe("S19 account deletion (FR-40)", () => {
  it("FR-40 #1: AlertDialog with heir line, confirm checkbox → EP-51 request → pending_deletion", async () => {
    const user = userEvent.setup()
    fns.requestAccountDeletion.mockResolvedValue({
      ok: true,
      data: { ...noDeletion, deletion_requested_at: "2026-10-23T10:00:00.000Z", deletion_due_at: "2026-11-22T10:00:00.000Z", deletion_days_left: 30 },
    })
    renderScreen(noDeletion, overview())

    await user.click(screen.getByRole("button", { name: "Obriši nalog" }))
    const dialog = screen.getByRole("alertdialog", { name: "Obrisati nalog?" })
    expect(within(dialog).getByText(/trajno se briše 22\. 11\. 2026\. — sa svim kartonima ljubimaca \(Luna, Maks\)/)).toBeInTheDocument()
    expect(
      within(dialog).getByText("Domaćinstvo ostaje: deljeni ljubimci prelaze na člana koji se prvi pridružio — Marko Jovanović."),
    ).toBeInTheDocument()
    const confirm = within(dialog).getByRole("button", { name: "Da, obriši" })
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole("checkbox", { name: "Razumem da se posle 30 dana podaci ne mogu vratiti." }))
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(fns.requestAccountDeletion).toHaveBeenCalledWith({ confirm: true })

    const pending = await screen.findByRole("status")
    expect(within(pending).getByRole("heading", { name: "Nalog će biti obrisan 22. 11. 2026." })).toBeInTheDocument()
    expect(within(pending).getByText("Još 30 dana da se predomisliš")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Preuzmi sve moje podatke" })).not.toBeInTheDocument()
  })

  it("no heir → the heir line is omitted", async () => {
    const user = userEvent.setup()
    renderScreen(noDeletion, overview(null, null))
    await user.click(screen.getByRole("button", { name: "Obriši nalog" }))
    expect(screen.queryByText(/Domaćinstvo ostaje/)).not.toBeInTheDocument()
  })

  it("pending_deletion from EP-43 (export card hidden); FR-40 #2 Otkaži brisanje → default", async () => {
    const user = userEvent.setup()
    fns.cancelAccountDeletion.mockResolvedValue({ ok: true, data: noDeletion })
    fns.getMyDataOverview.mockResolvedValue({ ok: true, data: overview() })
    // While pending EP-50 answers 403 account_pending_deletion → overview null.
    renderScreen(pendingMe, null)

    const pending = screen.getByRole("status")
    expect(within(pending).getByRole("heading", { name: "Nalog će biti obrisan 18. 11. 2026." })).toBeInTheDocument()
    expect(within(pending).getByText(/^Zahtev je poslat 19\. 10\. 2026\. Nalog je deaktiviran/)).toBeInTheDocument()
    expect(within(pending).getByText("Još 26 dana da se predomisliš")).toBeInTheDocument()
    expect(within(pending).getByText("26 / 30")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Preuzmi sve moje podatke" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Obriši nalog" })).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    await user.click(within(pending).getByRole("button", { name: "Otkaži brisanje" }))
    expect(fns.cancelAccountDeletion).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole("heading", { name: "Preuzmi sve moje podatke" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Obriši nalog" })).toBeInTheDocument()
    expect(screen.queryByText(/Nalog će biti obrisan/)).not.toBeInTheDocument()
  })
})
