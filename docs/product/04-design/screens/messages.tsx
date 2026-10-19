"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Ban, Building2, Flag, MessageCircle, MoreHorizontal, Send, ShieldAlert } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { ListingTypeTag, type ListingType } from "../components/listing-type-tag"
import { BlockDialog, ReportDialog } from "../components/safety-dialogs"
import { StateSwitcher } from "../components/state-switcher"

// S36 — Poruke · /poruke, /poruke/[id] · FR-68, FR-70 (EP-80 inbox, EP-81 thread, EP-82 send, EP-83 read, EP-84, EP-85)
// One conversation per listing + interested user (BR-61). Text only, ≤ 2000 characters. Two panes from lg;
// on phones one pane: the inbox, or the thread with a back button.

type ViewState = "default" | "thread" | "loading" | "empty" | "error" | "blocked" | "suspended"

type Conversation = {
  id: string
  other: { id: string; name: string; initials: string; shelter?: boolean }
  listing: { id: string; title: string; type: ListingType; active: boolean }
  /** true when the signed-in user is the listing author. */
  mine: boolean
  last: string
  lastAt: string
  unread: number
}

type Message = { id: string; fromMe: boolean; body: string; time: string; read?: boolean }

const conversations: Conversation[] = [
  {
    id: "c1",
    other: { id: "u-marko", name: "Marko J.", initials: "MJ" },
    listing: { id: "l3", title: "Prodajem transporter za psa", type: "selling", active: true },
    mine: false,
    last: "Pošalji mi samo poruku kad kreneš.",
    lastAt: "14:32",
    unread: 2,
  },
  {
    id: "c2",
    other: { id: "o-druga-sansa", name: "Azil „Druga šansa“", initials: "DŠ", shelter: true },
    listing: { id: "l1", title: "Potrebno 20 kg granula za odrasle pse", type: "need", active: true },
    mine: false,
    last: "Hvala ti! Subotom smo tu od 10:00 do 14:00.",
    lastAt: "Juče",
    unread: 1,
  },
  {
    id: "c3",
    other: { id: "u-jelena", name: "Jelena S.", initials: "JS" },
    listing: { id: "l2", title: "Poklanjam grebalicu za mačke, Bečej", type: "giving", active: true },
    mine: true,
    last: "Ti: Jeste, slobodna je. Kad ti odgovara?",
    lastAt: "16. 10.",
    unread: 0,
  },
  {
    id: "c4",
    other: { id: "u-nikola", name: "Nikola R.", initials: "NR" },
    listing: { id: "l7", title: "Poklanjam ogrlice i povoce za male pse", type: "giving", active: false },
    mine: false,
    last: "Ti: Hvala još jednom, Maksu odlično stoji!",
    lastAt: "12. 10.",
    unread: 0,
  },
]

const thread: Message[] = [
  { id: "m1", fromMe: true, body: "Zdravo! Da li je transporter još dostupan? Imam psa od 9 kg.", time: "13:05", read: true },
  { id: "m2", fromMe: false, body: "Zdravo, jeste. Za 9 kg je taman, uz njega ide i podloga.", time: "13:20" },
  { id: "m3", fromMe: true, body: "Super. Kada mogu da ga pogledam?", time: "13:22", read: true },
  { id: "m4", fromMe: false, body: "Može sutra posle 17:00 na Limanu?", time: "14:30" },
  { id: "m5", fromMe: false, body: "Pošalji mi samo poruku kad kreneš.", time: "14:32" },
]

const MAX = 2000

function InboxSkeleton() {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PersonAvatar({ initials, shelter }: { initials: string; shelter?: boolean }) {
  return (
    <Avatar className={cn("size-10", shelter && "rounded-sm")}>
      <AvatarFallback className={cn("bg-muted text-sm font-medium text-foreground", shelter && "rounded-sm")}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

export default function MessagesScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [openId, setOpenId] = useState("c1")
  // Phones show one pane at a time; from lg both panes are visible.
  const [pane, setPane] = useState<"list" | "thread">("list")
  const [messages, setMessages] = useState<Message[]>(thread)
  const [draft, setDraft] = useState("")
  const [sendError, setSendError] = useState("")
  const [blocked, setBlocked] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  const suspended = view === "suspended"
  const isBlocked = blocked || view === "blocked"
  const list = view === "empty" ? [] : conversations
  const open = list.find((c) => c.id === openId) ?? list[0]
  const unreadTotal = list.filter((c) => c.unread > 0).length

  function changeView(v: ViewState) {
    setView(v)
    setPane(v === "thread" || v === "blocked" || v === "suspended" ? "thread" : "list")
    setBlocked(false)
    setMessages(thread)
    setDraft("")
    setSendError("")
    setOpenId("c1")
  }

  function send(ev: FormEvent) {
    ev.preventDefault()
    if (!draft.trim()) {
      setSendError("Napiši poruku pre slanja.")
      return
    }
    setSendError("")
    setMessages((m) => [...m, { id: `m${m.length + 1}`, fromMe: true, body: draft.trim(), time: "14:40" }])
    setDraft("")
  }

  const showPanes = view !== "loading" && view !== "error" && list.length > 0

  return (
    <AppShell active="poruke" counts={{ podsetnici: 2, poruke: unreadTotal }}>
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "thread", label: "Razgovor otvoren (telefon)" },
          { value: "loading", label: "Učitavanje" },
          { value: "empty", label: "Prazno" },
          { value: "error", label: "Greška" },
          { value: "blocked", label: "Blokiran korisnik" },
          { value: "suspended", label: "Isključen/a" },
        ]}
        value={view}
        onChange={changeView}
      />

      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Poruke</h1>
          <p className="text-sm text-muted-foreground">Razgovori o oglasima iz Šape pomoći.</p>
        </div>

        {suspended && (
          <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
            <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 text-sm">
              Tvoj nalog je isključen iz Šape pomoći. Stare poruke možeš da čitaš, ali ne možeš da šalješ nove.
            </p>
          </Card>
        )}

        {view === "error" && <ErrorState onRetry={() => setView("default")} />}
        {view === "empty" && (
          <EmptyState
            icon={MessageCircle}
            title="Još nema poruka"
            description="Kad nekome pišeš povodom oglasa ili neko piše tebi, razgovor se pojavljuje ovde."
            action="Pogledaj oglase"
            href="/sapa-pomoci"
          />
        )}

        {(view === "loading" || showPanes) && (
          <Card className="gap-0 overflow-hidden py-0 lg:grid lg:h-[640px] lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Inbox */}
            <section
              aria-label="Razgovori"
              className={cn(
                "min-w-0 lg:overflow-y-auto lg:border-r lg:border-border",
                pane === "thread" && "hidden lg:block",
              )}
            >
              {view === "loading" ? (
                <InboxSkeleton />
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((c) => {
                    const isOpen = c.id === open?.id
                    const blockedRow = isBlocked && c.id === "c1"
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenId(c.id)
                            setPane("thread")
                          }}
                          aria-current={isOpen ? "true" : undefined}
                          className={cn(
                            "flex w-full min-w-0 items-start gap-3 p-4 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                            isOpen && "lg:bg-foreground/5",
                          )}
                        >
                          <PersonAvatar initials={c.other.initials} shelter={c.other.shelter} />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>
                                {c.other.name}
                              </span>
                              <span className="shrink-0 text-xs font-medium text-muted-foreground">{c.lastAt}</span>
                            </span>
                            <span className="block truncate text-xs font-medium text-muted-foreground">
                              {c.mine ? "Tvoj oglas: " : ""}
                              {c.listing.title}
                            </span>
                            <span className="mt-1 flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate text-sm",
                                  c.unread ? "text-foreground" : "text-muted-foreground",
                                )}
                              >
                                {blockedRow ? "Blokiran korisnik" : c.last}
                              </span>
                              {c.unread > 0 && !blockedRow && (
                                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
                                  {c.unread}
                                  <span className="sr-only"> nepročitane</span>
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Thread */}
            <section
              aria-label="Razgovor"
              className={cn("min-w-0 flex-col lg:flex lg:min-h-0", pane === "list" ? "hidden" : "flex")}
            >
              {view === "loading" || !open ? (
                <div className="space-y-3 p-4" aria-hidden>
                  <Skeleton className="h-10 w-1/2" />
                  <Skeleton className="h-16 w-2/3" />
                  <Skeleton className="ml-auto h-16 w-2/3" />
                </div>
              ) : (
                <>
                  <header className="flex min-w-0 items-center gap-2 border-b border-border p-3 md:p-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 lg:hidden"
                      aria-label="Nazad na razgovore"
                      onClick={() => setPane("list")}
                    >
                      <ArrowLeft className="size-5" aria-hidden />
                    </Button>
                    <PersonAvatar initials={open.other.initials} shelter={open.other.shelter} />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                        {open.other.shelter && <Building2 className="size-3.5 shrink-0" aria-hidden />}
                        <Link
                          href={open.other.shelter ? "/o/druga-sansa" : `/korisnik/${open.other.id}`}
                          className="truncate hover:underline"
                        >
                          {open.other.name}
                        </Link>
                      </h2>
                      <Link
                        href={`/sapa-pomoci/${open.listing.id}`}
                        className="block truncate text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {open.listing.title}
                        {!open.listing.active && " · oglas više nije aktivan"}
                      </Link>
                    </div>
                    <ListingTypeTag type={open.listing.type} className="hidden shrink-0 sm:inline-flex" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label="Više radnji">
                          <MoreHorizontal className="size-5" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                          <Flag className="size-4" aria-hidden />
                          Prijavi korisnika
                        </DropdownMenuItem>
                        {!isBlocked && !open.other.shelter && (
                          <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
                            <Ban className="size-4" aria-hidden />
                            Blokiraj
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </header>

                  <ol aria-label="Poruke u razgovoru" className="min-h-0 flex-1 space-y-3 p-4 lg:overflow-y-auto">
                    <li className="text-center text-xs font-medium text-muted-foreground" aria-hidden>
                      Danas
                    </li>
                    {(open.id === "c1" ? messages : messages.slice(0, 2)).map((m) => (
                      <li key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] min-w-0 rounded-md px-3 py-2 md:max-w-[70%]",
                            m.fromMe ? "bg-primary text-primary-foreground" : "bg-foreground/5",
                          )}
                        >
                          <span className="sr-only">{m.fromMe ? "Ti: " : `${open.other.name}: `}</span>
                          <p className="text-sm break-words whitespace-pre-line">{m.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-right text-xs font-medium",
                              m.fromMe ? "text-primary-foreground" : "text-muted-foreground",
                            )}
                          >
                            {m.time}
                            {m.fromMe && m.read ? " · Pročitano" : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {isBlocked ? (
                    <div role="status" className="space-y-3 border-t border-border p-4">
                      <p className="flex items-start gap-2 text-sm">
                        <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                        <span className="min-w-0">
                          Blokirao/la si korisnika {open.other.name}. Ta osoba ne može da ti piše, a ti ne vidiš njene oglase.
                        </span>
                      </p>
                      <Button variant="outline" className="h-11 md:h-9" onClick={() => changeView("thread")}>
                        Odblokiraj
                      </Button>
                    </div>
                  ) : suspended ? (
                    <p className="border-t border-border p-4 text-sm text-muted-foreground">
                      Slanje poruka je isključeno dok si isključen/a iz Šape pomoći.
                    </p>
                  ) : (
                    <form onSubmit={send} noValidate className="space-y-2 border-t border-border p-3 md:p-4">
                      <Label htmlFor="msg-draft" className="sr-only">
                        Nova poruka
                      </Label>
                      <div className="flex min-w-0 items-end gap-2">
                        <Textarea
                          id="msg-draft"
                          rows={2}
                          maxLength={MAX}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Napiši poruku…"
                          aria-invalid={!!sendError}
                          aria-describedby={sendError ? "msg-error" : "msg-count"}
                          className="min-h-11 min-w-0 flex-1 resize-none"
                        />
                        <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Pošalji poruku">
                          <Send className="size-5" aria-hidden />
                        </Button>
                      </div>
                      {sendError ? (
                        <p id="msg-error" className="text-sm text-destructive">
                          {sendError}
                        </p>
                      ) : (
                        <p id="msg-count" className="text-xs font-medium text-muted-foreground">
                          Samo tekst · {draft.length} / {MAX}
                        </p>
                      )}
                    </form>
                  )}
                </>
              )}
            </section>
          </Card>
        )}
      </div>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} target="user" name={open?.other.name ?? ""} />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        name={open?.other.name ?? ""}
        onConfirm={() => {
          setBlocked(true)
          setBlockOpen(false)
        }}
      />
    </AppShell>
  )
}
