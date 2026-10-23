"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, MoreHorizontal, PawPrint, Plus, Search, UserPlus } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import type {
  Intake,
  IntakeInput,
  MyOrganisation,
  OrgAnimalRow,
  OrgAnimalsPage,
  OrganisationInvitation,
  OrganisationMember,
} from "@/lib/actions/organisation"
import type { InviteTeamMemberInput } from "@/lib/actions/team"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// S20 — Životinje i tim · /organizacija · FR-42, FR-43, FR-44, FR-45, FR-59 (port of
// docs/product/04-design/screens/org-animals.tsx without the StateSwitcher). Data: EP-53 (organisation, team,
// pending invitations, access), EP-54 (animals with search, status chips and counts). Writes: EP-55 intake
// Dialog and the status submenu, EP-05 delete, EP-56 invite / revoke / remove / change role — server actions.
// States (API §7.3): default; loading (the page's Suspense fallback); empty (no animals at all); error
// (EP-53 / EP-54 failure); pending (approval_status = pending: banner, everything read-only); read-only when
// access.can_edit = false (breeder without a plan: banner).

export type OrgAnimalsCopy = {
  orgAnimals: Dictionary["orgAnimals"]
  orgProfile: Dictionary["orgProfile"]
  pet: Dictionary["pet"]
  petForm: Dictionary["petForm"]
  common: Dictionary["common"]
}

export type OrgAnimalsActions = {
  getMyOrganisation: () => Promise<ActionResult<MyOrganisation>>
  listOrgAnimals: (input?: {
    q?: string | null
    status?: string | null
    limit?: number
    offset?: number
  }) => Promise<ActionResult<OrgAnimalsPage>>
  createIntake: (input: IntakeInput) => Promise<ActionResult<Intake>>
  changeAnimalStatus: (input: {
    pet_id: string
    shelter_status: string
  }) => Promise<ActionResult<Pick<OrgAnimalRow, "pet_id" | "status_kind" | "status">>>
  deletePet: (input: { pet_id: string; confirm: boolean }) => Promise<ActionResult<{ deleted_pet_id: string }>>
  inviteTeamMember: (input: InviteTeamMemberInput) => Promise<ActionResult<OrganisationInvitation>>
  revokeInvitation: (input: { invitation_id: string }) => Promise<ActionResult<null>>
  removeMember: (input: { user_id: string }) => Promise<ActionResult<null>>
  changeMemberRole: (input: { user_id: string; role: "admin" | "volunteer" }) => Promise<ActionResult<OrganisationMember>>
}

type Tab = "zivotinje" | "tim"

const PAGE_SIZE = 50
// Design §11 S20: shelter chips; Uginuo / Vraćen vlasniku only when their count > 0 (owner decision).
const SHELTER_CHIPS = ["intake", "in_care", "available", "reserved", "adopted"] as const
const SHELTER_EXITS = ["deceased", "returned_to_owner"] as const
const SHELTER_STATUSES = [...SHELTER_CHIPS, ...SHELTER_EXITS]
const BREEDER_CHIPS = ["available", "reserved", "sold"] as const
const AVATAR_SPECIES: PetSpecies[] = ["cat", "dog", "rabbit", "bird", "fish", "turtle"]
const SPECIES = [
  "dog", "cat", "rabbit", "hamster", "guinea_pig", "chinchilla", "ferret", "bird", "fish", "turtle", "lizard", "snake", "other",
] as const
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function avatarSpecies(species: string): PetSpecies {
  return (AVATAR_SPECIES as string[]).includes(species) ? (species as PetSpecies) : "other"
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

/** A calendar date (YYYY-MM-DD) or a timestamp, in the user's format on the Belgrade calendar. */
function formatDate(value: string, locale: Locale) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(date)
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** "Starost": the shelter's approximate age, else from the birth date / year (Step 13 rule); none → "—". */
function ageLabel(row: OrgAnimalRow, today: string, t: Dictionary["pet"], locale: Locale): string {
  if (row.approx_age_text) return row.approx_age_text
  const [year, month, day] = today.split("-").map(Number)
  if (row.birth_date) {
    const [by, bm, bd] = row.birth_date.split("-").map(Number)
    const months = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return months >= 12 ? plural(t, "years", Math.floor(months / 12), locale) : plural(t, "months", months, locale)
  }
  if (row.birth_year) {
    const years = year - row.birth_year
    const age = years >= 1 ? plural(t, "years", years, locale) : plural(t, "months", month - 1, locale)
    return format(t.about, { age })
  }
  return "—"
}

function statusLabel(row: Pick<OrgAnimalRow, "status_kind" | "status">, t: Dictionary["orgAnimals"]): string | null {
  if (row.status_kind === "shelter") return t.shelterStatus[row.status as keyof typeof t.shelterStatus] ?? null
  if (row.status_kind === "offspring") return t.offspringStatus[row.status as keyof typeof t.offspringStatus] ?? null
  return null
}

function AnimalStatusBadge({ row, t }: { row: OrgAnimalRow; t: Dictionary["orgAnimals"] }) {
  const label = statusLabel(row, t)
  if (!label) return null
  const highlighted = row.status === "available"
  return (
    <Badge variant={highlighted ? "default" : "outline"} className={cn(!highlighted && "bg-card")}>
      {label}
    </Badge>
  )
}

function LoadingList({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  )
}

/** S20 loading variant — the page's Suspense fallback. */
export function OrgAnimalsLoading({ label }: { label: string }) {
  return <LoadingList label={label} />
}

type RowActions = {
  canChangeStatus: boolean
  canDelete: boolean
  onStatus: (row: OrgAnimalRow, status: string) => void
  onDelete: (row: OrgAnimalRow) => void
}

function AnimalActions({ row, actions, t }: { row: OrgAnimalRow; actions: RowActions; t: Dictionary["orgAnimals"] }) {
  const canStatus = actions.canChangeStatus && row.status_kind === "shelter" && !row.transferred
  const canDelete = actions.canDelete && !row.transferred
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={format(t.actionsFor, { name: row.name })}>
          <MoreHorizontal className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/ljubimci/${row.pet_id}`}>{t.openRecord}</Link>
        </DropdownMenuItem>
        {canStatus && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t.changeStatus}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={row.status} onValueChange={(value) => actions.onStatus(row, value)}>
                {SHELTER_STATUSES.map((s) => (
                  <DropdownMenuRadioItem key={s} value={s}>
                    {t.shelterStatus[s]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(row)}>
              {t.deleteAnimal}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type IntakeForm = {
  name: string
  species: string
  species_other: string
  sex: "male" | "female" | "unknown"
  intake_on: string
  arrival_type: "" | IntakeInput["arrival_type"]
  place_found: string
  note: string
}

function emptyIntake(today: string): IntakeForm {
  return { name: "", species: "dog", species_other: "", sex: "unknown", intake_on: today, arrival_type: "", place_found: "", note: "" }
}

function IntakeDialog({
  open,
  onOpenChange,
  today,
  copy,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  today: string
  copy: OrgAnimalsCopy
  onSave: (input: IntakeInput) => Promise<Record<string, string> | null>
}) {
  const t = copy.orgAnimals
  const [form, setForm] = useState<IntakeForm>(() => emptyIntake(today))
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const nameError = (submitted && form.name.trim() === "") || serverErrors.name ? t.errName : ""
  const arrivalError = (submitted && form.arrival_type === "") || serverErrors.arrival_type ? t.errArrival : ""
  const dateError = (submitted && form.intake_on === "") || serverErrors.intake_on ? t.errDate : ""
  const otherError =
    (submitted && form.species === "other" && form.species_other.trim() === "") || serverErrors.species_other
      ? copy.petForm.errSpeciesOther
      : ""

  function set<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setServerErrors((e) => ({ ...e, [key]: "" }))
  }

  function close(o: boolean) {
    if (!o) {
      setForm(emptyIntake(today))
      setSubmitted(false)
      setServerErrors({})
    }
    onOpenChange(o)
  }

  async function save() {
    setSubmitted(true)
    if (!form.name.trim() || !form.arrival_type || !form.intake_on) return
    if (form.species === "other" && !form.species_other.trim()) return
    setBusy(true)
    const errors = await onSave({
      name: form.name,
      species: form.species,
      species_other: form.species === "other" ? form.species_other : null,
      sex: form.sex,
      intake_on: form.intake_on,
      arrival_type: form.arrival_type,
      place_found: form.arrival_type === "found" ? form.place_found : null,
      note: form.note,
    })
    setBusy(false)
    if (errors) {
      setServerErrors(errors)
      return
    }
    close(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.intakeTitle}</DialogTitle>
          <DialogDescription>{t.intakeDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="intake-name">{t.intakeName}</Label>
            <Input
              id="intake-name"
              value={form.name}
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "intake-name-error" : undefined}
            />
            {nameError && (
              <p id="intake-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="intake-species">{t.intakeSpecies}</Label>
              <Select value={form.species} onValueChange={(v) => set("species", v)}>
                <SelectTrigger id="intake-species" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {copy.pet.species[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="intake-date">{t.intakeDate}</Label>
              <Input
                id="intake-date"
                type="date"
                value={form.intake_on}
                max={today}
                onChange={(e) => set("intake_on", e.target.value)}
                aria-invalid={dateError ? true : undefined}
              />
              {dateError && <p className="text-sm text-destructive">{dateError}</p>}
            </div>
          </div>
          {form.species === "other" && (
            <div className="space-y-2">
              <Label htmlFor="intake-species-other">{copy.petForm.speciesOther}</Label>
              <Input
                id="intake-species-other"
                value={form.species_other}
                maxLength={60}
                placeholder={copy.petForm.speciesOtherPlaceholder}
                onChange={(e) => set("species_other", e.target.value)}
                aria-invalid={otherError ? true : undefined}
              />
              {otherError && <p className="text-sm text-destructive">{otherError}</p>}
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.intakeSex}</legend>
            <RadioGroup
              value={form.sex}
              onValueChange={(v) => set("sex", v as IntakeForm["sex"])}
              className="flex flex-wrap gap-4"
            >
              {[
                { v: "female", l: t.female },
                { v: "male", l: t.male },
                { v: "unknown", l: t.sexUnknownYet },
              ].map((o) => (
                <div key={o.v} className="flex items-center gap-2">
                  <RadioGroupItem value={o.v} id={`intake-sex-${o.v}`} />
                  <Label htmlFor={`intake-sex-${o.v}`}>{o.l}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="intake-arrival">{t.arrival}</Label>
            <Select value={form.arrival_type} onValueChange={(v) => set("arrival_type", v as IntakeForm["arrival_type"])}>
              <SelectTrigger id="intake-arrival" className="w-full" aria-invalid={arrivalError ? true : undefined}>
                <SelectValue placeholder={t.arrivalPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {(["found", "surrendered", "confiscated", "other"] as const).map((a) => (
                  <SelectItem key={a} value={a}>
                    {t.arrivalType[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {arrivalError && <p className="text-sm text-destructive">{arrivalError}</p>}
          </div>
          {form.arrival_type === "found" && (
            <div className="space-y-2">
              <Label htmlFor="intake-place">{t.placeFound}</Label>
              <Input
                id="intake-place"
                value={form.place_found}
                maxLength={200}
                placeholder={t.placeFoundPlaceholder}
                onChange={(e) => set("place_found", e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="intake-note">{t.note}</Label>
            <Textarea
              id="intake-note"
              value={form.note}
              maxLength={2000}
              placeholder={t.notePlaceholder}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => close(false)}>
            {t.cancel}
          </Button>
          <Button className="h-11 md:h-9" disabled={busy} onClick={() => void save()}>
            {t.saveIntake}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  copy,
  onSend,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  copy: OrgAnimalsCopy
  onSend: (input: { email: string; role: "admin" | "volunteer" }) => Promise<boolean>
}) {
  const t = copy.orgAnimals
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "volunteer">("volunteer")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const valid = EMAIL.test(email.trim())

  function close(o: boolean) {
    if (!o) {
      setEmail("")
      setRole("volunteer")
      setFailed(false)
    }
    onOpenChange(o)
  }

  async function send() {
    setBusy(true)
    const sent = await onSend({ email: email.trim(), role })
    setBusy(false)
    if (sent) close(false)
    else setFailed(true)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.inviteTitle}</DialogTitle>
          <DialogDescription>{t.inviteDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">{t.inviteEmail}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              maxLength={254}
              placeholder={t.inviteEmailPlaceholder}
              onChange={(e) => {
                setEmail(e.target.value)
                setFailed(false)
              }}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.role}</legend>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as "admin" | "volunteer")} className="space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="admin" id="role-admin" />
                <div className="min-w-0">
                  <Label htmlFor="role-admin">{t.roleAdmin}</Label>
                  <p className="text-sm text-muted-foreground">{t.adminHint}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="volunteer" id="role-volonter" />
                <div className="min-w-0">
                  <Label htmlFor="role-volonter">{t.roleVolunteer}</Label>
                  <p className="text-sm text-muted-foreground">{t.volunteerHint}</p>
                </div>
              </div>
            </RadioGroup>
          </fieldset>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {copy.common.error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => close(false)}>
            {t.cancel}
          </Button>
          <Button className="h-11 md:h-9" disabled={!valid || busy} onClick={() => void send()}>
            {t.sendInvite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AnimalCard({
  row,
  t,
  copy,
  locale,
  today,
  orgType,
  actions,
}: {
  row: OrgAnimalRow
  t: Dictionary["orgAnimals"]
  copy: OrgAnimalsCopy
  locale: Locale
  today: string
  orgType: "shelter" | "breeder"
  actions: RowActions
}) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <div className="flex min-w-0 items-center gap-4 bg-pet-accent-soft p-4">
        <PetAvatar name={row.name} sex={row.sex as PetSex} species={avatarSpecies(row.species)} size="md" onSoft />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-lg font-bold text-pet-accent">{row.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{speciesLabel(row, copy)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-card px-3 py-1 text-xs font-medium text-pet-accent">{sexLabel(row, t)}</span>
        <AnimalActions row={row} actions={actions} t={t} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t.age}</dt>
            <dd className="font-medium">{ageLabel(row, today, copy.pet, locale)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <AnimalStatusBadge row={row} t={t} />
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
            {orgType === "shelter" ? t.colIntake : t.colOrigin}: {sinceLabel(row, t, locale)}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3">
          <Link
            href={`/ljubimci/${row.pet_id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t.openRecord}
            <span className="sr-only">: {row.name}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function speciesLabel(row: OrgAnimalRow, copy: OrgAnimalsCopy) {
  const species =
    row.species === "other" && row.species_other
      ? row.species_other
      : (copy.pet.species[row.species as keyof Dictionary["pet"]["species"]] ?? row.species)
  return [species, row.breed].filter(Boolean).join(", ")
}

function sexLabel(row: OrgAnimalRow, t: Dictionary["orgAnimals"]) {
  return row.sex === "female" ? t.female : row.sex === "male" ? t.male : t.sexUnknown
}

function sinceLabel(row: OrgAnimalRow, t: Dictionary["orgAnimals"], locale: Locale) {
  if (row.status_kind === "shelter") return row.since_date ? formatDate(row.since_date, locale) : "—"
  if (row.is_mother) return t.mother
  if (row.status_kind === "offspring" && row.since_date) return format(t.litter, { date: formatDate(row.since_date, locale) })
  return "—"
}

export function OrgAnimalsScreen({
  initialOrg,
  initialAnimals,
  initialTab,
  today,
  locale,
  copy,
  actions,
}: {
  initialOrg: ActionResult<MyOrganisation>
  initialAnimals: ActionResult<OrgAnimalsPage>
  initialTab: Tab
  /** Today on the Europe/Belgrade calendar (YYYY-MM-DD): ages and the latest intake date. */
  today: string
  locale: Locale
  copy: OrgAnimalsCopy
  actions: OrgAnimalsActions
}) {
  const t = copy.orgAnimals
  const router = useRouter()
  const [org, setOrg] = useState<MyOrganisation | null>(initialOrg.ok ? initialOrg.data : null)
  const [page, setPage] = useState<OrgAnimalsPage | null>(initialAnimals.ok ? initialAnimals.data : null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [filter, setFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteKey, setInviteKey] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<OrgAnimalRow | null>(null)
  const requestId = useRef(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!org || !page) {
    return <ErrorState message={copy.common.error} onRetry={() => router.refresh()} labels={{ retry: copy.common.retry }} />
  }

  const organisation = org.organisation
  const orgType = organisation.type
  const pending = organisation.approval_status === "pending"
  const canEdit = org.access.can_edit
  const isAdmin = org.access.role === "org_admin"
  const canManageTeam = isAdmin && canEdit
  const noPlan = orgType === "breeder" && !org.breeder_plan_active
  const counts = page.status_counts
  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const chips: string[] =
    orgType === "shelter"
      ? [...SHELTER_CHIPS, ...SHELTER_EXITS.filter((s) => (counts[s] ?? 0) > 0)]
      : [...BREEDER_CHIPS]
  const chipLabel = (s: string) =>
    s === "all"
      ? t.all
      : orgType === "shelter"
        ? t.shelterStatus[s as keyof typeof t.shelterStatus]
        : t.offspringStatus[s as keyof typeof t.offspringStatus]
  const cityName = organisation.city ? (locale === "en" ? organisation.city.name_en || organisation.city.name_sr : organisation.city.name_sr) : null
  const heading = cityName ? format(copy.orgProfile.nameCity, { name: organisation.name, city: cityName }) : organisation.name

  async function load(next: { q?: string; status?: string; offset?: number } = {}) {
    const q = next.q ?? query
    const status = next.status ?? filter
    const offset = next.offset ?? 0
    const id = ++requestId.current
    const result = await actions.listOrgAnimals({
      q: q.trim() || null,
      status: status === "all" ? null : status,
      limit: PAGE_SIZE,
      offset,
    })
    if (id !== requestId.current) return
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    setPage((current) =>
      offset > 0 && current ? { ...result.data, items: [...current.items, ...result.data.items] } : result.data,
    )
  }

  async function reloadOrganisation() {
    const result = await actions.getMyOrganisation()
    if (result.ok) setOrg(result.data)
    else toast.error(copy.common.error)
  }

  function onQueryChange(value: string) {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void load({ q: value }), 250)
  }

  function onFilter(value: string) {
    setFilter(value)
    void load({ status: value })
  }

  function clearSearch() {
    setQuery("")
    if (searchTimer.current) clearTimeout(searchTimer.current)
    void load({ q: "" })
  }

  async function saveIntake(input: IntakeInput): Promise<Record<string, string> | null> {
    const result = await actions.createIntake(input)
    if (result.ok) {
      await load()
      return null
    }
    if (result.error.code === "validation_failed" && result.error.fields) {
      const known = ["name", "arrival_type", "intake_on", "species_other"]
      if (Object.keys(result.error.fields).some((f) => known.includes(f))) return result.error.fields
    }
    toast.error(copy.common.error)
    return {}
  }

  const rowActions: RowActions = {
    canChangeStatus: canEdit && orgType === "shelter",
    canDelete: org.access.can_delete,
    onStatus: (row, status) => {
      if (status === row.status) return
      void (async () => {
        const result = await actions.changeAnimalStatus({ pet_id: row.pet_id, shelter_status: status })
        if (!result.ok) {
          toast.error(copy.common.error)
          return
        }
        await load()
      })()
    },
    onDelete: (row) => setDeleteTarget(row),
  }

  async function confirmDelete() {
    const row = deleteTarget
    if (!row) return
    setDeleteTarget(null)
    const result = await actions.deletePet({ pet_id: row.pet_id, confirm: true })
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    toast.success(format(row.sex === "female" ? t.deletedFemale : t.deletedMale, { name: row.name }))
    await load()
  }

  async function sendInvite(input: { email: string; role: "admin" | "volunteer" }) {
    const result = await actions.inviteTeamMember({ ...input, idempotency_key: inviteKey })
    if (!result.ok) return false
    await reloadOrganisation()
    return true
  }

  async function teamAction(run: () => Promise<ActionResult<unknown>>) {
    const result = await run()
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    await reloadOrganisation()
  }

  const visible = page.items
  const searching = query.trim() !== ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{heading}</p>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{tab === "zivotinje" ? t.animals : t.team}</h1>
        </div>
        {canEdit && tab === "zivotinje" && allCount > 0 &&
          (orgType === "shelter" ? (
            <Button className="h-11 md:h-9" onClick={() => setIntakeOpen(true)}>
              <Plus className="size-5" aria-hidden />
              {t.newIntake}
            </Button>
          ) : (
            <Button asChild className="h-11 md:h-9">
              <Link href="/organizacija/legla">
                <Plus className="size-5" aria-hidden />
                {t.newLitter}
              </Link>
            </Button>
          ))}
        {canManageTeam && tab === "tim" && (
          <Button
            className="h-11 md:h-9"
            onClick={() => {
              setInviteKey(crypto.randomUUID())
              setInviteOpen(true)
            }}
          >
            <UserPlus className="size-5" aria-hidden />
            {t.inviteMember}
          </Button>
        )}
      </div>

      {pending && <ReadOnlyBanner reason={t.pendingBanner} />}
      {!pending && noPlan && <ReadOnlyBanner reason={t.breederPlanBanner} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="zivotinje">{t.animals}</TabsTrigger>
          <TabsTrigger value="tim">{t.team}</TabsTrigger>
        </TabsList>

        <TabsContent value="zivotinje" className="mt-4 space-y-4">
          {allCount === 0 ? (
            <EmptyState
              icon={PawPrint}
              title={t.emptyTitle}
              description={orgType === "shelter" ? t.emptyShelter : t.emptyBreeder}
              {...(canEdit
                ? orgType === "shelter"
                  ? { action: t.newIntake, onAction: () => setIntakeOpen(true) }
                  : { action: t.newLitter, href: "/organizacija/legla" }
                : {})}
            />
          ) : (
            <>
              <div className="relative min-w-0 md:max-w-xs">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  aria-label={t.searchLabel}
                  className="h-11 pl-8 md:h-9"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label={t.filterLabel}>
                {["all", ...chips].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={filter === s ? "default" : "outline"}
                    aria-pressed={filter === s}
                    className="shrink-0"
                    onClick={() => onFilter(s)}
                  >
                    {format(t.chip, { label: chipLabel(s), count: s === "all" ? allCount : (counts[s] ?? 0) })}
                  </Button>
                ))}
              </div>

              {visible.length === 0 && searching ? (
                <EmptyState
                  icon={Search}
                  title={format(t.noMatchTitle, { q: query.trim() })}
                  description={filter === "all" ? t.noMatchAll : format(t.noMatchFiltered, { status: chipLabel(filter) })}
                  action={t.clearSearch}
                  onAction={clearSearch}
                />
              ) : visible.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">{format(t.noneWithStatus, { status: chipLabel(filter) })}</p>
                </Card>
              ) : (
                <>
                  {/* Computers: table */}
                  <Card className="hidden gap-0 py-0 lg:flex">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.colAnimal}</TableHead>
                          <TableHead>{t.colSpecies}</TableHead>
                          <TableHead>{t.colSex}</TableHead>
                          <TableHead>{t.colAge}</TableHead>
                          <TableHead>{t.colStatus}</TableHead>
                          <TableHead>{orgType === "shelter" ? t.colIntake : t.colOrigin}</TableHead>
                          <TableHead className="w-12">
                            <span className="sr-only">{t.colActions}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((a) => (
                          <TableRow key={a.pet_id}>
                            <TableCell>
                              <Link
                                href={`/ljubimci/${a.pet_id}`}
                                className="flex min-w-0 items-center gap-3 font-medium hover:underline"
                              >
                                <PetAvatar name={a.name} sex={a.sex as PetSex} species={avatarSpecies(a.species)} size="sm" />
                                <span className="truncate">{a.name}</span>
                              </Link>
                            </TableCell>
                            <TableCell>{speciesLabel(a, copy)}</TableCell>
                            <TableCell>{sexLabel(a, t)}</TableCell>
                            <TableCell>{ageLabel(a, today, copy.pet, locale)}</TableCell>
                            <TableCell>
                              <AnimalStatusBadge row={a} t={t} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{sinceLabel(a, t, locale)}</TableCell>
                            <TableCell>
                              <AnimalActions row={a} actions={rowActions} t={t} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>

                  {/* Phones and tablets: cards */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:hidden">
                    {visible.map((a) => (
                      <AnimalCard
                        key={a.pet_id}
                        row={a}
                        t={t}
                        copy={copy}
                        locale={locale}
                        today={today}
                        orgType={orgType}
                        actions={rowActions}
                      />
                    ))}
                  </div>

                  {visible.length < page.total && (
                    <div className="flex justify-center">
                      <Button variant="outline" className="h-11 md:h-9" onClick={() => void load({ offset: visible.length })}>
                        {t.loadMore}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="tim" className="mt-4 space-y-4">
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">{t.members}</h2>
              <span className="text-sm text-muted-foreground">
                {format(t.memberCount, { n: organisation.member_count, limit: organisation.member_limit })}
              </span>
            </div>
            <ul className="space-y-2">
              {org.team.map((m) => {
                const name = m.full_name || m.email
                return (
                  <li key={m.user_id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-medium text-foreground">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {format(t.memberSince, { email: m.email, date: formatDate(m.joined_at, locale) })}
                      </p>
                    </div>
                    <Badge
                      variant={m.role === "admin" ? "default" : "outline"}
                      className={cn(m.role !== "admin" && "bg-card")}
                    >
                      {m.role === "admin" ? t.roleAdmin : t.roleVolunteer}
                    </Badge>
                    {canManageTeam && m.role !== "admin" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={format(t.actionsFor, { name })}>
                            <MoreHorizontal className="size-5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => void teamAction(() => actions.changeMemberRole({ user_id: m.user_id, role: "admin" }))}
                          >
                            {t.makeAdmin}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => void teamAction(() => actions.removeMember({ user_id: m.user_id }))}
                          >
                            {t.removeFromTeam}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                )
              })}
              {org.pending_invitations.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-muted text-xs font-medium text-foreground">{initials(inv.email)}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {format(t.pendingInvitation, { email: inv.email, date: formatDate(inv.expires_at, locale) })}
                  </p>
                  <Badge variant="outline" className="bg-card">
                    {inv.role === "admin" ? t.roleAdmin : t.roleVolunteer}
                  </Badge>
                  {canManageTeam && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={format(t.actionsFor, { name: inv.email })}>
                          <MoreHorizontal className="size-5" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => void teamAction(() => actions.revokeInvitation({ invitation_id: inv.id }))}
                        >
                          {t.revokeInvitation}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>

      <IntakeDialog open={intakeOpen} onOpenChange={setIntakeOpen} today={today} copy={copy} onSave={saveIntake} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} copy={copy} onSend={sendInvite} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{format(t.deleteTitle, { name: deleteTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelDelete}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
