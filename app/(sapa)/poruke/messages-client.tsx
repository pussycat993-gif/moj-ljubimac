"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { ListingTypeTag } from "@/components/app/listing-type-tag"
import {
  BlockDialog,
  ReportDialog,
  type BlockDialogLabels,
  type ReportDialogLabels,
  type ReportOutcome,
} from "@/components/app/safety-dialogs"
import type {
  Conversation,
  ConversationList,
  ConversationSummary,
  ConversationThread,
  MarkReadResult,
  Message,
  SendMessageInput,
  SendMessageResult,
} from "@/lib/actions/messages"
import type { SubmitReportInput, SubmitReportResult, UserBlock } from "@/lib/actions/reports"
import type { ActionResult, ApiError } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// S36 — Poruke · /poruke, /poruke/[id] · FR-68, FR-69, FR-70 · port of docs/product/04-design/screens/messages.tsx
// without the StateSwitcher; both routes render this component (the (sapa) layout gives the shell and its Poruke
// badge). Reads per page load only (NFR-11, API §8): the inbox from EP-80, the open thread from EP-81 followed by
// EP-83 (mark read; router.refresh() re-reads the shell badge); no socket, EventSource, Realtime or polling.
// Two panes from lg (the first conversation opens there when none is chosen); on phones one pane — the inbox, or
// the thread with a 44 px back button. Composer through EP-82 (one idempotency key per message, API §3.3) with
// inline errors: empty, user_blocked, rate_limited (30 / hour). States: default, thread open (phone), loading,
// empty, error, blocked (Conversation.i_blocked_other → Odblokiraj, composer hidden; inbox row "Blokiran korisnik"),
// suspended (Me.marketplace.suspended_at → banner, composer replaced by a note). ⋯ menu: Prijavi korisnika
// (ReportDialog, EP-84) and Blokiraj (BlockDialog, EP-85; not for shelters).

export type MessagesCopy = {
  conversations: Dictionary["sapa"]["conversations"]
  sapa: Dictionary["sapa"]["common"]
  common: Dictionary["common"]
}

export type MessagesActions = {
  listConversations: (input?: { limit?: number; offset?: number }) => Promise<ActionResult<ConversationList>>
  getConversation: (input: { conversation_id: string; limit?: number; offset?: number }) => Promise<ActionResult<ConversationThread>>
  markConversationRead: (conversationId: string) => Promise<ActionResult<MarkReadResult>>
  sendMessage: (input: SendMessageInput) => Promise<ActionResult<SendMessageResult>>
  submitReport: (input: SubmitReportInput) => Promise<ActionResult<SubmitReportResult>>
  blockUser: (userId: string) => Promise<ActionResult<UserBlock>>
  unblockUser: (userId: string) => Promise<ActionResult<null>>
}

type SapaCommon = Dictionary["sapa"]["common"]

/** ReportDialog labels from the dictionary (S33, S36, S37). */
export function reportDialogLabels(sapa: SapaCommon): ReportDialogLabels {
  return { ...sapa.report, reasons: sapa.reportReason }
}

/** BlockDialog labels from the dictionary (S33, S36, S37). */
export function blockDialogLabels(sapa: SapaCommon): BlockDialogLabels {
  return sapa.blockDialog
}

/** EP-82 error → the inline message under the composer / in the S33 Dialog (Design S36; owner decisions). */
export function sendErrorMessage(error: ApiError, sapa: SapaCommon, common: Dictionary["common"]): string {
  if (error.code === "user_blocked") return sapa.sendBlocked
  if (error.code === "rate_limited") {
    const seconds = Number(error.details?.retry_after_s ?? 60)
    return format(sapa.sendRateLimited, { minutes: Math.max(1, Math.ceil(seconds / 60)) })
  }
  if (error.code === "validation_failed" && error.fields?.body === "required") return sapa.sendEmpty
  return common.error
}

const MAX = 2000
const PAGE = 50
const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** YYYY-MM-DD of an instant on the Europe/Belgrade calendar. */
function belgradeDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Belgrade",
  }).format(typeof iso === "string" ? new Date(iso) : iso)
}

function dayOffset(iso: string) {
  const today = Date.parse(`${belgradeDay(new Date())}T00:00:00Z`)
  const day = Date.parse(`${belgradeDay(iso)}T00:00:00Z`)
  return Math.round((today - day) / 86_400_000)
}

function time(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** Inbox time: "14:32" today, "Juče", else "16. 10." / "16 Oct" (Design S36). */
function inboxTime(iso: string, locale: Locale, t: MessagesCopy["conversations"]) {
  const offset = dayOffset(iso)
  if (offset <= 0) return time(iso, locale)
  if (offset === 1) return t.yesterday
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** Day separator: "Danas", "Juče", else the date. */
function dayLabel(iso: string, locale: Locale, t: MessagesCopy["conversations"]) {
  const offset = dayOffset(iso)
  if (offset <= 0) return t.today
  if (offset === 1) return t.yesterday
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

function InboxSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label={label}>
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

type Inbox = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: ConversationSummary[] }
/** `reload` ties a loaded thread to the read that produced it; anything else shows as loading. */
type Thread =
  | { kind: "loading"; id: string; reload: number }
  | { kind: "error"; id: string; reload: number }
  | { kind: "ready"; id: string; reload: number; conversation: Conversation; messages: Message[]; total: number }

export function MessagesClient({
  conversationId,
  locale,
  suspended,
  copy,
  actions,
}: {
  /** /poruke/[id] → that conversation; /poruke → none (the first one opens on lg). */
  conversationId: string | null
  locale: Locale
  /** Me.marketplace.suspended_at is set (S state). */
  suspended: boolean
  copy: MessagesCopy
  actions: MessagesActions
}) {
  const t = copy.conversations
  const router = useRouter()
  const [inbox, setInbox] = useState<Inbox>({ kind: "loading" })
  const [inboxReload, setInboxReload] = useState(0)
  const [openId, setOpenId] = useState<string | null>(conversationId)
  // Phones show one pane at a time; from lg both panes are visible.
  const [pane, setPane] = useState<"list" | "thread">(conversationId ? "thread" : "list")
  const [loadedThread, setThread] = useState<Thread | null>(null)
  const [threadReload, setThreadReload] = useState(0)
  const thread: Thread | null =
    openId === null
      ? null
      : loadedThread?.id === openId && loadedThread.reload === threadReload
        ? loadedThread
        : { kind: "loading", id: openId, reload: threadReload }
  const [olderBusy, setOlderBusy] = useState(false)
  const [draft, setDraft] = useState("")
  const [sendError, setSendError] = useState("")
  const [sending, setSending] = useState(false)
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID())
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  // EP-80 — the inbox, once per load (and after block / unblock).
  useEffect(() => {
    let active = true
    actions
      .listConversations({ limit: PAGE, offset: 0 })
      .then((result) => {
        if (!active) return
        setInbox(result.ok ? { kind: "ready", items: result.data.items } : { kind: "error" })
        // From lg, /poruke opens the newest conversation in the right pane (Design S36).
        const first = result.ok ? result.data.items[0]?.id : undefined
        if (first && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches) {
          setOpenId((current) => current ?? first)
        }
      })
      .catch(() => active && setInbox({ kind: "error" }))
    return () => {
      active = false
    }
  }, [actions, inboxReload])

  // EP-81 then EP-83 for the open conversation.
  useEffect(() => {
    if (!openId) return
    let active = true
    const reload = threadReload
    ;(async () => {
      try {
        const result = await actions.getConversation({ conversation_id: openId, limit: PAGE, offset: 0 })
        if (!active) return
        if (!result.ok) return setThread({ kind: "error", id: openId, reload })
        setThread({ kind: "ready", id: openId, reload, ...result.data })
        if (result.data.conversation.unread_count > 0) {
          const read = await actions.markConversationRead(openId)
          if (!active || !read.ok) return
          setInbox((prev) =>
            prev.kind === "ready"
              ? { ...prev, items: prev.items.map((c) => (c.id === openId ? { ...c, unread_count: 0 } : c)) }
              : prev,
          )
          // The shell's Poruke badge is read on page load (EP-43); refresh re-reads it.
          if (read.data.marked > 0) router.refresh()
        }
      } catch {
        if (active) setThread({ kind: "error", id: openId, reload })
      }
    })()
    return () => {
      active = false
    }
  }, [actions, openId, threadReload, router])

  function openConversation(id: string) {
    setOpenId(id)
    setPane("thread")
    setDraft("")
    setSendError("")
    window.history.pushState(null, "", `/poruke/${id}`)
  }

  function backToList() {
    setPane("list")
    window.history.pushState(null, "", "/poruke")
  }

  async function loadOlder() {
    if (thread?.kind !== "ready") return
    setOlderBusy(true)
    try {
      const result = await actions.getConversation({
        conversation_id: thread.id,
        limit: PAGE,
        offset: thread.messages.length,
      })
      if (result.ok) {
        setThread((prev) =>
          prev?.kind === "ready" && prev.id === thread.id
            ? { ...prev, messages: [...result.data.messages, ...prev.messages], total: result.data.total }
            : prev,
        )
      } else {
        toast.error(copy.common.error)
      }
    } catch {
      toast.error(copy.common.error)
    } finally {
      setOlderBusy(false)
    }
  }

  async function send(ev: FormEvent) {
    ev.preventDefault()
    if (thread?.kind !== "ready") return
    if (!draft.trim()) {
      setSendError(copy.sapa.sendEmpty)
      return
    }
    setSending(true)
    try {
      const result = await actions.sendMessage({ conversation_id: thread.id, body: draft, idempotency_key: sendKey })
      if (!result.ok) {
        setSendError(sendErrorMessage(result.error, copy.sapa, copy.common))
        return
      }
      const { message, conversation } = result.data
      setSendError("")
      setDraft("")
      setSendKey(crypto.randomUUID())
      setThread((prev) =>
        prev?.kind === "ready" && prev.id === conversation.id
          ? { ...prev, messages: [...prev.messages, message], total: prev.total + 1 }
          : prev,
      )
      setInbox((prev) =>
        prev.kind === "ready"
          ? { ...prev, items: [conversation, ...prev.items.filter((c) => c.id !== conversation.id)] }
          : prev,
      )
    } catch {
      setSendError(copy.common.error)
    } finally {
      setSending(false)
    }
  }

  async function report(other: ConversationSummary["other"], input: { reason: SubmitReportInput["reason"]; note: string | null }): Promise<ReportOutcome> {
    try {
      const result = await actions.submitReport({ user_id: other.user_id, reason: input.reason, note: input.note })
      if (result.ok) return { status: result.data.already_submitted ? "already_submitted" : "sent" }
    } catch {
      // falls through to the error message
    }
    return { status: "error", message: copy.common.error }
  }

  async function setBlocked(other: ConversationSummary["other"], name: string, blocked: boolean) {
    setBlockOpen(false)
    try {
      const result = blocked ? await actions.blockUser(other.user_id) : await actions.unblockUser(other.user_id)
      if (result.ok) {
        toast.success(format(blocked ? copy.sapa.blockedToast : copy.sapa.unblockedToast, { name }))
        setThreadReload((n) => n + 1)
        setInboxReload((n) => n + 1)
        return
      }
    } catch {
      // falls through to the error toast
    }
    toast.error(copy.common.error)
  }

  const nameOf = (c: ConversationSummary) => c.other.display_name ?? copy.sapa.userFallback
  const initialsOf = (c: ConversationSummary) => c.other.initials ?? ""
  const listingTitle = (c: ConversationSummary) => (c.listing.deleted ? t.listingDeleted : (c.listing.title ?? ""))

  const items = inbox.kind === "ready" ? inbox.items : []
  const showPanes = inbox.kind === "loading" || (inbox.kind === "ready" && (items.length > 0 || openId !== null))
  const open = thread?.kind === "ready" ? thread.conversation : null
  const openName = open ? nameOf(open) : ""

  // Messages grouped under Europe/Belgrade day separators.
  const groups: { day: string; label: string; messages: Message[] }[] = []
  if (thread?.kind === "ready") {
    for (const m of thread.messages) {
      const day = belgradeDay(m.created_at)
      const last = groups[groups.length - 1]
      if (last?.day === day) last.messages.push(m)
      else groups.push({ day, label: dayLabel(m.created_at, locale, t), messages: [m] })
    }
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {suspended && (
        <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
          <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 text-sm">{t.suspended}</p>
        </Card>
      )}

      {inbox.kind === "error" && (
        <ErrorState
          message={copy.common.error}
          labels={{ retry: copy.common.retry }}
          onRetry={() => {
            setInbox({ kind: "loading" })
            setInboxReload((n) => n + 1)
          }}
        />
      )}
      {inbox.kind === "ready" && items.length === 0 && openId === null && (
        <EmptyState
          icon={MessageCircle}
          title={t.emptyTitle}
          description={t.emptyText}
          action={t.emptyAction}
          href="/sapa-pomoci"
        />
      )}

      {showPanes && (
        <Card className="gap-0 overflow-hidden py-0 lg:grid lg:h-[640px] lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Inbox */}
          <section
            aria-label={t.inbox}
            className={cn(
              "min-w-0 lg:overflow-y-auto lg:border-r lg:border-border",
              pane === "thread" && "hidden lg:block",
            )}
          >
            {inbox.kind === "loading" ? (
              <InboxSkeleton label={t.loading} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((c) => {
                  const isOpen = c.id === openId
                  const shelter = c.other.kind === "shelter"
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        aria-current={isOpen ? "true" : undefined}
                        className={cn(
                          "flex w-full min-w-0 items-start gap-3 p-4 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                          isOpen && "lg:bg-foreground/5",
                        )}
                      >
                        <PersonAvatar initials={initialsOf(c)} shelter={shelter} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-sm",
                                c.unread_count ? "font-semibold" : "font-medium",
                              )}
                            >
                              {nameOf(c)}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">
                              {inboxTime(c.last_message_at, locale, t)}
                            </span>
                          </span>
                          <span className="block truncate text-xs font-medium text-muted-foreground">
                            {c.i_am_author ? format(t.yourListing, { title: listingTitle(c) }) : listingTitle(c)}
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-sm",
                                c.unread_count ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {c.i_blocked_other
                                ? t.blockedRow
                                : c.last_message.from_me
                                  ? format(t.you, { text: c.last_message.preview })
                                  : c.last_message.preview}
                            </span>
                            {c.unread_count > 0 && !c.i_blocked_other && (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
                                {c.unread_count}
                                <span className="sr-only">{t.unread}</span>
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
            aria-label={t.thread}
            className={cn("min-w-0 flex-col lg:flex lg:min-h-0", pane === "list" ? "hidden" : "flex")}
          >
            {thread?.kind === "error" ? (
              <div className="p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 lg:hidden"
                  aria-label={t.back}
                  onClick={backToList}
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </Button>
                <ErrorState
                  message={copy.common.error}
                  labels={{ retry: copy.common.retry }}
                  onRetry={() => setThreadReload((n) => n + 1)}
                />
              </div>
            ) : !open || thread?.kind !== "ready" ? (
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
                    aria-label={t.back}
                    onClick={backToList}
                  >
                    <ArrowLeft className="size-5" aria-hidden />
                  </Button>
                  <PersonAvatar initials={initialsOf(open)} shelter={open.other.kind === "shelter"} />
                  <div className="min-w-0 flex-1">
                    <h2 className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                      {open.other.kind === "shelter" && <Building2 className="size-3.5 shrink-0" aria-hidden />}
                      <Link
                        href={
                          open.other.kind === "shelter" && open.other.organisation_slug
                            ? `/o/${open.other.organisation_slug}`
                            : `/korisnik/${open.other.user_id}`
                        }
                        className="truncate hover:underline"
                      >
                        {openName}
                      </Link>
                    </h2>
                    {open.listing.deleted || !open.listing.id ? (
                      <p className="block truncate text-xs font-medium text-muted-foreground">{t.listingDeleted}</p>
                    ) : (
                      <Link
                        href={`/sapa-pomoci/${open.listing.id}`}
                        className="block truncate text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {open.listing.title}
                        {!open.listing.active && t.listingInactive}
                      </Link>
                    )}
                  </div>
                  {open.listing.type && (
                    <ListingTypeTag
                      type={open.listing.type}
                      label={copy.sapa.type[open.listing.type]}
                      className="hidden shrink-0 sm:inline-flex"
                    />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 md:size-9"
                        aria-label={copy.sapa.moreActions}
                      >
                        <MoreHorizontal className="size-5" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                        <Flag className="size-4" aria-hidden />
                        {copy.sapa.reportUser}
                      </DropdownMenuItem>
                      {!open.i_blocked_other && open.other.kind !== "shelter" && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
                          <Ban className="size-4" aria-hidden />
                          {copy.sapa.block}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </header>

                <ol aria-label={t.messagesLabel} className="min-h-0 flex-1 space-y-3 p-4 lg:overflow-y-auto">
                  {thread.messages.length < thread.total && (
                    <li className="flex justify-center">
                      <Button variant="outline" size="sm" disabled={olderBusy} onClick={() => void loadOlder()}>
                        {t.loadOlder}
                      </Button>
                    </li>
                  )}
                  {groups.map((g) => [
                    <li key={`day-${g.day}`} className="text-center text-xs font-medium text-muted-foreground" aria-hidden>
                      {g.label}
                    </li>,
                    ...g.messages.map((m) => (
                      <li key={m.id} className={cn("flex", m.from_me ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] min-w-0 rounded-md px-3 py-2 md:max-w-[70%]",
                            m.from_me ? "bg-primary text-primary-foreground" : "bg-foreground/5",
                          )}
                        >
                          <span className="sr-only">{m.from_me ? t.srYou : format(t.srOther, { name: openName })}</span>
                          <p className="text-sm break-words whitespace-pre-line">{m.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-right text-xs font-medium",
                              m.from_me ? "text-primary-foreground" : "text-muted-foreground",
                            )}
                          >
                            {time(m.created_at, locale)}
                            {m.from_me && m.read_at ? t.read : ""}
                          </p>
                        </div>
                      </li>
                    )),
                  ])}
                </ol>

                {open.i_blocked_other ? (
                  <div role="status" className="space-y-3 border-t border-border p-4">
                    <p className="flex items-start gap-2 text-sm">
                      <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      <span className="min-w-0">{format(t.blocked, { name: openName })}</span>
                    </p>
                    <Button
                      variant="outline"
                      className="h-11 md:h-9"
                      onClick={() => void setBlocked(open.other, openName, false)}
                    >
                      {copy.sapa.unblock}
                    </Button>
                  </div>
                ) : suspended || !open.can_send ? (
                  <p className="border-t border-border p-4 text-sm text-muted-foreground">{t.suspendedComposer}</p>
                ) : (
                  <form onSubmit={send} noValidate className="space-y-2 border-t border-border p-3 md:p-4">
                    <Label htmlFor="msg-draft" className="sr-only">
                      {t.newMessage}
                    </Label>
                    <div className="flex min-w-0 items-end gap-2">
                      <Textarea
                        id="msg-draft"
                        rows={2}
                        maxLength={MAX}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t.placeholder}
                        aria-invalid={!!sendError}
                        aria-describedby={sendError ? "msg-error" : "msg-count"}
                        className="min-h-11 min-w-0 flex-1 resize-none"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="size-11 shrink-0"
                        aria-label={t.send}
                        disabled={sending}
                      >
                        <Send className="size-5" aria-hidden />
                      </Button>
                    </div>
                    {sendError ? (
                      <p id="msg-error" className="text-sm text-destructive">
                        {sendError}
                      </p>
                    ) : (
                      <p id="msg-count" className="text-xs font-medium text-muted-foreground">
                        {format(t.counter, { n: draft.length, max: MAX })}
                      </p>
                    )}
                  </form>
                )}
              </>
            )}
          </section>
        </Card>
      )}

      {open && (
        <>
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            target="user"
            name={openName}
            labels={reportDialogLabels(copy.sapa)}
            onSubmit={(input) => report(open.other, input)}
          />
          <BlockDialog
            open={blockOpen}
            onOpenChange={setBlockOpen}
            name={openName}
            labels={blockDialogLabels(copy.sapa)}
            onConfirm={() => void setBlocked(open.other, openName, true)}
          />
        </>
      )}
    </div>
  )
}
