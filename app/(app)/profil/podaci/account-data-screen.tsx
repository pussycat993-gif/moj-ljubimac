"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ChevronLeft, Clock, Download, FileArchive, Trash2, Undo2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import type { DataExport, DataOverview } from "@/lib/actions/data-control"
import type { Me } from "@/lib/actions/registration"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S19 — Moji podaci · /profil/podaci · FR-40, FR-41 (port of docs/product/04-design/screens/account-data.tsx
// without the StateSwitcher). States from real responses (API EP-50 / EP-51 "States", §7.3): default (no export,
// or expired / failed — failed adds exportFailed, owner decision Step 23), preparing (status = preparing; the
// mockup's fake Progress bar is removed, owner decision), ready (status = ready with download_url), pending
// (EP-43 deletion_due_at set or 403 account_pending_deletion — built from the EP-43 deletion_* fields with the
// export card hidden, owner decision), error (5xx on EP-50). The archive itself is built in Step 30a.

export type AccountDataCopy = { accountData: Dictionary["accountData"]; common: Dictionary["common"] }

export type AccountDataActions = {
  requestDataExport: () => Promise<ActionResult<DataExport>>
  getMyDataOverview: () => Promise<ActionResult<DataOverview>>
  requestAccountDeletion: (input: { confirm: boolean }) => Promise<ActionResult<Me>>
  cancelAccountDeletion: () => Promise<ActionResult<Me>>
}

type Deletion = { requested_at: string; due_at: string; days_left: number }

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** sr-Latn "18. 11. 2026." · en-GB "18 Nov 2026", on the Europe/Belgrade calendar (Design §9). */
function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** "248 MB" · "0,8 MB" (Design §7, §9). */
function formatSize(bytes: number, locale: Locale) {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(dict: object, base: string, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return format((dict as Record<string, string>)[`${base}_${rule === "one" || rule === "few" ? rule : "other"}`], { n })
}

function deletionOf(me: Pick<Me, "deletion_requested_at" | "deletion_due_at" | "deletion_days_left">): Deletion | null {
  if (!me.deletion_due_at || !me.deletion_requested_at) return null
  return { requested_at: me.deletion_requested_at, due_at: me.deletion_due_at, days_left: Math.max(0, me.deletion_days_left ?? 0) }
}

function ExportCard({
  overview,
  latest,
  email,
  busy,
  locale,
  t,
  onRequest,
}: {
  overview: DataOverview
  latest: DataExport | null
  email: string
  busy: boolean
  locale: Locale
  t: AccountDataCopy["accountData"]
  onRequest: () => void
}) {
  const { summary } = overview
  const contents = [
    ...(summary.pet_names.length > 0 ? [format(t.contentsRecords, { pets: summary.pet_names.join(", ") })] : []),
    t.contentsHealth,
    plural(t, "attachments", summary.attachment_count, locale),
    plural(t, "moments", summary.moment_count, locale),
    t.contentsCare,
  ]
  const status = latest?.status

  return (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
          <Archive className="size-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">{t.exportTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.exportBody}</p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2">
        {contents.map((c) => (
          <li key={c} className="rounded-sm bg-foreground/5 px-2 py-1 text-xs font-medium">
            {c}
          </li>
        ))}
      </ul>

      {status !== "preparing" && status !== "ready" && (
        <>
          {status === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              {t.exportFailed}
            </p>
          )}
          <Button className="h-11 md:h-9 md:self-start" disabled={busy} onClick={onRequest}>
            <Download className="size-5" aria-hidden />
            {t.prepare}
          </Button>
        </>
      )}

      {status === "preparing" && (
        <div className="space-y-2" role="status">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-primary" aria-hidden />
            {t.preparing}
          </div>
          <p className="text-sm text-muted-foreground">{format(t.preparingBody, { email })}</p>
        </div>
      )}

      {status === "ready" && latest && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <FileArchive className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{latest.file_name}</p>
              {latest.expires_at && (
                <p className="text-xs text-muted-foreground">
                  {latest.size_bytes !== null
                    ? format(t.readyMeta, { size: formatSize(latest.size_bytes, locale), date: formatDate(latest.expires_at, locale) })
                    : format(t.readyValid, { date: formatDate(latest.expires_at, locale) })}
                </p>
              )}
            </div>
          </div>
          {latest.download_url && (
            <Button className="h-11 md:h-9 md:self-start" asChild>
              <a href={latest.download_url.url} download={latest.file_name}>
                <Download className="size-5" aria-hidden />
                {t.download}
              </a>
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export function AccountDataScreen({
  me,
  overview: initialOverview,
  locale,
  copy,
  actions,
}: {
  /** EP-43 — email and the deletion fields (the read is exempt from the pending-deletion gate). */
  me: Pick<Me, "email" | "deletion_requested_at" | "deletion_due_at" | "deletion_days_left">
  /** EP-50 getMyDataOverview, or null when it failed (or answered 403 account_pending_deletion). */
  overview: DataOverview | null
  locale: Locale
  copy: AccountDataCopy
  actions: AccountDataActions
}) {
  const t = copy.accountData
  const router = useRouter()
  const [deletion, setDeletion] = useState<Deletion | null>(deletionOf(me))
  const [overview, setOverview] = useState<DataOverview | null>(initialOverview)
  const [latest, setLatest] = useState<DataExport | null>(initialOverview?.latest_export ?? null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  // The deletion date the dialog names: today + 30 days, taken when the dialog opens.
  const [dueOnRequest, setDueOnRequest] = useState("")

  async function reloadOverview() {
    const result = await actions.getMyDataOverview()
    setOverview(result.ok ? result.data : null)
    setLatest(result.ok ? result.data.latest_export : null)
  }

  async function onRequestExport() {
    setBusy(true)
    const result = await actions.requestDataExport()
    setBusy(false)
    if (result.ok) setLatest(result.data)
    else if (result.error.code === "export_in_progress") await reloadOverview()
    else toast.error(copy.common.error)
  }

  async function onDelete() {
    setBusy(true)
    const result = await actions.requestAccountDeletion({ confirm: true })
    setBusy(false)
    setConfirmed(false)
    if (result.ok) setDeletion(deletionOf(result.data))
    else if (result.error.code === "account_pending_deletion") router.refresh()
    else toast.error(copy.common.error)
  }

  async function onCancelDeletion() {
    setBusy(true)
    const result = await actions.cancelAccountDeletion()
    if (result.ok) {
      setDeletion(deletionOf(result.data))
      if (!overview) await reloadOverview()
    } else toast.error(copy.common.error)
    setBusy(false)
  }

  const error = !deletion && !overview
  const petNames = overview?.summary.pet_names ?? []
  const heir = overview?.deletion.heir_full_name ?? null

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/profil">
            <ChevronLeft className="size-4" aria-hidden />
            {t.back}
          </Link>
        </Button>
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {error && <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => void reloadOverview()} />}

      {deletion && (
        <Card role="status" className="gap-4 border-destructive p-4 md:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
              <Trash2 className="size-5 text-destructive" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold">{format(t.pendingTitle, { date: formatDate(deletion.due_at, locale) })}</h2>
              <p className="text-sm text-muted-foreground">
                {format(t.pendingBody, { date: formatDate(deletion.requested_at, locale) })}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 text-sm font-medium">{plural(t, "pendingDays", deletion.days_left, locale)}</p>
              <p className="shrink-0 text-xs text-muted-foreground">{format(t.pendingOf, { n: deletion.days_left })}</p>
            </div>
            <Progress
              value={Math.min(100, Math.round((deletion.days_left / 30) * 100))}
              aria-label={format(t.pendingAria, { n: deletion.days_left })}
            />
          </div>
          <Button className="h-11 md:h-9 md:self-start" disabled={busy} onClick={() => void onCancelDeletion()}>
            <Undo2 className="size-5" aria-hidden />
            {t.cancelDeletion}
          </Button>
          <p className="text-xs text-muted-foreground">{t.cancelNote}</p>
        </Card>
      )}

      {!deletion && overview && (
        <ExportCard
          overview={overview}
          latest={latest}
          email={me.email}
          busy={busy}
          locale={locale}
          t={t}
          onRequest={() => void onRequestExport()}
        />
      )}

      {!deletion && overview && (
        <Card className="gap-4 p-4 md:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
              <Trash2 className="size-5 text-destructive" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold">{t.deleteTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.deleteBody}</p>
            </div>
          </div>
          <AlertDialog
            onOpenChange={(open) => {
              if (open) setDueOnRequest(formatDate(new Date(Date.now() + 30 * 86_400_000).toISOString(), locale))
              else setConfirmed(false)
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="h-11 md:h-9 md:self-start" disabled={busy}>
                {t.deleteButton}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.dialogTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {petNames.length > 0
                    ? format(t.dialogBody, { date: dueOnRequest, pets: petNames.join(", ") })
                    : format(t.dialogBodyNoPets, { date: dueOnRequest })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>{t.dialogPremium}</li>
                {heir && <li>{format(t.dialogHeir, { heir })}</li>}
                <li>{t.dialogTip}</li>
              </ul>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm-delete"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="confirm-delete" className="min-w-0 text-sm font-normal">
                  {t.confirm}
                </Label>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.dialogCancel}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={!confirmed} onClick={() => void onDelete()}>
                  {t.dialogConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      )}
    </div>
  )
}
