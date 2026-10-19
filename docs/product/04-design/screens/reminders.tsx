"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ReminderRow, type ReminderRowData } from "../components/reminder-row"
import { StateSwitcher } from "../components/state-switcher"

// S10 — Podsetnici · /podsetnici · FR-20, FR-24
// Manual reminder rows link to /podsetnici/[id] (S11 edit). Count badge = today's pending reminders.

type ViewState = "D" | "L" | "E"
type TabKey = "danas" | "uskoro" | "propusteno" | "uradjeno"

type Reminder = ReminderRowData & { bucket: TabKey }

const luna = { name: "Luna", sex: "female" as const }
const maks = { name: "Maks", sex: "male" as const }
const kiki = { name: "Kiki", sex: "female" as const }

const initialReminders: Reminder[] = [
  // Danas
  { id: "r1", type: "meal", bucket: "danas", title: "Jutarnji obrok", when: "Danas u 08:00", status: "today", channels: ["push"], pet: luna },
  {
    id: "r2",
    type: "treatment_dose",
    bucket: "danas",
    title: "Sirup protiv kašlja, 5 ml",
    when: "Danas u 12:00",
    status: "today",
    channels: ["push", "whatsapp"],
    pet: maks,
  },
  { id: "r3", type: "manual", bucket: "danas", title: "Kupi seno za Kiki", when: "Danas u 17:30", status: "today", channels: ["email"] },
  { id: "r4", type: "meal", bucket: "danas", title: "Večernji obrok", when: "Danas u 18:00", status: "today", channels: ["push"], pet: luna },
  // Uskoro
  {
    id: "r5",
    type: "vaccination",
    bucket: "uskoro",
    title: "Vakcina protiv besnila",
    when: "26. 10. 2026. u 09:00 · za 7 dana",
    status: "soon",
    channels: ["email", "push", "whatsapp"],
    pet: maks,
  },
  {
    id: "r6",
    type: "vet_follow_up",
    bucket: "uskoro",
    title: "Kontrola kod Dr Vet",
    when: "3. 11. 2026. u 10:30",
    status: "soon",
    channels: ["email", "push"],
    pet: luna,
  },
  {
    id: "r7",
    type: "manual",
    bucket: "uskoro",
    title: "Šišanje u salonu „Čupko“",
    when: "8. 11. 2026. u 11:00",
    status: "soon",
    channels: ["email"],
    pet: maks,
  },
  { id: "r8", type: "birthday", bucket: "uskoro", title: "Rođendan — Kiki", when: "15. 11. 2026. u 09:00", status: "soon", channels: ["push"], pet: kiki },
  // Propušteno
  {
    id: "r9",
    type: "treatment_dose",
    bucket: "propusteno",
    title: "Tableta protiv glista",
    when: "17. 10. 2026. u 20:00",
    status: "missed",
    channels: ["push"],
    pet: luna,
  },
  {
    id: "r10",
    type: "treatment_dose",
    bucket: "propusteno",
    title: "Sirup protiv kašlja, 5 ml",
    when: "18. 10. 2026. u 12:00",
    status: "missed",
    channels: ["push", "whatsapp"],
    pet: maks,
  },
  // Urađeno
  {
    id: "r11",
    type: "treatment_dose",
    bucket: "uradjeno",
    title: "Sirup protiv kašlja, 5 ml",
    when: "19. 10. 2026. u 07:02 · Marko",
    status: "done",
    channels: ["push", "whatsapp"],
    pet: maks,
  },
  {
    id: "r12",
    type: "meal",
    bucket: "uradjeno",
    title: "Večernji obrok",
    when: "18. 10. 2026. u 18:04 · Ivana",
    status: "done",
    channels: ["push"],
    pet: luna,
  },
  {
    id: "r13",
    type: "manual",
    bucket: "uradjeno",
    title: "Plati račun u Šapici",
    when: "16. 10. 2026. u 19:40 · Ivana",
    status: "done",
    channels: ["email"],
  },
]

const tabs: { key: TabKey; label: string }[] = [
  { key: "danas", label: "Danas" },
  { key: "uskoro", label: "Uskoro" },
  { key: "propusteno", label: "Propušteno" },
  { key: "uradjeno", label: "Urađeno" },
]

const emptyCopy: Record<TabKey, { title: string; description: string }> = {
  danas: {
    title: "Danas nema podsetnika",
    description: "Podsetnike pravimo sami iz vakcina, terapija, kontrola i obroka. Možeš dodati i svoj.",
  },
  uskoro: {
    title: "Ništa ne stiže uskoro",
    description: "Kad uneseš vakcinu sa datumom sledeće doze, podsetnik se pojavi ovde.",
  },
  propusteno: {
    title: "Ništa nije propušteno",
    description: "Sve je pod kontrolom. Propušteni podsetnici bi se pojavili ovde.",
  },
  uradjeno: {
    title: "Još ništa nije urađeno",
    description: "Kad označiš podsetnik kao urađen, videćeš ga ovde sa vremenom i imenom.",
  },
}

function LoadingRows() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Učitavanje podsetnika">
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

function nowLabel() {
  return "19. 10. 2026. u 10:15 · Ivana"
}

export default function RemindersScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [tab, setTab] = useState<TabKey>("danas")
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders)

  const shown = view === "E" ? [] : reminders

  function markDone(id: string) {
    // FR-24: shown as done with time and user
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, bucket: "uradjeno", status: "done", when: nowLabel() } : r)),
    )
  }

  return (
    <AppShell active="podsetnici" counts={{ podsetnici: shown.filter((r) => r.bucket === "danas").length }}>
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano" },
          { value: "L", label: "Učitavanje" },
          { value: "E", label: "Prazno" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">Podsetnici</h1>
            <p className="text-sm text-muted-foreground">Ljubimci: Luna, Maks, Kiki — i podsetnici za tebe.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-11 md:h-9">
              <Link href="/podesavanja/podsetnici">
                <Settings className="size-5" aria-hidden />
                Podešavanja
              </Link>
            </Button>
            <Button asChild className="h-11 md:h-9">
              <Link href="/podsetnici/novi">
                <Plus className="size-5" aria-hidden />
                Novi podsetnik
              </Link>
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="overflow-x-auto overflow-y-hidden">
            <TabsList>
              {tabs.map((t) => {
                const count = shown.filter((r) => r.bucket === t.key).length
                return (
                  <TabsTrigger key={t.key} value={t.key}>
                    {t.label}
                    {view !== "L" && <span className="text-xs font-medium text-muted-foreground">{count}</span>}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          {tabs.map((t) => {
            const items = shown.filter((r) => r.bucket === t.key)
            return (
              <TabsContent key={t.key} value={t.key} className="mt-4">
                {view === "L" ? (
                  <Card className="p-4 md:p-6">
                    <LoadingRows />
                  </Card>
                ) : items.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title={emptyCopy[t.key].title}
                    description={emptyCopy[t.key].description}
                    action={t.key === "danas" || t.key === "uskoro" ? "Novi podsetnik" : undefined}
                  />
                ) : (
                  <Card className="gap-4 p-4 md:p-6">
                    {t.key === "propusteno" && (
                      <p className="text-sm text-muted-foreground">
                        Ove podsetnike smo poslali dva puta, ali niko ih nije označio kao urađene.
                      </p>
                    )}
                    <ul className="space-y-2">
                      {items.map((r) => (
                        <li key={r.id} className="min-w-0">
                          {/* CR-12: manual reminders open S11 in edit mode */}
                          <ReminderRow
                            reminder={r.type === "manual" ? { ...r, href: `/podsetnici/${r.id}` } : r}
                            onDone={markDone}
                          />
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </AppShell>
  )
}
