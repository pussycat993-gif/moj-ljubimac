"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BellOff, BellRing, Check, Clock, Mail, MessageCircle, Share, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import { PremiumLock } from "@/components/app/premium-lock"
import { ReminderTypeIcon, type ReminderType } from "@/components/app/reminder-type-icon"
import { StatusBadge } from "@/components/app/status-badge"
import type { ActionResult } from "@/lib/server/result"
import { format, interpolate, type Dictionary } from "@/lib/i18n"

// S12 — Podešavanja podsetnika · /podesavanja/podsetnici · FR-22, FR-23, FR-36 (channels) · EP-28 (get:
// rpc:get_reminder_settings, always one card per type; update: one reminder_preferences upsert per
// changed card), EP-29 (push for this browser: register / check / unregister; "blokirano" from
// Notification.permission = denied, no call), ADR-05 (iPhone home-screen hint, client-side detection).
// States from real responses (API §7.3): default; premium_locked (Me.entitlements.premium = false, or 403
// premium_required on save) → the WhatsApp form and every WhatsApp checkbox in the G state; push
// isključeno / uključeno / blokirano; "WhatsApp uskoro" (CR-13) for Premium users until the WhatsApp
// channel goes live in Step 29 (no number form, WhatsApp checkboxes disabled and unchecked, monthly
// counter card hidden). Viber is absent while app_settings.viber_enabled = false (BR-14b, E-27).
// The Šapa pomoći "Poruke" card is Step 28c (Build Plan §4 invariant 11).

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

/** EP-28 update Request. */
export type PreferenceInput = {
  type: ReminderType
  lead_minutes: number[]
  delivery_time: string | null
  channels: Channel[]
}

/** API §6 PushSubscription. */
export type PushSubscriptionRow = { id: string; endpoint: string; user_agent: string | null; created_at: string }

export type PushRegistration = { endpoint: string; p256dh: string; auth: string; user_agent: string | null }

/** The EP-28 / EP-29 server calls (page.tsx). */
export type ReminderSettingsActions = {
  savePreference: (input: PreferenceInput) => Promise<ActionResult<ReminderPreference>>
  registerPush: (input: PushRegistration) => Promise<ActionResult<PushSubscriptionRow>>
  checkPush: (endpoint: string) => Promise<ActionResult<PushSubscriptionRow[]>>
  unregisterPush: (endpoint: string) => Promise<ActionResult<null>>
}

type PushState = "checking" | "unsupported" | "off" | "on" | "blocked"

type CardState = {
  type: ReminderType
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

const TYPE_COPY: Record<ReminderType, { label: keyof T; hint: keyof T }> = {
  vaccination: { label: "typeVaccination", hint: "typeVaccinationHint" },
  treatment_dose: { label: "typeTreatmentDose", hint: "typeTreatmentDoseHint" },
  vet_follow_up: { label: "typeVetFollowUp", hint: "typeVetFollowUpHint" },
  meal: { label: "typeMeal", hint: "typeMealHint" },
  birthday: { label: "typeBirthday", hint: "typeBirthdayHint" },
  manual: { label: "typeManual", hint: "typeManualHint" },
}

// The WhatsApp channel goes live in Step 29; until then Premium users see the "uskoro" state (CR-13).
const WHATSAPP_LIVE = false

function toCard(p: ReminderPreference): CardState {
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
}: {
  /** null → the EP-28 read failed (error state). */
  settings: ReminderSettings | null
  email: string
  premium: boolean
  vapidPublicKey: string
  copy: ReminderSettingsCopy
  actions: ReminderSettingsActions
}) {
  const router = useRouter()
  const t = copy.reminderSettings
  const [cards, setCards] = useState<CardState[]>(() => (settings?.preferences ?? []).map(toCard))
  const [dirty, setDirty] = useState<ReminderType[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(!premium)
  const [push, setPush] = useState<PushState>("checking")
  const [pushBusy, setPushBusy] = useState(false)
  const [iphoneHint, setIphoneHint] = useState(false)

  const isFree = locked
  const waSoon = !isFree && !WHATSAPP_LIVE
  const viberEnabled = settings?.viber_enabled ?? false

  const channels: { key: Channel; label: string; icon: typeof Mail; premium: boolean }[] = [
    { key: "email", label: t.channelEmail, icon: Mail, premium: false },
    { key: "push", label: t.channelPush, icon: Smartphone, premium: false },
    { key: "whatsapp", label: t.channelWhatsapp, icon: MessageCircle, premium: true },
    // BR-14b: Viber is not offered at all while the Operator has it switched off.
    ...(viberEnabled ? [{ key: "viber" as const, label: t.channelViber, icon: MessageCircle, premium: true }] : []),
  ]

  /** The channels a card can actually use now: WhatsApp / Viber only when unlocked and live. */
  function usable(ch: Channel) {
    if (ch === "email" || ch === "push") return true
    if (isFree) return false
    if (ch === "whatsapp") return !waSoon
    return viberEnabled
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

  function update(type: ReminderType, patch: Partial<CardState>) {
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
    setSaving(false)

    const stored = results.flatMap((r) => (r?.ok ? [r.data] : []))
    setCards((prev) => prev.map((c) => {
      const p = stored.find((s) => s.type === c.type)
      return p ? toCard(p) : c
    }))
    setDirty((prev) => prev.filter((type) => !stored.some((s) => s.type === type)))

    if (results.some((r) => r && !r.ok && r.error.code === "premium_required")) {
      setLocked(true)
      return
    }
    if (results.some((r) => !r || !r.ok)) {
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
      <div className="space-y-2">
        <Label htmlFor="wa-number">{t.whatsappNumber}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="wa-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-11 min-w-0 flex-1 md:h-9"
            defaultValue="+381 "
            placeholder={t.whatsappNumberPlaceholder}
            aria-describedby="wa-number-hint"
            disabled
          />
          <Button className="h-11 md:h-9" disabled>
            {t.whatsappSendCode}
          </Button>
        </div>
      </div>
      <p id="wa-number-hint" className="text-sm text-muted-foreground">
        {t.whatsappNumberHint}
      </p>
    </div>
  )

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

          {/* WhatsApp — Premium; "uskoro" until the channel is live (CR-13), G state on Free. */}
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
                {waSoon && (
                  <Badge variant="outline" className="bg-card">
                    {t.whatsappSoon}
                  </Badge>
                )}
              </div>
            </div>
            {isFree ? (
              <PremiumLock title={copy.common.premiumTitle} description={t.whatsappLocked} cta={copy.common.premiumCta}>
                <div className="min-h-64">{waForm}</div>
              </PremiumLock>
            ) : (
              waSoon && <p className="rounded-sm bg-foreground/5 p-3 text-sm text-muted-foreground">{t.whatsappSoonText}</p>
            )}
          </section>
        </div>
      </Card>

      {/* The WhatsApp monthly counter card (EP-31) is shown only once WhatsApp is live (Step 29). */}
      {iphoneHint && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* iPhone push hint (ADR-05, RISK-09) */}
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
                    const soon = ch.key === "whatsapp" && waSoon
                    const checked = !lockedChannel && !soon && c.channels.includes(ch.key)
                    const id = `ch-${c.type}-${ch.key}`
                    return (
                      <div key={ch.key} className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={lockedChannel || soon}
                          onCheckedChange={(v) => toggleChannel(c, ch.key, v === true)}
                          aria-describedby={lockedChannel ? `${id}-lock` : soon ? `${id}-soon` : undefined}
                        />
                        <Label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{ch.label}</span>
                        </Label>
                        {soon && (
                          <span id={`${id}-soon`} className="shrink-0 text-xs font-medium text-muted-foreground">
                            {t.whatsappSoon}
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
