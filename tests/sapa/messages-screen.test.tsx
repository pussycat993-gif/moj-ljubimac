import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ConversationSummary, ConversationThread, Message } from "@/lib/actions/messages"
import type { MessagesActions } from "@/app/(sapa)/poruke/messages-client"

// S36 Poruke (Step 28c; FR-68 #5–#7, FR-70 #3–#5, NFR-11): the inbox from EP-80 (latest first, listing title,
// display name, last message, unread pill), the thread from EP-81 oldest → newest followed by EP-83 (the row's unread
// pill disappears; router.refresh() re-reads the shell badge), the composer through EP-82 with its inline errors
// (empty, user_blocked, rate_limited) and counter, the blocked (B) and suspended (S) states, empty and error states,
// and no live connection anywhere (source scan) — a new message appears after a reload.

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))
const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { MessagesClient } = await import("@/app/(sapa)/poruke/messages-client")
const { dictionaries } = await import("@/lib/i18n")

const IVANA = "a1000000-0000-4000-8000-000000000001"
const MARKO = "a1000000-0000-4000-8000-000000000002"
const C1 = "c1000000-0000-4000-8000-000000000001"
const C2 = "c1000000-0000-4000-8000-000000000002"

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

function summary(extra: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: C1,
    listing: { id: "l3", title: "Prodajem transporter za psa", type: "selling", active: true, deleted: false },
    i_am_author: false,
    other: { user_id: MARKO, kind: "user", display_name: "Marko J.", initials: "MJ", organisation_slug: null },
    last_message: { preview: "Pošalji mi samo poruku kad kreneš.", from_me: false },
    last_message_at: hoursAgo(0),
    unread_count: 2,
    i_blocked_other: false,
    ...extra,
  }
}

const shelterRow = summary({
  id: C2,
  listing: { id: "l1", title: "Potrebno 20 kg granula za odrasle pse", type: "need", active: true, deleted: false },
  other: { user_id: "a1000000-0000-4000-8000-000000000007", kind: "shelter", display_name: "Azil „Druga šansa“", initials: "AD", organisation_slug: "azil-druga-sansa" },
  last_message: { preview: "Jeste, slobodna je. Kad ti odgovara?", from_me: true },
  last_message_at: hoursAgo(50),
  unread_count: 0,
  i_am_author: true,
})

function message(id: string, body: string, fromMe: boolean, at: string, read = false): Message {
  return { id, conversation_id: C1, sender_id: fromMe ? IVANA : MARKO, from_me: fromMe, body, created_at: at, read_at: read ? at : null }
}

function thread(extra: Partial<ConversationThread["conversation"]> = {}, messages?: Message[]): ConversationThread {
  const list = messages ?? [
    message("m1", "Zdravo! Da li je transporter još dostupan?", true, hoursAgo(2), true),
    message("m2", "Zdravo, jeste.", false, hoursAgo(1)),
  ]
  return { conversation: { ...summary(), can_send: true, message_total: list.length, ...extra }, messages: list, total: list.length }
}

const fns = {
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessage: vi.fn(),
  submitReport: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}
const actions = fns as unknown as MessagesActions

const copy = (locale: "sr" | "en" = "sr") => ({
  conversations: dictionaries[locale].sapa.conversations,
  sapa: dictionaries[locale].sapa.common,
  common: dictionaries[locale].common,
})

function renderScreen(props: { id?: string | null; suspended?: boolean; locale?: "sr" | "en" } = {}) {
  return render(
    <MessagesClient
      conversationId={props.id === undefined ? C1 : props.id}
      locale={props.locale ?? "sr"}
      suspended={props.suspended ?? false}
      copy={copy(props.locale)}
      actions={actions}
    />,
  )
}

const inbox = () => screen.getByRole("region", { name: "Razgovori" })
const threadPane = () => screen.getByRole("region", { name: "Razgovor" })

beforeEach(() => {
  vi.resetAllMocks()
  fns.listConversations.mockResolvedValue({ ok: true, data: { items: [summary(), shelterRow], total: 2, unread_conversations: 1 } })
  fns.getConversation.mockResolvedValue({ ok: true, data: thread() })
  fns.markConversationRead.mockResolvedValue({ ok: true, data: { conversation_id: C1, marked: 2, unread_conversations: 0 } })
  window.history.pushState(null, "", "/poruke")
})

describe("FR-68 #5 — inbox", () => {
  it("lists conversations latest first with listing title, name, last message and unread count", async () => {
    renderScreen({ id: null })
    const rows = await within(inbox()).findAllByRole("button")
    expect(fns.listConversations).toHaveBeenCalledWith({ limit: 50, offset: 0 })
    expect(rows[0]).toHaveTextContent("Marko J.")
    expect(rows[0]).toHaveTextContent("Prodajem transporter za psa")
    expect(rows[0]).toHaveTextContent("Pošalji mi samo poruku kad kreneš.")
    expect(within(rows[0]).getByText("2")).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent("Azil „Druga šansa“")
    expect(rows[1]).toHaveTextContent("Tvoj oglas: Potrebno 20 kg granula za odrasle pse")
    expect(rows[1]).toHaveTextContent("Ti: Jeste, slobodna je. Kad ti odgovara?")
    expect(rows[1]).toHaveTextContent(/\d{1,2}\. \d{1,2}\./)
  })

  it("empty → Još nema poruka + Pogledaj oglase", async () => {
    fns.listConversations.mockResolvedValue({ ok: true, data: { items: [], total: 0, unread_conversations: 0 } })
    renderScreen({ id: null })
    expect(await screen.findByText("Još nema poruka")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pogledaj oglase" })).toHaveAttribute("href", "/sapa-pomoci")
  })

  it("error → retry", async () => {
    fns.listConversations.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    renderScreen({ id: null })
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(await within(inbox()).findByText("Marko J.")).toBeInTheDocument()
  })
})

describe("FR-68 #6 — thread", () => {
  it("shows the messages oldest → newest, then marks the conversation read", async () => {
    renderScreen()
    const list = await within(threadPane()).findByRole("list", { name: "Poruke u razgovoru" })
    const bodies = within(list).getAllByText(/Zdravo/).map((p) => p.textContent)
    expect(bodies).toEqual(["Zdravo! Da li je transporter još dostupan?", "Zdravo, jeste."])
    expect(within(list).getByText("Ti:")).toHaveClass("sr-only")
    expect(within(list).getByText(/· Pročitano/)).toBeInTheDocument()
    await waitFor(() => expect(fns.markConversationRead).toHaveBeenCalledWith(C1))
    await waitFor(() => expect(within(inbox()).getAllByRole("button")[0]).not.toHaveTextContent(/2 nepročitane/))
    expect(router.refresh).toHaveBeenCalled()
  })

  it("opening another row loads that thread and updates the address", async () => {
    renderScreen()
    await within(threadPane()).findByRole("list", { name: "Poruke u razgovoru" })
    fns.getConversation.mockResolvedValue({ ok: true, data: { ...thread({ ...shelterRow }), messages: [] } })
    await userEvent.click(within(inbox()).getByText("Azil „Druga šansa“"))
    await waitFor(() => expect(fns.getConversation).toHaveBeenLastCalledWith({ conversation_id: C2, limit: 50, offset: 0 }))
    expect(window.location.pathname).toBe(`/poruke/${C2}`)
    expect(await within(threadPane()).findByRole("link", { name: "Azil „Druga šansa“" })).toHaveAttribute("href", "/o/azil-druga-sansa")
  })

  it("Učitaj starije loads the previous page", async () => {
    const newest = [message("m3", "Treća", false, hoursAgo(1))]
    fns.getConversation.mockResolvedValueOnce({ ok: true, data: { ...thread({}, newest), total: 3 } })
    renderScreen()
    const older = await screen.findByRole("button", { name: "Učitaj starije" })
    fns.getConversation.mockResolvedValueOnce({
      ok: true,
      data: { ...thread({}, [message("m1", "Prva", true, hoursAgo(3)), message("m2", "Druga", false, hoursAgo(2))]), total: 3 },
    })
    await userEvent.click(older)
    expect(fns.getConversation).toHaveBeenLastCalledWith({ conversation_id: C1, limit: 50, offset: 1 })
    const list = screen.getByRole("list", { name: "Poruke u razgovoru" })
    expect(within(list).getAllByText(/^(Prva|Druga|Treća)$/).map((p) => p.textContent)).toEqual(["Prva", "Druga", "Treća"])
    expect(screen.queryByRole("button", { name: "Učitaj starije" })).not.toBeInTheDocument()
  })

  it("a deleted listing shows 'oglas obrisan'; an inactive one the suffix", async () => {
    fns.getConversation.mockResolvedValue({
      ok: true,
      data: thread({ listing: { id: null, title: null, type: null, active: false, deleted: true } }),
    })
    renderScreen()
    expect(await within(threadPane()).findByText("oglas obrisan")).toBeInTheDocument()
  })
})

describe("FR-68 #7 — composer", () => {
  it("an empty message cannot be sent", async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku" }))
    expect(screen.getByText("Napiši poruku pre slanja.")).toBeInTheDocument()
    expect(fns.sendMessage).not.toHaveBeenCalled()
  })

  it("text only, at most 2,000 characters, with the counter", async () => {
    renderScreen()
    const box = await screen.findByLabelText("Nova poruka")
    expect(box).toHaveAttribute("maxLength", "2000")
    await userEvent.type(box, "Super")
    expect(screen.getByText("Samo tekst · 5 / 2000")).toBeInTheDocument()
  })

  it("sends through EP-82 with the conversation id and an idempotency key; the message appears at the bottom", async () => {
    fns.sendMessage.mockImplementation(async (input: { body: string }) => ({
      ok: true,
      data: {
        conversation: summary({ last_message: { preview: input.body, from_me: true }, unread_count: 0 }),
        message: message("m9", input.body, true, new Date().toISOString()),
        created_conversation: false,
      },
    }))
    renderScreen()
    await userEvent.type(await screen.findByLabelText("Nova poruka"), "Kada mogu da ga pogledam?")
    await userEvent.click(screen.getByRole("button", { name: "Pošalji poruku" }))
    const call = fns.sendMessage.mock.calls[0][0]
    expect(call).toMatchObject({ conversation_id: C1, body: "Kada mogu da ga pogledam?" })
    expect(call.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
    const list = screen.getByRole("list", { name: "Poruke u razgovoru" })
    const items = within(list).getAllByRole("listitem")
    expect(items[items.length - 1]).toHaveTextContent("Kada mogu da ga pogledam?")
    expect(screen.getByLabelText("Nova poruka")).toHaveValue("")
  })

  it("FR-70 #4: user_blocked → inline error under the composer", async () => {
    fns.sendMessage.mockResolvedValue({ ok: false, error: { code: "user_blocked", message: "user_blocked" } })
    renderScreen()
    await userEvent.type(await screen.findByLabelText("Nova poruka"), "Zdravo")
    await userEvent.click(screen.getByRole("button", { name: "Pošalji poruku" }))
    expect(await screen.findByText("Ovoj osobi trenutno ne možeš da pišeš.")).toBeInTheDocument()
  })

  it("rate_limited → inline error with the minutes", async () => {
    fns.sendMessage.mockResolvedValue({
      ok: false,
      error: { code: "rate_limited", message: "x", details: { retry_after_s: 1500 } },
    })
    renderScreen()
    await userEvent.type(await screen.findByLabelText("Nova poruka"), "Zdravo")
    await userEvent.click(screen.getByRole("button", { name: "Pošalji poruku" }))
    expect(await screen.findByText("Poslao/la si mnogo poruka za kratko vreme. Pokušaj ponovo za 25 min.")).toBeInTheDocument()
  })
})

describe("FR-70 — block, unblock and report in the thread", () => {
  it("#3: Blokiraj → BlockDialog → block_user; the thread shows the blocked state", async () => {
    fns.blockUser.mockResolvedValue({ ok: true, data: { blocker_id: IVANA, blocked_id: MARKO, created_at: "" } })
    renderScreen()
    await within(threadPane()).findByRole("list", { name: "Poruke u razgovoru" })
    fns.getConversation.mockResolvedValue({ ok: true, data: thread({ i_blocked_other: true, can_send: false }) })
    fns.listConversations.mockResolvedValue({
      ok: true,
      data: { items: [summary({ i_blocked_other: true }), shelterRow], total: 2, unread_conversations: 0 },
    })
    await userEvent.click(screen.getByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Blokiraj" }))
    await userEvent.click(screen.getByRole("button", { name: "Da, blokiraj" }))
    expect(fns.blockUser).toHaveBeenCalledWith(MARKO)
    expect(await screen.findByText(/Blokirao\/la si korisnika Marko J\./)).toBeInTheDocument()
    expect(screen.queryByLabelText("Nova poruka")).not.toBeInTheDocument()
    expect(await within(inbox()).findByText("Blokiran korisnik")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Korisnik Marko J. je blokiran.")
  })

  it("#5: Odblokiraj → unblock_user; the composer returns", async () => {
    fns.getConversation.mockResolvedValue({ ok: true, data: thread({ i_blocked_other: true, can_send: false }) })
    fns.unblockUser.mockResolvedValue({ ok: true, data: null })
    renderScreen()
    const unblock = await screen.findByRole("button", { name: "Odblokiraj" })
    fns.getConversation.mockResolvedValue({ ok: true, data: thread() })
    await userEvent.click(unblock)
    expect(fns.unblockUser).toHaveBeenCalledWith(MARKO)
    expect(await screen.findByLabelText("Nova poruka")).toBeInTheDocument()
  })

  it("no Blokiraj for a shelter; Prijavi korisnika reports the other party", async () => {
    fns.getConversation.mockResolvedValue({ ok: true, data: thread({ ...shelterRow }) })
    fns.submitReport.mockResolvedValue({ ok: true, data: { already_submitted: false, report: {} } })
    renderScreen({ id: C2 })
    await within(threadPane()).findByRole("list", { name: "Poruke u razgovoru" })
    await userEvent.click(screen.getByRole("button", { name: "Više radnji" }))
    expect(screen.queryByRole("menuitem", { name: "Blokiraj" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "Prijavi korisnika" }))
    await userEvent.click(screen.getByLabelText("Spam ili reklama"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(fns.submitReport).toHaveBeenCalledWith({ user_id: shelterRow.other.user_id, reason: "spam", note: null })
    expect(await screen.findByRole("heading", { name: "Prijava je poslata" })).toBeInTheDocument()
  })
})

describe("states", () => {
  it("suspended (S): banner, old messages readable, composer replaced by a note", async () => {
    renderScreen({ suspended: true })
    expect(screen.getByRole("status")).toHaveTextContent("Tvoj nalog je isključen iz Šape pomoći.")
    expect(await screen.findByText("Slanje poruka je isključeno dok si isključen/a iz Šape pomoći.")).toBeInTheDocument()
    expect(screen.getByText("Zdravo, jeste.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Nova poruka")).not.toBeInTheDocument()
  })

  it("a thread that is not the caller's (404) → error state", async () => {
    fns.getConversation.mockResolvedValue({ ok: false, error: { code: "not_found", message: "not_found" } })
    renderScreen()
    expect(await within(threadPane()).findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("phones: the thread has a back button to the inbox", async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Nazad na razgovore" }))
    expect(window.location.pathname).toBe("/poruke")
    expect(inbox()).not.toHaveClass("hidden")
  })
})

describe("NFR-11 — no live connection", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : [path]
    })
  }

  it("no WebSocket, EventSource, Supabase Realtime channel or polling interval in /poruke and the shells", () => {
    const sources = [
      ...files(join(process.cwd(), "app/(sapa)/poruke")),
      join(process.cwd(), "components/app/shells.tsx"),
      join(process.cwd(), "components/app/signed-in-shell.tsx"),
      join(process.cwd(), "app/(sapa)/layout.tsx"),
      join(process.cwd(), "app/(app)/layout.tsx"),
      join(process.cwd(), "app/(org)/layout.tsx"),
    ]
    for (const file of sources) {
      // Code only: comments may name what is not used.
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
      expect(code, file).not.toMatch(/WebSocket|EventSource|\.channel\(|realtime|setInterval|postgres_changes/i)
    }
  })

  it("a message sent by the other party appears after a reload", async () => {
    const { unmount } = renderScreen()
    await within(threadPane()).findByRole("list", { name: "Poruke u razgovoru" })
    expect(screen.queryByText("Može sutra posle 17:00.")).not.toBeInTheDocument()
    unmount()

    fns.getConversation.mockResolvedValue({
      ok: true,
      data: thread({}, [...thread().messages, message("m3", "Može sutra posle 17:00.", false, new Date().toISOString())]),
    })
    renderScreen()
    expect(await screen.findByText("Može sutra posle 17:00.")).toBeInTheDocument()
  })
})
