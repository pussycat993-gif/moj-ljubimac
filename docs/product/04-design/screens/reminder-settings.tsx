"use client"

import { useState } from "react"
import { BellOff, BellRing, Check, Clock, Link2Off, Mail, MessageCircle, Smartphone, Share } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { AppShell } from "../components/shells"
import { PremiumLock } from "../components/premium-lock"
import { ReminderTypeIcon, type ReminderType } from "../components/reminder-type-icon"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

// S12 — Podešavanja podsetnika · /podesavanja/podsetnici · FR-22, FR-23, FR-25
// D = Premium user (WhatsApp available, monthly counter) · G = Free user (WhatsApp Premium-locked)
// Channel variants: ON = push on + WhatsApp connected · BLK = push blocked in the browser
// SOON = Premium user before WhatsApp goes live (CR-13): WhatsApp shown as "Uskoro dostupno", disabled

type ViewState = "D" | "ON" | "BLK" | "SOON" | "G"
type PushState = "off" | "on" | "blocked"
type WaStep = "number" | "code" | "connected"

type TypeKey = "vakcine" | "terapije" | "kontrole" | "obroci" | "rodjendani" | "moji"

// BR-14b: the Viber channel is built but hidden until the Operator switches it on (S26 Admin → Kanali).
// While it is off, Viber is NOT offered here at all — not even as disabled/Premium. When the operator
// switches it on, add { key: "viber", label: "Viber", icon: MessageCircle, premium: true } to `channels`.
type ChannelKey = "email" | "push" | "whatsapp"

const channels: { key: ChannelKey; label: string; icon: typeof Mail; premium: boolean }[] = [
  { key: "email", label: "Mejl", icon: Mail, premium: false },
  { key: "push", label: "Push", icon: Smartphone, premium: false },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, premium: true },
]

const leadOptions = [
  { key: "0", label: "Na dan" },
  { key: "1", label: "1 dan pre" },
  { key: "3", label: "3 dana pre" },
  { key: "7", label: "7 dana pre" },
  { key: "14", label: "14 dana pre" },
  { key: "30", label: "30 dana pre" },
]

type TypeSettings = {
  key: TypeKey
  label: string
  hint: string
  exact: boolean // doses and meals are always sent at their exact time (BR-13)
  leads: string[]
  time: string
  channels: ChannelKey[]
}

const typeIconFor: Record<string, ReminderType> = {
  vakcine: "vaccination",
  terapije: "treatment_dose",
  kontrole: "vet_follow_up",
  obroci: "meal",
  rodjendani: "birthday",
  moji: "manual",
}

const initialSettings: TypeSettings[] = [
  {
    key: "vakcine",
    label: "Vakcine",
    hint: "Iz datuma sledeće doze u kartonu.",
    exact: false,
    leads: ["7", "0"],
    time: "09:00",
    channels: ["email", "push", "whatsapp"],
  },
  {
    key: "terapije",
    label: "Terapije i doze",
    hint: "Iz učestalosti terapije.",
    exact: true,
    leads: [],
    time: "",
    channels: ["push", "whatsapp"],
  },
  {
    key: "kontrole",
    label: "Kontrole",
    hint: "Iz datuma kontrole posle pregleda.",
    exact: false,
    leads: ["3", "0"],
    time: "09:00",
    channels: ["email", "push"],
  },
  {
    key: "obroci",
    label: "Obroci",
    hint: "Iz rasporeda obroka u dnevniku.",
    exact: true,
    leads: [],
    time: "",
    channels: ["push"],
  },
  {
    key: "rodjendani",
    label: "Rođendani",
    hint: "Iz datuma rođenja ljubimca.",
    exact: false,
    leads: ["0"],
    time: "08:00",
    channels: ["push"],
  },
  {
    key: "moji",
    label: "Moji podsetnici",
    hint: "Podsetnici koje sam/a dodaješ.",
    exact: false,
    leads: ["0"],
    time: "09:00",
    channels: ["email", "push"],
  },
]

const WHATSAPP_CAP = 30
const WHATSAPP_USED = 12
const CONNECTED_NUMBER = "+381 64 123 4567"

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^381/, "").replace(/^0/, "")
  if (d.length < 8) return raw.trim()
  return `+381 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
}

function isSerbianMobile(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^381/, "").replace(/^0/, "")
  return /^6\d{7,8}$/.test(d)
}

export default function ReminderSettingsScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [settings, setSettings] = useState<TypeSettings[]>(initialSettings)
  const [saved, setSaved] = useState(false)
  const [push, setPush] = useState<PushState>("off")
  const [waStep, setWaStep] = useState<WaStep>("number")
  const [waNumber, setWaNumber] = useState("+381 ")
  const [waConnected, setWaConnected] = useState("")
  const [waCode, setWaCode] = useState("")
  const [waError, setWaError] = useState("")

  const isFree = view === "G"
  const waSoon = view === "SOON"

  function changeView(v: ViewState) {
    setView(v)
    setSaved(false)
    setWaError("")
    setWaCode("")
    setPush(v === "ON" ? "on" : v === "BLK" ? "blocked" : "off")
    if (v === "ON") {
      setWaStep("connected")
      setWaConnected(CONNECTED_NUMBER)
    } else {
      setWaStep("number")
      setWaNumber("+381 ")
      setWaConnected("")
    }
  }

  function sendCode() {
    if (!isSerbianMobile(waNumber)) {
      setWaError("Upiši broj mobilnog telefona, npr. +381 64 123 4567.")
      return
    }
    setWaError("")
    setWaNumber(formatPhone(waNumber))
    setWaStep("code")
  }

  function confirmCode() {
    if (!/^\d{6}$/.test(waCode)) {
      setWaError("Kod ima 6 cifara. Proveri poruku na WhatsApp-u.")
      return
    }
    setWaError("")
    setWaConnected(formatPhone(waNumber))
    setWaStep("connected")
    setWaCode("")
  }

  function disconnect() {
    setWaStep("number")
    setWaConnected("")
    setWaNumber("+381 ")
  }

  const waForm = (
    <div className="space-y-3">
      {waStep === "number" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="wa-number">Broj telefona za WhatsApp</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wa-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 min-w-0 flex-1 md:h-9"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder="+381 64 123 4567"
                aria-invalid={!!waError}
                aria-describedby={waError ? "wa-error" : "wa-number-hint"}
                disabled={isFree}
              />
              <Button className="h-11 md:h-9" onClick={sendCode} disabled={isFree}>
                Pošalji kod
              </Button>
            </div>
          </div>
          {waError ? (
            <p id="wa-error" className="text-sm text-destructive">
              {waError}
            </p>
          ) : (
            <p id="wa-number-hint" className="text-sm text-muted-foreground">
              Poslaćemo ti kod na WhatsApp da potvrdimo da je broj tvoj.
            </p>
          )}
        </>
      )}

      {waStep === "code" && (
        <>
          <p className="text-sm">
            Poslali smo kod na <span className="font-medium">{waNumber}</span>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="wa-code">Kod iz poruke</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-11 min-w-0 flex-1 tracking-widest md:h-9"
                value={waCode}
                onChange={(e) => setWaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                aria-invalid={!!waError}
                aria-describedby={waError ? "wa-error" : undefined}
              />
              <Button className="h-11 md:h-9" onClick={confirmCode}>
                Potvrdi
              </Button>
            </div>
          </div>
          {waError && (
            <p id="wa-error" className="text-sm text-destructive">
              {waError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="link" size="sm" className="px-0" onClick={() => setWaCode("")}>
              Pošalji kod ponovo
            </Button>
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => {
                setWaStep("number")
                setWaError("")
              }}
            >
              Promeni broj
            </Button>
          </div>
        </>
      )}

      {waStep === "connected" && (
        <div className="flex flex-col gap-3 rounded-sm bg-foreground/5 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Check className="size-4 shrink-0 text-primary" aria-hidden />
            <p role="status" className="min-w-0 truncate text-sm font-medium">
              Povezano: {waConnected}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={disconnect}>
            <Link2Off className="size-4" aria-hidden />
            Prekini vezu
          </Button>
        </div>
      )}
    </div>
  )

  function update(key: TypeKey, patch: Partial<TypeSettings>) {
    setSaved(false)
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function toggleLead(s: TypeSettings, lead: string) {
    const next = s.leads.includes(lead) ? s.leads.filter((l) => l !== lead) : [...s.leads, lead]
    update(s.key, { leads: next })
  }

  function toggleChannel(s: TypeSettings, ch: ChannelKey, on: boolean) {
    const next = on ? [...s.channels, ch] : s.channels.filter((c) => c !== ch)
    update(s.key, { channels: next })
  }

  return (
    <AppShell active="podesavanja">
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano (Premium)" },
          { value: "ON", label: "Push uključen, WhatsApp povezan" },
          { value: "BLK", label: "Push blokiran" },
          { value: "SOON", label: "WhatsApp uskoro (Premium)" },
          { value: "G", label: "Premium zaključano (Free)" },
        ]}
        value={view}
        onChange={changeView}
      />

      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Podešavanja podsetnika</h1>
          <p className="text-sm text-muted-foreground">
            Za svaku vrstu biraš koliko ranije, u koliko sati i kojim kanalima stižu.
          </p>
        </div>

        {/* Kanali — connect delivery channels for this account. Viber is absent while switched off (BR-14b). */}
        <Card className="gap-6 p-4 md:p-6">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold">Kanali</h2>
            <p className="text-sm text-muted-foreground">
              Mejl stiže uvek na ivana.petrovic@gmail.com. Ovde uključuješ push i povezuješ WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Push */}
            <section aria-labelledby="push-heading" className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <Smartphone className="size-5 text-primary" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h3 id="push-heading" className="font-heading text-lg font-bold">
                    Push
                  </h3>
                  {push === "on" && <StatusBadge status="done" label="Uključeno" />}
                  {push === "off" && <Badge variant="outline" className="bg-card">Isključeno</Badge>}
                  {push === "blocked" && <StatusBadge status="missed" label="Blokirano u pregledaču" />}
                </div>
              </div>

              {push === "off" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Obaveštenja stižu na ovaj uređaj i kad aplikacija nije otvorena.
                  </p>
                  <Button className="h-11 w-full md:h-9 md:w-auto" onClick={() => setPush("on")}>
                    <BellRing className="size-4" aria-hidden />
                    Uključi obaveštenja u ovom pregledaču
                  </Button>
                </>
              )}
              {push === "on" && (
                <>
                  <p role="status" className="text-sm text-muted-foreground">
                    Ovaj pregledač prima obaveštenja. Na drugom uređaju ih uključuješ posebno.
                  </p>
                  <Button variant="outline" className="h-11 w-full md:h-9 md:w-auto" onClick={() => setPush("off")}>
                    <BellOff className="size-4" aria-hidden />
                    Isključi u ovom pregledaču
                  </Button>
                </>
              )}
              {push === "blocked" && (
                <>
                  <p className="text-sm">
                    Pregledač je blokirao obaveštenja za Moj Ljubimac. Klikni na ikonicu katanca pored adrese, dozvoli
                    obaveštenja i osveži stranicu.
                  </p>
                  <Button variant="outline" className="h-11 w-full md:h-9 md:w-auto" onClick={() => setPush("off")}>
                    Proveri ponovo
                  </Button>
                </>
              )}
            </section>

            {/* WhatsApp — connect a phone number (Premium) */}
            <section aria-labelledby="wa-heading" className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <MessageCircle className="size-5 text-primary" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h3 id="wa-heading" className="font-heading text-lg font-bold">
                    WhatsApp
                  </h3>
                  <StatusBadge status="premium" />
                  {waSoon && <Badge variant="outline" className="bg-card">Uskoro dostupno</Badge>}
                </div>
              </div>
              {waSoon ? (
                <p className="rounded-sm bg-foreground/5 p-3 text-sm text-muted-foreground">
                  WhatsApp podsetnici stižu uskoro. Javićemo ti mejlom kad budeš mogao/la da povežeš broj — do tada
                  podsetnici stižu mejlom i push-om.
                </p>
              ) : isFree ? (
                <PremiumLock description="Poveži broj telefona i primaj važne podsetnike i na WhatsApp-u, pored mejla i push obaveštenja.">
                  <div className="min-h-64">{waForm}</div>
                </PremiumLock>
              ) : (
                waForm
              )}
            </section>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* WhatsApp monthly counter for Premium (BR-14a) */}
          {!isFree && !waSoon && (
            <Card className="gap-3 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <MessageCircle className="size-5 text-primary" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-bold">WhatsApp poruke</h2>
                  <p className="text-sm text-muted-foreground">
                    {WHATSAPP_USED} / {WHATSAPP_CAP} poruka ovog meseca
                  </p>
                </div>
              </div>
              <Progress
                value={(WHATSAPP_USED / WHATSAPP_CAP) * 100}
                aria-label={`Iskorišćeno ${WHATSAPP_USED} od ${WHATSAPP_CAP} WhatsApp poruka ovog meseca`}
              />
              <p className="text-sm text-muted-foreground">
                Kad potrošiš svih 30, do kraja meseca podsetnici stižu mejlom i push-om. Brojač se vraća na nulu 1. 11. 2026.
              </p>
            </Card>
          )}

          {/* iPhone push hint */}
          <Card className="gap-3 p-4 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <Smartphone className="size-5 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">Koristiš iPhone?</h2>
                <p className="text-sm text-muted-foreground">Push obaveštenja rade tek kad dodaš aplikaciju.</p>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              <li>Otvori Moj Ljubimac u Safariju.</li>
              <li>
                Dodirni <Share className="inline size-4 align-text-bottom" aria-label="Podeli" /> Podeli.
              </li>
              <li>Izaberi „Dodaj na početni ekran“ i otvori aplikaciju sa ikonice.</li>
            </ol>
          </Card>
        </div>

        <section aria-labelledby="types-heading" className="space-y-4">
          <h2 id="types-heading" className="font-heading text-[22px] leading-7 font-bold">
            Vrste podsetnika
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {settings.map((s) => (
              <Card key={s.key} className="gap-4 p-4 md:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ReminderTypeIcon type={typeIconFor[s.key]} forMe={s.key === "moji"} />
                  <div className="min-w-0">
                    <h3 className="font-heading text-lg font-bold">{s.label}</h3>
                    <p className="text-sm text-muted-foreground">{s.hint}</p>
                  </div>
                </div>

                {s.exact ? (
                  <p className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
                    <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Stižu tačno u zadato vreme.
                  </p>
                ) : (
                  <>
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-muted-foreground">Koliko ranije</legend>
                      <div className="flex flex-wrap gap-2">
                        {leadOptions.map((o) => {
                          const on = s.leads.includes(o.key)
                          return (
                            <Button
                              key={o.key}
                              type="button"
                              size="sm"
                              variant={on ? "default" : "outline"}
                              aria-pressed={on}
                              onClick={() => toggleLead(s, o.key)}
                            >
                              {on && <Check className="size-4" aria-hidden />}
                              {o.label}
                            </Button>
                          )
                        })}
                      </div>
                      {s.leads.length === 0 && (
                        <p className="text-sm text-destructive">Izaberi bar jedno vreme podsećanja.</p>
                      )}
                    </fieldset>

                    <div className="space-y-2">
                      <Label htmlFor={`time-${s.key}`}>Vreme slanja</Label>
                      <Input
                        id={`time-${s.key}`}
                        type="time"
                        value={s.time}
                        onChange={(e) => update(s.key, { time: e.target.value })}
                        className="w-full md:w-40"
                      />
                    </div>
                  </>
                )}

                <Separator />

                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-muted-foreground">Kanali</legend>
                  <div className="flex flex-col gap-2">
                    {channels.map((c) => {
                      const Icon = c.icon
                      const locked = c.premium && isFree
                      const soon = c.key === "whatsapp" && waSoon
                      const checked = !locked && !soon && s.channels.includes(c.key)
                      const id = `ch-${s.key}-${c.key}`
                      return (
                        <div key={c.key} className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={locked || soon}
                            onCheckedChange={(v) => toggleChannel(s, c.key, v === true)}
                            aria-describedby={locked ? `${id}-lock` : soon ? `${id}-soon` : undefined}
                          />
                          <Label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2">
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">{c.label}</span>
                          </Label>
                          {soon && (
                            <span id={`${id}-soon`} className="shrink-0 text-xs font-medium text-muted-foreground">
                              Uskoro dostupno
                            </span>
                          )}
                          {c.key === "whatsapp" && !isFree && !soon && !waConnected && (
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">Broj nije povezan</span>
                          )}
                          {c.premium && isFree && (
                            <>
                              <StatusBadge status="premium" />
                              <span id={`${id}-lock`} className="sr-only">
                                Dostupno u Premiumu
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {!isFree && s.channels.filter((c) => !(waSoon && c === "whatsapp")).length === 0 && (
                    <p className="text-sm text-destructive">Izaberi bar jedan kanal.</p>
                  )}
                  {isFree && s.channels.filter((c) => c !== "whatsapp").length === 0 && (
                    <p className="text-sm text-destructive">Izaberi bar jedan kanal.</p>
                  )}
                </fieldset>
              </Card>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              Podešavanja su sačuvana.
            </p>
          )}
          <Button className="h-11 md:h-9" onClick={() => setSaved(true)}>
            Sačuvaj podešavanja
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
