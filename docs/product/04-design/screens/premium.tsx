"use client"

import { useState } from "react"
import { Check, CreditCard, Minus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AppShell } from "../components/shells"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

// S17 — Premium · /premium · FR-36, FR-37
// "unavailable" = before payments go live (CR-22): plans listed without prices (EP-44 price fields null),
// EP-45 returns 503 payment_provider_unavailable → prices hidden, CTA disabled.
type ViewState = "default" | "trialUsed" | "unavailable"
type Billing = "monthly" | "yearly"

const states: { value: ViewState; label: string }[] = [
  { value: "default", label: "D" },
  { value: "trialUsed", label: "Probni period iskorišćen" },
  { value: "unavailable", label: "Plaćanje uskoro dostupno" },
]

// EUR before VAT (PRD BR-62, Design §9).
const prices: Record<Billing, { amount: string; period: string; note?: string }> = {
  monthly: { amount: "3 €", period: "mesečno", note: "+ PDV prema tvojoj zemlji" },
  yearly: { amount: "30 €", period: "godišnje (2 meseca gratis)", note: "+ PDV prema tvojoj zemlji" },
}

type Cell = string | boolean

// Rows from PRD BR-01 (Free) and BR-02 (Premium), plus BR-04 / BR-14a.
const rows: { feature: string; free: Cell; premium: Cell }[] = [
  { feature: "Aktivni ljubimci", free: "1", premium: "Neograničeno" },
  { feature: "Uspomene", free: "2", premium: "Neograničeno" },
  { feature: "Prilozi po ljubimcu", free: "10", premium: "Neograničeno" },
  { feature: "Trenuci po ljubimcu", free: "5", premium: "Neograničeno" },
  { feature: "Dnevnik ishrane i stolice", free: "Neograničeno", premium: "Neograničeno" },
  { feature: "Izvoz kartona u PDF", free: false, premium: true },
  { feature: "Domaćinstvo (do 6 članova)", free: false, premium: true },
  { feature: "Podsetnici mejlom i push-om", free: true, premium: true },
  { feature: "Podsetnici na WhatsApp", free: false, premium: "30 poruka mesečno" },
  { feature: "Logo na podeljenim slikama", free: "Uvek", premium: "Možeš da ga ukloniš" },
]

function CellValue({ value }: { value: Cell }) {
  if (value === true)
    return (
      <span className="inline-flex items-center gap-1">
        <Check className="size-4 text-primary" aria-hidden />
        <span className="sr-only">Uključeno</span>
      </span>
    )
  if (value === false)
    return (
      <span className="inline-flex items-center gap-1">
        <Minus className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Nije uključeno</span>
      </span>
    )
  return <span>{value}</span>
}

export default function PremiumScreen() {
  const [state, setState] = useState<ViewState>("default")
  const [billing, setBilling] = useState<Billing>("yearly")
  const price = prices[billing]
  const trialUsed = state === "trialUsed"
  const unavailable = state === "unavailable"

  return (
    <AppShell variant="owner" active="profil">
      <StateSwitcher states={states} value={state} onChange={setState} />

      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Premium za sve tvoje ljubimce</h1>
          <p className="text-sm text-muted-foreground">
            Neograničeno ljubimaca, domaćinstvo za celu porodicu i podsetnici na WhatsApp.
          </p>
        </div>

        {unavailable ? (
          <Card role="status" className="flex-row items-start gap-3 p-4 md:p-6">
            <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Plaćanje uskoro dostupno</p>
              <p className="text-sm text-muted-foreground">
                Još podešavamo plaćanje karticom. Do tada koristiš Free plan bez ograničenja vremena — javićemo ti
                mejlom kad Premium bude spreman.
              </p>
            </div>
          </Card>
        ) : (
          <Tabs value={billing} onValueChange={(v) => setBilling(v as Billing)}>
            <TabsList aria-label="Period naplate">
              <TabsTrigger value="monthly">Mesečno</TabsTrigger>
              <TabsTrigger value="yearly">Godišnje</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">Free</h2>
                <p className="text-sm text-muted-foreground">Za jednog ljubimca i osnovni karton.</p>
              </div>
              <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-medium">Tvoj plan</span>
            </div>
            <p className="font-heading text-[22px] leading-7 font-bold">0 €</p>
            <Button variant="outline" className="mt-auto h-11 md:h-9" disabled>
              Trenutni plan
            </Button>
          </Card>

          <Card className="gap-4 border-primary p-4 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">Premium</h2>
                <p className="text-sm text-muted-foreground">Sve otključano, bez limita.</p>
              </div>
              <StatusBadge status="premium" className="shrink-0" />
            </div>
            {unavailable ? (
              <p className="text-sm text-muted-foreground">Cena će biti objavljena uskoro.</p>
            ) : (
              <div>
                <p className="font-heading text-[22px] leading-7 font-bold">
                  {price.amount} <span className="font-sans text-sm font-normal text-muted-foreground">{price.period}</span>
                </p>
                {price.note && <p className="text-sm text-muted-foreground">{price.note}</p>}
              </div>
            )}
            <Button className="h-11 md:h-9" disabled={unavailable}>
              <Sparkles className="size-5" aria-hidden />
              {unavailable ? "Plaćanje uskoro dostupno" : trialUsed ? "Pretplati se" : "Probaj 7 dana besplatno"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {unavailable
                ? "Prvih 7 dana biće besplatno, a otkazuješ bilo kad u profilu."
                : trialUsed
                ? `Probni period je već iskorišćen na ovom nalogu, pa se ${price.amount} naplaćuje odmah. Obnavlja se automatski — otkaži bilo kad u profilu.`
                : `Prvih 7 dana besplatno, zatim ${price.amount} ${price.period}. Obnavlja se automatski — otkaži bilo kad u profilu.`}
            </p>
          </Card>
        </div>

        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">Šta dobijaš</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal">Mogućnost</TableHead>
                <TableHead className="whitespace-normal">Free</TableHead>
                <TableHead className="whitespace-normal text-primary">Premium</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.feature}>
                  <TableCell className="whitespace-normal">{r.feature}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    <CellValue value={r.free} />
                  </TableCell>
                  <TableCell className="whitespace-normal font-medium">
                    <CellValue value={r.premium} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {!unavailable && (
          <Card className="flex-row items-start gap-3 p-4 md:p-6">
            <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Plaćanje preko Paddle-a</p>
              <p className="text-sm text-muted-foreground">
                Paddle je prodavac i izdaje račun; PDV se dodaje prema tvojoj zemlji. Podatke o kartici čuva Paddle, ne mi.
              </p>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
