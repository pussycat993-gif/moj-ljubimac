"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { ReminderRow, type Channel, type ReminderRowData, type ReminderRowLabels } from "@/components/app/reminder-row"
import type { ReminderOccurrence } from "@/lib/actions/pets"
import {
  listReminderOccurrences,
  markOccurrenceDone,
  type ReminderFilter,
  type ReminderOccurrenceList,
} from "@/lib/actions/reminders"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S10 — Podsetnici · /podsetnici · FR-20 (display), FR-24 (in-app mark done), FR-28, FR-29 · EP-25
// (rpc:list_reminder_occurrences: tabs Danas / Uskoro / Propušteno / Urađeno → today / upcoming /
// missed / done, tab counts, "Učitaj još" on the paged tabs — API §3.4), EP-26 ("Urađeno" → the row
// moves to Urađeno with time and first name), EP-01 (the pet names in the subtitle). Manual reminder
// titles link to S11 edit at /podsetnici/[reminder_id] (CR-12; owner decision, Step 17: keyed by
// ReminderOccurrence.reminder_id); generated reminders have no link (edited at their source).
// States: loading (RemindersLoading) / default / per-tab empty / error.

export type RemindersCopy = Pick<Dictionary, "reminders" | "pet" | "common">
/** The dictionary sections the reminder rows on S01 / S03 / S10 need. */
export type ReminderRowCopy = Pick<Dictionary, "reminders" | "pet">

type TabKey = "danas" | "uskoro" | "propusteno" | "uradjeno"

const TABS: { key: TabKey; filter: Exclude<ReminderFilter, "next">; label: keyof Dictionary["reminders"] }[] = [
  { key: "danas", filter: "today", label: "tabToday" },
  { key: "uskoro", filter: "upcoming", label: "tabUpcoming" },
  { key: "propusteno", filter: "missed", label: "tabMissed" },
  { key: "uradjeno", filter: "done", label: "tabDone" },
]

const EMPTY: Record<TabKey, { title: keyof Dictionary["reminders"]; description: keyof Dictionary["reminders"] }> = {
  danas: { title: "emptyTodayTitle", description: "emptyTodayDescription" },
  uskoro: { title: "emptyUpcomingTitle", description: "emptyUpcomingDescription" },
  propusteno: { title: "emptyMissedTitle", description: "emptyMissedDescription" },
  uradjeno: { title: "emptyDoneTitle", description: "emptyDoneDescription" },
}

const PAGE = 20
const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** ReminderRow labels from the dictionary (FR-35). */
export function reminderRowLabels(t: Dictionary["reminders"]): ReminderRowLabels {
  return {
    forMe: t.forMe,
    done: t.markDone,
    channels: { email: t.channelEmail, push: t.channelPush, whatsapp: t.channelWhatsapp },
    status: { today: t.statusToday, soon: t.statusSoon, missed: t.statusMissed, done: t.statusDone },
  }
}

/** The title shown for an instance: the reminder's or source's title; meals and birthdays build theirs. */
export function occurrenceTitle(o: ReminderOccurrence, copy: ReminderRowCopy) {
  if (o.title) return o.title
  const pet = o.pet_name ?? ""
  if (o.type === "birthday") return format(copy.pet.birthdayTitle, { pet })
  if (o.type === "meal") return format(copy.reminders.mealTitle, { pet })
  return pet
}

function dateTime(iso: string, locale: Locale) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(d)
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Belgrade",
  }).format(d)
  return { date, time }
}

/** "Danas u 08:00" · "26. 10. 2026. u 09:00" · done: "19. 10. 2026. u 07:02 · Marko" (FR-24: time and user). */
export function occurrenceWhen(o: ReminderOccurrence, copy: ReminderRowCopy, locale: Locale) {
  const t = copy.reminders
  if (o.display_status === "done" && o.done_at) {
    const { date, time } = dateTime(o.done_at, locale)
    const name = (o.done_by_name ?? "").trim().split(/\s+/)[0] ?? ""
    return name ? format(t.doneAt, { date, time, name }) : format(t.dateAt, { date, time })
  }
  const { date, time } = dateTime(o.due_at, locale)
  return o.display_status === "today" ? format(t.todayAt, { time }) : format(t.dateAt, { date, time })
}

/** ReminderOccurrence → ReminderRowData. Only the caller's own manual reminders link to S11 edit. */
export function toReminderRow(o: ReminderOccurrence, copy: ReminderRowCopy, locale: Locale): ReminderRowData {
  return {
    id: o.id,
    title: occurrenceTitle(o, copy),
    when: occurrenceWhen(o, copy, locale),
    status: o.display_status,
    channels: o.channels.filter((c): c is Channel => c !== "viber"),
    type: o.type,
    pet: o.pet_name ? { name: o.pet_name, sex: o.pet_sex ?? "unknown" } : undefined,
    href: o.type === "manual" && !o.is_shared ? `/podsetnici/${o.reminder_id}` : undefined,
  }
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
          <Skeleton className="size-8 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

function Header({ copy, petNames }: { copy: RemindersCopy; petNames: string[] }) {
  const t = copy.reminders
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        {petNames.length > 0 && (
          <p className="text-sm text-muted-foreground">{format(t.subtitle, { pets: petNames.join(", ") })}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href="/podesavanja/podsetnici">
            <Settings className="size-5" aria-hidden />
            {t.settings}
          </Link>
        </Button>
        <Button asChild className="h-11 md:h-9">
          <Link href="/podsetnici/novi">
            <Plus className="size-5" aria-hidden />
            {t.add}
          </Link>
        </Button>
      </div>
    </div>
  )
}

/** S10 loading state: shown by app/(app)/podsetnici/page.tsx while EP-25 is in flight. */
export function RemindersLoading({ copy }: { copy: RemindersCopy }) {
  const t = copy.reminders
  return (
    <div className="space-y-6">
      <Header copy={copy} petNames={[]} />
      <Tabs value="danas">
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t[tab.label]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="danas" className="mt-4">
          <Card className="p-4 md:p-6">
            <LoadingRows label={t.loading} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

type TabData = { items: ReminderOccurrence[]; total: number }

export function RemindersClient({
  lists,
  petNames,
  locale,
  copy,
}: {
  /** EP-25 first pages per filter (today: the whole list), or null when a read failed. */
  lists: Record<"today" | "upcoming" | "missed" | "done", ReminderOccurrenceList> | null
  /** EP-01 active pet names for the subtitle. */
  petNames: string[]
  locale: Locale
  copy: RemindersCopy
}) {
  const t = copy.reminders
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("danas")
  const [data, setData] = useState<Record<TabKey, TabData> | null>(() =>
    lists
      ? {
          danas: { items: lists.today.items, total: lists.today.total },
          uskoro: { items: lists.upcoming.items, total: lists.upcoming.total },
          propusteno: { items: lists.missed.items, total: lists.missed.total },
          uradjeno: { items: lists.done.items, total: lists.done.total },
        }
      : null,
  )
  const [loadingMore, setLoadingMore] = useState<TabKey | null>(null)
  const labels = reminderRowLabels(t)

  if (!data) {
    return (
      <div className="space-y-6">
        <Header copy={copy} petNames={petNames} />
        <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => router.refresh()} />
      </div>
    )
  }

  async function loadMore(key: TabKey) {
    const current = data![key]
    const filter = TABS.find((x) => x.key === key)!.filter
    setLoadingMore(key)
    const result = await listReminderOccurrences({ filter, limit: PAGE, offset: current.items.length }).catch(() => null)
    setLoadingMore(null)
    if (!result?.ok) {
      toast.error(copy.common.error)
      return
    }
    setData((prev) => {
      if (!prev) return prev
      const seen = new Set(prev[key].items.map((i) => i.id))
      return {
        ...prev,
        [key]: { items: [...prev[key].items, ...result.data.items.filter((i) => !seen.has(i.id))], total: result.data.total },
      }
    })
  }

  // FR-24: the row moves to Urađeno with time and first name; the nav badge follows on refresh.
  async function markDone(key: TabKey, id: string) {
    const result = await markOccurrenceDone(id).catch(() => null)
    if (!result?.ok) {
      // 403 household_read_only → read_only: the control disappears on the next render (EP-26 States).
      if (result?.error.code !== "household_read_only") toast.error(copy.common.error)
      router.refresh()
      return
    }
    const done = result.data
    setData((prev) => {
      if (!prev) return prev
      const from = prev[key]
      const removed = from.items.some((i) => i.id === id)
      return {
        ...prev,
        [key]: { items: from.items.filter((i) => i.id !== id), total: removed ? Math.max(0, from.total - 1) : from.total },
        uradjeno: {
          items: [done, ...prev.uradjeno.items.filter((i) => i.id !== done.id)],
          total: prev.uradjeno.total + (removed ? 1 : 0),
        },
      }
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Header copy={copy} petNames={petNames} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            {TABS.map((x) => (
              <TabsTrigger key={x.key} value={x.key}>
                {t[x.label]}
                <span className="text-xs font-medium text-muted-foreground">{data[x.key].total}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map((x) => {
          const { items, total } = data[x.key]
          return (
            <TabsContent key={x.key} value={x.key} className="mt-4">
              {items.length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title={t[EMPTY[x.key].title]}
                  description={t[EMPTY[x.key].description]}
                  action={x.key === "danas" || x.key === "uskoro" ? t.add : undefined}
                  href={x.key === "danas" || x.key === "uskoro" ? "/podsetnici/novi" : undefined}
                />
              ) : (
                <Card className="gap-4 p-4 md:p-6">
                  {x.key === "propusteno" && <p className="text-sm text-muted-foreground">{t.missedNote}</p>}
                  <ul className="space-y-2">
                    {items.map((o) => (
                      <li key={o.id} className="min-w-0">
                        <ReminderRow
                          reminder={toReminderRow(o, copy, locale)}
                          onDone={(id) => markDone(x.key, id)}
                          canMarkDone={o.can_mark_done}
                          labels={labels}
                        />
                      </li>
                    ))}
                  </ul>
                  {x.key !== "danas" && items.length < total && (
                    <Button
                      variant="outline"
                      className="h-11 self-center md:h-9"
                      disabled={loadingMore === x.key}
                      onClick={() => loadMore(x.key)}
                    >
                      {t.loadMore}
                    </Button>
                  )}
                </Card>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
