"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BellOff, BellRing, Check, Clock, Link2Off, Mail, MessageCircle, Share, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import { PremiumLock } from "@/components/app/premium-lock"
import { ReminderTypeIcon, type ReminderType } from "@/components/app/reminder-type-icon"
import { StatusBadge } from "@/components/app/status-badge"
import type { ActionResult } from "@/lib/server/result"
import type { CodeSent, WhatsAppConnection, WhatsAppConnectionInput } from "@/lib/actions/whatsapp"
import { format, interpolate, type Dictionary, type Locale } from "@/lib/i18n"

// S12 — Podešavanja podsetnika · /podesavanja/podsetnici · FR-22, FR-23, FR-36 (channels) · EP-28 (get:
// rpc:get_reminder_settings, always one card per type; update: one reminder_preferences upsert per
// changed card), EP-29 (push for this browser: register / check / unregister; "blokirano" from
// Notification.permission = denied, no call), ADR-05 (iPhone home-screen hint, client-side detection).
// States from real responses (API §7.3): default; premium_locked (Me.entitlements.premium = false, or 403
// premium_required on save) → the WhatsApp form and every WhatsApp checkbox in the G state; push
// isključeno / uključeno / blokirano. Viber is absent while app_settings.viber_enabled = false (BR-14b, E-27).
// Step 29 — WhatsApp is live (replaces Step 18's "WhatsApp uskoro" state): the Kanali card connects a number
// through EP-30 (number → "Pošalji kod" → code → "Povezano" → "Prekini vezu"; 422 inline field errors, 429
// "try again in n min"), every type card offers the WhatsApp checkbox ("Broj nije povezan" beside it while no
// number is connected), and Premium users see the "n / 30 poruka ovog meseca" counter card from EP-31.
// Step 28c: the Šapa pomoći "Poruke" card (FR-69) — the seventh EP-28 row, type message: Mejl and Push switches (no
// lead time, no delivery time, never WhatsApp / Viber), saved by the same "Sačuvaj podešavanja" button through the
// EP-28 upsert with type message (saveMessagePreference); the push hint while browser push is not on, and the
// "only in the app" line when both are off.

export type ReminderSettingsCopy = Pick<Dictionary, "reminderSettings" | "common">

type Channel = "email" | "push" | "whatsapp" | "viber"

/** API §6 ReminderPreference. */
export type ReminderPreference = {
  type: ReminderType
  lead_minutes: number[]
  delivery_time: string | null
  channels: Channel[]
  fixed_time: boolean
  is_default: boolean
  updated_at: string | null
}

/** EP-28 get Response (API §6 WhatsAppConnection). */
export type ReminderSettings = {
  preferences: ReminderPreference[]
  viber_enabled: boolean
  whatsapp: {
    channel: "whatsapp"
    status: "connected" | "not_connected"
    phone: string | null
    connected_at: string | null
  }
}

/** The six reminder types with a type card; `message` has the Poruke card. */
type CardType = Exclude<ReminderType, "message">

/** EP-28 update Request. */
export type PreferenceInput = {
  type: CardType
  lead_minutes: number[]
  delivery_time: string | null
  channels: Channel[]
}

/** API §6 PushSubscription. */
export type PushSubscriptionRow = { id: string; endpoint: string; user_agent: string | null; created_at: string }

export type PushRegistration = { endpoint: string; p256dh: string; auth: string; user_agent: string | null }

/** EP-28 update of the Poruke card (type message): channels ⊆ {email, push}, may be empty. */
export type MessagePreferenceInput = { channels: ("email" | "push")[] }

/** The EP-28 / EP-29 server calls (page.tsx). */
export type ReminderSettingsActions = {
  savePreference: (input: PreferenceInput) => Promise<ActionResult<ReminderPreference>>
  saveMessagePreference?: (input: MessagePreferenceInput) => Promise<ActionResult<{ channels: ("email" | "push")[] }>>
  registerPush: (input: PushRegistration) => Promise<ActionResult<PushSubscriptionRow>>
  checkPush: (endpoint: string) => Promise<ActionResult<PushSubscriptionRow[]>>
  unregisterPush: (endpoint: string) => Promise<ActionResult<null>>
  /** EP-30 (Step 29). */
  whatsappConnection?: (input: WhatsAppConnectionInput) => Promise<ActionResult<WhatsAppConnection | CodeSent>>
}

/** API §6 ChannelUsage (EP-31). */
export type ChannelUsage = {
  month: string
  used: number
  used_whatsapp: number
  used_viber: number
  cap: number
  remaining: number
  resets_on: string
}

type WaStep = "number" | "code" | "connected"

/** "+381 64 123 4567", "064 123 4567", "00381…" → E.164; null when it cannot be a phone number. */
function toE164(raw: string): string | null {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, "")
  let e164: string
  if (trimmed.startsWith("+")) e164 = `+${digits}`
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`
  else if (digits.startsWith("0")) e164 = `+381${digits.slice(1)}`
  else e164 = `+${digits}`
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null
}

/** Serbian numbers as in the mockup ("+381 64 123 4567"); other countries stay E.164. */
function formatPhone(e164: string) {
  if (!e164.startsWith("+381")) return e164
  const d = e164.slice(4)
  return `+381 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
}

function newKey() {
  return crypto.randomUUID()
}

type PushState = "checking" | "unsupported" | "off" | "on" | "blocked"

type CardState = {
  type: CardType
  exact: boolean
  /** Lead times in days (UI chips 0 / 1 / 3 / 7 / 14 / 30). */
  leads: number[]
  time: string
  channels: Channel[]
}

type T = Dictionary["reminderSettings"]

const LEAD_DAYS = [0, 1, 3, 7, 14, 30] as const
const LEAD_LABEL: Record<(typeof LEAD_DAYS)[number], keyof T> = {
  0: "lead0",
  1: "lead1",
  3: "lead3",
  7: "lead7",
  14: "lead14",
  30: "lead30",
}

const TYPE_COPY: Record<CardType, { label: keyof T; hint: keyof T }> = {
  vaccination: { label: "typeVaccination", hint: "typeVaccinationHint" },
  treatment_dose: { label: "typeTreatmentDose", hint: "typeTreatmentDoseHint" },
  vet_follow_up: { label: "typeVetFollowUp", hint: "typeVetFollowUpHint" },
  meal: { label: "typeMeal", hint: "typeMealHint" },
  birthday: { label: "typeBirthday", hint: "typeBirthdayHint" },
  manual: { label: "typeManual", hint: "typeManualHint" },
}

function toCard(p: ReminderPreference & { type: CardType }): CardState {
  return {
    type: p.type,
    exact: p.fixed_time,
    leads: p.fixed_time ? [] : p.lead_minutes.map((m) => Math.round(m / 1440)),
    time: p.delivery_time ?? "",
    channels: p.channels,
  }
}

/** VAPID public key (base64url) → the applicationServerKey bytes. */
function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function pushSupported(vapidPublicKey: string) {
  return (
    vapidPublicKey !== "" &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

/** ADR-05: iOS delivers web push only to a web app opened from the home screen. */
function needsIphoneHint() {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
  return ios && !standalone
}

export function ReminderSettingsClient({
  settings,
  email,
  premium,
  vapidPublicKey,
  copy,
  actions,
  usage = null,
  locale = "sr",
}: {
  /** null → the EP-28 read failed (error state). */
  settings: ReminderSettings | null
  email: string
  premium: boolean
  vapidPublicKey: string
  copy: ReminderSettingsCopy
  actions: ReminderSettingsActions
  /** EP-31 for Premium users (null: Free, or the read failed → no counter card). */
  usage?: ChannelUsage | null
  /** Date formats of the counter card (Design §9). */
  locale?: Locale
}) {
  const router = useRouter()
  const t = copy.reminderSettings
  const [cards, setCards] = useState<CardState[]>(() =>
    (settings?.preferences ?? [])
      .filter((p): p is ReminderPreference & { type: CardType } => p.type !== "message")
      .map(toCard),
  )
  const [dirty, setDirty] = useState<CardType[]>([])
  // Poruke card (type message); without a stored row the EP-28 default {email, push} applies (FR-69 #3).
  const messageChannels = settings?.preferences.find((p) => p.type === "message")?.channels ?? ["email", "push"]
  const [msgEmail, setMsgEmail] = useState(messageChannels.includes("email"))
  const [msgPush, setMsgPush] = useState(messageChannels.includes("push"))
  const [msgDirty, setMsgDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(!premium)
  const [push, setPush] = useState<PushState>("checking")
  const [pushBusy, setPushBusy] = useState(false)
  const [iphoneHint, setIphoneHint] = useState(false)
  // EP-30 — the Kanali WhatsApp connection.
  const connected = settings?.whatsapp.status === "connected" ? settings.whatsapp.phone : null
  const [waStep, setWaStep] = useState<WaStep>(connected ? "connected" : "number")
  const [waPhone, setWaPhone] = useState<string | null>(connected)
  const [waNumber, setWaNumber] = useState("+381 ")
  const [waCode, setWaCode] = useState("")
  const [waError, setWaError] = useState("")
  const [waBusy, setWaBusy] = useState(false)
  const [waSent, setWaSent] = useState<CodeSent | null>(null)
  const [resendLocked, setResendLocked] = useState(false)

  const isFree = locked
  const viberEnabled = settings?.viber_enabled ?? false

  // "Pošalji kod ponovo" is available again at resend_available_at (EP-30).
  useEffect(() => {
    if (!waSent || !resendLocked) return
    const timer = setTimeout(
      () => setResendLocked(false),
      Math.max(0, new Date(waSent.resend_available_at).getTime() - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [waSent, resendLocked])

  const channels: { key: Channel; label: string; icon: typeof Mail; premium: boolean }[] = [
    { key: "email", label: t.channelEmail, icon: Mail, premium: false },
    { key: "push", label: t.channelPush, icon: Smartphone, premium: false },
    { key: "whatsapp", label: t.channelWhatsapp, icon: MessageCircle, premium: true },
    // BR-14b: Viber is not offered at all while the Operator has it switched off.
    ...(viberEnabled ? [{ key: "viber" as const, label: t.channelViber, icon: MessageCircle, premium: true }] : []),
  ]

  /** The channels a card can actually use now: WhatsApp / Viber only when unlocked (Viber only when on). */
  function usable(ch: Channel) {
    if (ch === "email" || ch === "push") return true
    if (isFree) return false
    if (ch === "whatsapp") return true
    return viberEnabled
  }

  /** EP-30 errors → the inline message under the WhatsApp form (owner decisions, Step 29). */
  function waErrorText(error: { code: string; fields?: Record<string, string>; details?: Record<string, unknown> }) {
    if (error.code === "verification_code_invalid") return t.whatsappErrCodeInvalid
    if (error.code === "rate_limited") {
      const seconds = Number(error.details?.retry_after_s ?? 60)
      return format(t.whatsappErrRateLimited, { minutes: Math.max(1, Math.ceil(seconds / 60)) })
    }
    if (error.code === "validation_failed") {
      if (error.fields?.phone === "undeliverable") return t.whatsappErrUndeliverable
      if (error.fields?.phone) return t.whatsappErrNumber
      if (error.fields?.code) return t.whatsappErrCode
    }
    return null
  }

  async function runWhatsApp(input: WhatsAppConnectionInput): Promise<WhatsAppConnection | CodeSent | null> {
    if (!actions.whatsappConnection) return null
    setWaBusy(true)
    try {
      const result = await actions.whatsappConnection(input)
      if (result.ok) {
        setWaError("")
        return result.data
      }
      if (result.error.code === "premium_required") {
        setLocked(true)
        return null
      }
      const text = waErrorText(result.error)
      if (text) setWaError(text)
      else toast.error(copy.common.error)
      return null
    } catch {
      toast.error(copy.common.error)
      return null
    } finally {
      setWaBusy(false)
    }
  }

  async function sendCode(phone: string) {
    const sent = await runWhatsApp({ op: "send_code", phone, idempotency_key: newKey() })
    if (sent && "verification_token" in sent) {
      setResendLocked(new Date(sent.resend_available_at).getTime() > Date.now())
      setWaSent(sent)
      setWaCode("")
      setWaStep("code")
    }
  }

  async function submitNumber() {
    const phone = toE164(waNumber)
    if (!phone) {
      setWaError(t.whatsappErrNumber)
      return
    }
    setWaError("")
    await sendCode(phone)
  }

  async function confirmCode() {
    if (!waSent) return
    if (!/^\d{6}$/.test(waCode)) {
      setWaError(t.whatsappErrCode)
      return
    }
    const result = await runWhatsApp({ op: "verify_code", verification_token: waSent.verification_token, code: waCode })
    if (result && "status" in result && result.status === "connected") {
      setWaPhone(result.phone)
      setWaStep("connected")
      setWaCode("")
      setWaSent(null)
    }
  }

  async function disconnectWhatsApp() {
    const result = await runWhatsApp({ op: "disconnect" })
    if (!result) return
    setWaPhone(null)
    setWaNumber("+381 ")
    setWaStep("number")
    // EP-30 removed WhatsApp from every type on the server; a type left empty became {email, push}.
    setCards((prev) =>
      prev.map((c) => {
        if (!c.channels.includes("whatsapp")) return c
        const rest = c.channels.filter((ch) => ch !== "whatsapp")
        return { ...c, channels: rest.length > 0 ? rest : ["email", "push"] }
      }),
    )
  }

  // EP-29 check: this browser's subscription (if any) against push_subscriptions.
  async function detectPush(): Promise<PushState> {
    if (!pushSupported(vapidPublicKey)) return "unsupported"
    if (Notification.permission === "denied") return "blocked"
    try {
      const registration = await navigator.serviceWorker.register("/sw.js")
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription || Notification.permission !== "granted") return "off"
      const result = await actions.checkPush(subscription.endpoint)
      return result.ok && result.data.length > 0 ? "on" : "off"
    } catch {
      return "off"
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const state = await detectPush()
      if (cancelled) return
      setPush(state)
      setIphoneHint(needsIphoneHint())
    })()
    return () => {
      cancelled = true
    }
    // Runs once per mount: the browser state does not change without a user action on this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enablePush() {
    setPushBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === "denied") {
        setPush("blocked")
        return
      }
      if (permission !== "granted") return
      await navigator.serviceWorker.register("/sw.js")
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(vapidPublicKey),
        }))
      const keys = subscription.toJSON().keys ?? {}
      const result = await actions.registerPush({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        user_agent: navigator.userAgent.slice(0, 300) || null,
      })
      if (!result.ok) {
        toast.error(copy.common.error)
        return
      }
      setPush("on")
    } catch {
      toast.error(copy.common.error)
    } finally {
      setPushBusy(false)
    }
  }

  async function disablePush() {
    setPushBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const result = await actions.unregisterPush(subscription.endpoint)
        if (!result.ok) {
          toast.error(copy.common.error)
          return
        }
        await subscription.unsubscribe()
      }
      setPush("off")
    } catch {
      toast.error(copy.common.error)
    } finally {
      setPushBusy(false)
    }
  }

  async function recheckPush() {
    setPushBusy(true)
    setPush(await detectPush())
    setPushBusy(false)
  }

  function update(type: CardType, patch: Partial<CardState>) {
    setSaved(false)
    setCards((prev) => prev.map((c) => (c.type === type ? { ...c, ...patch } : c)))
    setDirty((prev) => (prev.includes(type) ? prev : [...prev, type]))
  }

  function toggleLead(c: CardState, days: number) {
    const next = c.leads.includes(days) ? c.leads.filter((l) => l !== days) : [...c.leads, days]
    update(c.type, { leads: next })
  }

  function toggleChannel(c: CardState, ch: Channel, on: boolean) {
    const next = on ? [...c.channels.filter((x) => x !== ch), ch] : c.channels.filter((x) => x !== ch)
    update(c.type, { channels: next })
  }

  const invalid = (c: CardState) =>
    (!c.exact && (c.leads.length === 0 || c.time === "")) || c.channels.filter(usable).length === 0

  async function save() {
    setSaved(false)
    if (cards.some(invalid)) return
    setSaving(true)
    const changed = cards.filter((c) => dirty.includes(c.type))
    const saveMessage = msgDirty && actions.saveMessagePreference ? actions.saveMessagePreference : null
    const messageResult = saveMessage
      ? saveMessage({ channels: [...(msgEmail ? ["email" as const] : []), ...(msgPush ? ["push" as const] : [])] }).catch(
          () => null,
        )
      : Promise.resolve(undefined)
    const results = await Promise.all(
      changed.map((c) =>
        actions
          .savePreference({
            type: c.type,
            lead_minutes: c.exact ? [0] : [...new Set(c.leads)].sort((a, b) => b - a).map((d) => d * 1440),
            delivery_time: c.exact ? null : c.time,
            channels: c.channels.filter(usable),
          })
          .catch(() => null),
      ),
    )
    const messageSaved = await messageResult
    setSaving(false)
    if (messageSaved?.ok) {
      setMsgEmail(messageSaved.data.channels.includes("email"))
      setMsgPush(messageSaved.data.channels.includes("push"))
      setMsgDirty(false)
    }

    const stored = results.flatMap((r) => (r?.ok ? [r.data] : []))
    setCards((prev) => prev.map((c) => {
      const p = stored.find((s) => s.type === c.type)
      return p ? toCard({ ...p, type: c.type }) : c
    }))
    setDirty((prev) => prev.filter((type) => !stored.some((s) => s.type === type)))

    if (results.some((r) => r && !r.ok && r.error.code === "premium_required")) {
      setLocked(true)
      return
    }
    if (results.some((r) => !r || !r.ok) || messageSaved === null || (messageSaved && !messageSaved.ok)) {
      toast.error(copy.common.error)
      return
    }
    setSaved(true)
  }

  if (settings === null) {
    return (
      <div className="space-y-6">
        <Heading t={t} />
        <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => router.refresh()} />
      </div>
    )
  }

  const waForm = (
    <div className="space-y-3">
      {(isFree || waStep === "number") && (
        <>
          <div className="space-y-2">
            <Label htmlFor="wa-number">{t.whatsappNumber}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wa-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 min-w-0 flex-1 md:h-9"
                value={isFree ? "+381 " : waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder={t.whatsappNumberPlaceholder}
                aria-invalid={!!waError}
                aria-describedby={waError ? "wa-error" : "wa-number-hint"}
                disabled={isFree}
              />
              <Button className="h-11 md:h-9" onClick={submitNumber} disabled={isFree || waBusy}>
                {t.whatsappSendCode}
              </Button>
            </div>
          </div>
          {waError && !isFree ? (
            <p id="wa-error" className="text-sm text-destructive">
              {waError}
            </p>
          ) : (
            <p id="wa-number-hint" className="text-sm text-muted-foreground">
              {t.whatsappNumberHint}
            </p>
          )}
        </>
      )}

      {!isFree && waStep === "code" && waSent && (
        <>
          <p className="text-sm">
            {interpolate(t.whatsappCodeSent, {
              phone: <span className="font-medium">{formatPhone(waSent.phone)}</span>,
            })}
          </p>
          <div className="space-y-2">
            <Label htmlFor="wa-code">{t.whatsappCode}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-11 min-w-0 flex-1 tracking-widest md:h-9"
                value={waCode}
                onChange={(e) => setWaCode(e.target.value.replace(/\D/g, ""))}
                placeholder={t.whatsappCodePlaceholder}
                aria-invalid={!!waError}
                aria-describedby={waError ? "wa-error" : undefined}
              />
              <Button className="h-11 md:h-9" onClick={confirmCode} disabled={waBusy}>
                {t.whatsappConfirm}
              </Button>
            </div>
          </div>
          {waError && (
            <p id="wa-error" className="text-sm text-destructive">
              {waError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => sendCode(waSent.phone)}
              disabled={waBusy || resendLocked}
            >
              {t.whatsappResend}
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
              {t.whatsappChangeNumber}
            </Button>
          </div>
        </>
      )}

      {!isFree && waStep === "connected" && waPhone && (
        <div className="flex flex-col gap-3 rounded-sm bg-foreground/5 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Check className="size-4 shrink-0 text-primary" aria-hidden />
            <p role="status" className="min-w-0 truncate text-sm font-medium">
              {format(t.whatsappConnected, { phone: formatPhone(waPhone) })}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={disconnectWhatsApp} disabled={waBusy}>
            <Link2Off className="size-4" aria-hidden />
            {t.whatsappDisconnect}
          </Button>
        </div>
      )}
    </div>
  )

  const resetsOn = usage
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-Latn", {
        day: "numeric",
        month: locale === "en" ? "short" : "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${usage.resets_on}T00:00:00Z`))
    : ""

  return (
    <div className="space-y-6">
      <Heading t={t} />

      {/* Kanali — connect delivery channels for this account. Viber is absent while switched off (BR-14b). */}
      <Card className="gap-6 p-4 md:p-6">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">{t.channelsTitle}</h2>
          <p className="text-sm text-muted-foreground">{format(t.channelsDescription, { email })}</p>
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
                  {t.push}
                </h3>
                {push === "on" && <StatusBadge status="done" label={t.pushOn} />}
                {push === "off" && (
                  <Badge variant="outline" className="bg-card">
                    {t.pushOff}
                  </Badge>
                )}
                {push === "blocked" && <StatusBadge status="missed" label={t.pushBlocked} />}
              </div>
            </div>

            {push === "checking" && <Skeleton className="h-11 w-full md:h-9" />}
            {push === "unsupported" && <p className="text-sm text-muted-foreground">{t.pushUnsupported}</p>}
            {push === "off" && (
              <>
                <p className="text-sm text-muted-foreground">{t.pushOffText}</p>
                <Button className="h-11 w-full md:h-9 md:w-auto" onClick={enablePush} disabled={pushBusy}>
                  <BellRing className="size-4" aria-hidden />
                  {t.pushEnable}
                </Button>
              </>
            )}
            {push === "on" && (
              <>
                <p role="status" className="text-sm text-muted-foreground">
                  {t.pushOnText}
                </p>
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9 md:w-auto"
                  onClick={disablePush}
                  disabled={pushBusy}
                >
                  <BellOff className="size-4" aria-hidden />
                  {t.pushDisable}
                </Button>
              </>
            )}
            {push === "blocked" && (
              <>
                <p className="text-sm">{t.pushBlockedText}</p>
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9 md:w-auto"
                  onClick={recheckPush}
                  disabled={pushBusy}
                >
                  {t.pushRecheck}
                </Button>
              </>
            )}
          </section>

          {/* WhatsApp — connect a phone number (Premium, EP-30); G state on Free. */}
          <section aria-labelledby="wa-heading" className="min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <MessageCircle className="size-5 text-primary" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <h3 id="wa-heading" className="font-heading text-lg font-bold">
                  {t.whatsapp}
                </h3>
                <StatusBadge status="premium" label={copy.common.premium} />
              </div>
            </div>
            {isFree ? (
              <PremiumLock title={copy.common.premiumTitle} description={t.whatsappLocked} cta={copy.common.premiumCta}>
                <div className="min-h-64">{waForm}</div>
              </PremiumLock>
            ) : (
              waForm
            )}
          </section>
        </div>
      </Card>

      {((!isFree && usage) || iphoneHint) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* WhatsApp monthly counter for Premium (BR-14a, EP-31) */}
          {!isFree && usage && (
            <Card className="gap-3 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <MessageCircle className="size-5 text-primary" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-bold">{t.usageTitle}</h2>
                  <p className="text-sm text-muted-foreground">{format(t.usageCount, { used: usage.used, cap: usage.cap })}</p>
                </div>
              </div>
              <Progress
                value={Math.min(100, (usage.used / usage.cap) * 100)}
                aria-label={format(t.usageAria, { used: usage.used, cap: usage.cap })}
              />
              <p className="text-sm text-muted-foreground">{format(t.usageText, { cap: usage.cap, date: resetsOn })}</p>
            </Card>
          )}

          {/* iPhone push hint (ADR-05, RISK-09) */}
          {iphoneHint && (
          <Card className="gap-3 p-4 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <Smartphone className="size-5 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">{t.iphoneTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.iphoneText}</p>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              <li>{t.iphoneStep1}</li>
              <li>
                {interpolate(t.iphoneStep2, {
                  icon: <Share className="inline size-4 align-text-bottom" aria-label={t.iphoneShare} />,
                })}
              </li>
              <li>{t.iphoneStep3}</li>
            </ol>
          </Card>
          )}
        </div>
      )}

      <section aria-labelledby="types-heading" className="space-y-4">
        <h2 id="types-heading" className="font-heading text-[22px] leading-7 font-bold">
          {t.typesTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.type} className="gap-4 p-4 md:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <ReminderTypeIcon type={c.type} forMe={c.type === "manual"} />
                <div className="min-w-0">
                  <h3 className="font-heading text-lg font-bold">{t[TYPE_COPY[c.type].label]}</h3>
                  <p className="text-sm text-muted-foreground">{t[TYPE_COPY[c.type].hint]}</p>
                </div>
              </div>

              {c.exact ? (
                <p className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
                  <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {t.exactTime}
                </p>
              ) : (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-muted-foreground">{t.leadLegend}</legend>
                    <div className="flex flex-wrap gap-2">
                      {LEAD_DAYS.map((days) => {
                        const on = c.leads.includes(days)
                        return (
                          <Button
                            key={days}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            aria-pressed={on}
                            onClick={() => toggleLead(c, days)}
                          >
                            {on && <Check className="size-4" aria-hidden />}
                            {t[LEAD_LABEL[days]]}
                          </Button>
                        )
                      })}
                    </div>
                    {c.leads.length === 0 && <p className="text-sm text-destructive">{t.errLeads}</p>}
                  </fieldset>

                  <div className="space-y-2">
                    <Label htmlFor={`time-${c.type}`}>{t.deliveryTime}</Label>
                    <Input
                      id={`time-${c.type}`}
                      type="time"
                      value={c.time}
                      onChange={(e) => update(c.type, { time: e.target.value })}
                      className="w-full md:w-40"
                      aria-invalid={c.time === ""}
                      aria-describedby={c.time === "" ? `time-${c.type}-error` : undefined}
                    />
                    {c.time === "" && (
                      <p id={`time-${c.type}-error`} className="text-sm text-destructive">
                        {t.errDeliveryTime}
                      </p>
                    )}
                  </div>
                </>
              )}

              <Separator />

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">{t.channelsLegend}</legend>
                <div className="flex flex-col gap-2">
                  {channels.map((ch) => {
                    const Icon = ch.icon
                    const lockedChannel = ch.premium && isFree
                    const notConnected = ch.key === "whatsapp" && !isFree && !waPhone
                    const checked = !lockedChannel && c.channels.includes(ch.key)
                    const id = `ch-${c.type}-${ch.key}`
                    return (
                      <div key={ch.key} className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={lockedChannel}
                          onCheckedChange={(v) => toggleChannel(c, ch.key, v === true)}
                          aria-describedby={lockedChannel ? `${id}-lock` : notConnected ? `${id}-nc` : undefined}
                        />
                        <Label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{ch.label}</span>
                        </Label>
                        {notConnected && (
                          <span id={`${id}-nc`} className="shrink-0 text-xs font-medium text-muted-foreground">
                            {t.whatsappNotConnected}
                          </span>
                        )}
                        {lockedChannel && (
                          <>
                            <StatusBadge status="premium" label={copy.common.premium} />
                            <span id={`${id}-lock`} className="sr-only">
                              {t.channelLocked}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                {c.channels.filter(usable).length === 0 && <p className="text-sm text-destructive">{t.errChannels}</p>}
              </fieldset>
            </Card>
          ))}
        </div>
      </section>

      {/* Šapa pomoći → Poruke (FR-69): new-message notifications by email and push only. */}
      <section aria-labelledby="messages-heading" className="space-y-4">
        <h2 id="messages-heading" className="font-heading text-[22px] leading-7 font-bold">
          {t.messagesSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <MessageCircle className="size-5 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-bold">{t.typeMessage}</h3>
                <p className="text-sm text-muted-foreground">{t.typeMessageHint}</p>
              </div>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                <Label htmlFor="msg-email" className="flex min-w-0 flex-1 items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{t.channelEmail}</span>
                </Label>
                <Switch
                  id="msg-email"
                  checked={msgEmail}
                  onCheckedChange={(v) => {
                    setMsgEmail(v)
                    setMsgDirty(true)
                    setSaved(false)
                  }}
                />
              </div>
              <div className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                <Label htmlFor="msg-push" className="flex min-w-0 flex-1 items-center gap-2">
                  <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{t.channelPush}</span>
                </Label>
                <Switch
                  id="msg-push"
                  checked={msgPush}
                  onCheckedChange={(v) => {
                    setMsgPush(v)
                    setMsgDirty(true)
                    setSaved(false)
                  }}
                  aria-describedby={push !== "on" ? "msg-push-hint" : undefined}
                />
              </div>
            </div>
            {push !== "on" && msgPush && (
              <p id="msg-push-hint" className="text-sm text-muted-foreground">
                {t.messagesPushHint}
              </p>
            )}
            {!msgEmail && !msgPush && <p className="text-sm text-muted-foreground">{t.messagesOff}</p>}
          </Card>
        </div>
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            {t.saved}
          </p>
        )}
        <Button className="h-11 md:h-9" onClick={save} disabled={saving}>
          {t.save}
        </Button>
      </div>
    </div>
  )
}

function Heading({ t }: { t: T }) {
  return (
    <div className="min-w-0">
      <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
      <p className="text-sm text-muted-foreground">{t.subtitle}</p>
    </div>
  )
}
