"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, CalendarDays, FileText, ImageIcon, Paperclip, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { PetAvatar } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "D" | "X" | "G"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Podrazumevano" },
  { value: "X", label: "Greška" },
  { value: "G", label: "Premium zaključano" },
]

const FREE_LIMIT = 10
const MAX_BYTES = 10 * 1024 * 1024

const monthNames = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
]
const weekdayNames = ["ne", "po", "ut", "sr", "če", "pe", "su"]

function formatDate(d: Date) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}

function DateField({
  id,
  label,
  value,
  onChange,
  helper,
  error,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
  error?: string
}) {
  const describedBy = [helper ? `${id}-pomoc` : "", error ? `${id}-greska` : ""].filter(Boolean).join(" ") || undefined
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={cn("h-11 w-full justify-start font-normal md:h-9", !value && "text-muted-foreground")}
          >
            <CalendarDays className="size-4" aria-hidden />
            {value ? formatDate(value) : "Izaberi datum"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            weekStartsOn={1}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
          />
        </PopoverContent>
      </Popover>
      {helper && (
        <p id={`${id}-pomoc`} className="flex items-center gap-1 text-sm text-muted-foreground">
          <Bell className="size-3.5 shrink-0" aria-hidden />
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-greska`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

type Attachment = { id: string; name: string; kind: "pdf" | "image"; bytes: number }

type FormData = {
  date?: Date
  clinic: string
  reason: string
  findings: string
  recommendations: string
  cost: string
  checkup?: Date
}

type Errors = Partial<Record<"date" | "reason" | "cost" | "checkup", string>>

const defaultForm: FormData = {
  date: new Date(2026, 9, 19),
  clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  reason: "Kontrola očiju",
  findings: "Konjunktivitis se povukao, oko čisto.",
  recommendations: "Završiti Tobrex kapi do 25. 10. 2026.",
  cost: "1.500",
  checkup: undefined,
}

const errorForm: FormData = {
  date: undefined,
  clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  reason: "",
  findings: "",
  recommendations: "",
  cost: "1500 dinara",
  checkup: undefined,
}

const defaultFiles: Attachment[] = [
  { id: "a1", name: "nalaz-kontrola-oka-19-10-2026.pdf", kind: "pdf", bytes: 860_000 },
  { id: "a2", name: "luna-levo-oko.jpg", kind: "image", bytes: 2_400_000 },
]

function validate(f: FormData): Errors {
  const e: Errors = {}
  if (!f.date) e.date = "Izaberi datum pregleda."
  if (!f.reason.trim()) e.reason = "Upiši razlog pregleda."
  if (f.cost.trim() && !/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(f.cost.trim()))
    e.cost = "Upiši samo iznos u dinarima, npr. 2.990."
  if (f.date && f.checkup && f.checkup <= f.date) e.checkup = "Kontrola mora biti posle datuma pregleda."
  return e
}

export default function VetVisitFormScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [form, setForm] = useState<FormData>(defaultForm)
  const [errors, setErrors] = useState<Errors>({})
  const [files, setFiles] = useState<Attachment[]>(defaultFiles)
  const [existingOnPet, setExistingOnPet] = useState(5)
  const [fileError, setFileError] = useState("")
  const [limitHit, setLimitHit] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saved, setSaved] = useState("")

  const isFree = true // Ivana is on the Free plan in every state of this mock
  const total = existingOnPet + files.length

  function changeView(v: ViewState) {
    setView(v)
    setSaved("")
    if (v === "D") {
      setForm(defaultForm)
      setErrors({})
      setFiles(defaultFiles)
      setExistingOnPet(5)
      setFileError("")
      setLimitHit(false)
      setSaveFailed(false)
    } else if (v === "X") {
      setForm(errorForm)
      setErrors(validate(errorForm))
      setFiles([])
      setExistingOnPet(5)
      setFileError("luna-video.mp4 nije podržan. Dodaj sliku (JPG, PNG) ili PDF do 10 MB.")
      setLimitHit(false)
      setSaveFailed(true)
    } else {
      setForm(defaultForm)
      setErrors({})
      setFiles(defaultFiles)
      setExistingOnPet(8)
      setFileError("")
      setLimitHit(true)
      setSaveFailed(false)
    }
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onFiles(ev: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files ?? [])
    ev.target.value = ""
    let count = total
    const accepted: Attachment[] = []
    let error = ""
    for (const f of picked) {
      const isPdf = f.type === "application/pdf"
      const isImage = f.type.startsWith("image/")
      if (!isPdf && !isImage) {
        error = `${f.name} nije podržan. Dodaj sliku (JPG, PNG) ili PDF do 10 MB.`
        continue
      }
      if (f.size > MAX_BYTES) {
        error = `${f.name} ima ${formatSize(f.size)}. Najveća dozvoljena veličina je 10 MB.`
        continue
      }
      if (isFree && count >= FREE_LIMIT) {
        setLimitHit(true)
        break
      }
      accepted.push({ id: `${f.name}-${count}`, name: f.name, kind: isPdf ? "pdf" : "image", bytes: f.size })
      count += 1
    }
    setFileError(error)
    if (accepted.length) setFiles((list) => [...list, ...accepted])
  }

  function removeFile(id: string) {
    setFiles((list) => list.filter((f) => f.id !== id))
    setLimitHit(false)
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length > 0) {
      setSaved("")
      return
    }
    setSaveFailed(false)
    setSaved(
      form.checkup
        ? `Pregled sačuvan. Podsetićemo te na kontrolu ${formatDate(form.checkup)}.`
        : "Pregled sačuvan.",
    )
  }

  return (
    <AppShell variant="owner" active="ljubimci">
      <StateSwitcher states={states} value={view} onChange={changeView} />

      <div data-pet-sex="female" className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link href="/ljubimci/luna">
              <ArrowLeft className="size-4" aria-hidden />
              Nazad na karton
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <PetAvatar name="Luna" sex="female" species="cat" size="md" ring />
            <div className="min-w-0">
              <h1 className="font-heading text-[28px] leading-9 font-bold">Novi pregled</h1>
              <p className="truncate text-sm text-pet-accent">Luna · Mačka · Britanska kratkodlaka</p>
            </div>
          </div>
        </div>

        {saveFailed && (
          <ErrorState
            message="Nismo uspeli da sačuvamo pregled. Proveri označena polja i pokušaj ponovo."
            onRetry={() => setSaveFailed(false)}
          />
        )}

        <form noValidate onSubmit={submit} className="space-y-6">
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Pregled</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DateField
                id="pregled-datum"
                label="Datum *"
                value={form.date}
                onChange={(d) => {
                  set("date", d)
                  setErrors((prev) => ({ ...prev, date: undefined }))
                }}
                error={errors.date}
              />
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pregled-ambulanta">Ambulanta ili veterinar</Label>
                <Input
                  id="pregled-ambulanta"
                  className="h-11 md:h-9"
                  value={form.clinic}
                  onChange={(e) => set("clinic", e.target.value)}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="pregled-razlog">Razlog *</Label>
              <Input
                id="pregled-razlog"
                className="h-11 md:h-9"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
                onBlur={() => setErrors((prev) => ({ ...prev, reason: validate(form).reason }))}
                aria-invalid={!!errors.reason}
                aria-describedby={errors.reason ? "pregled-razlog-greska" : undefined}
                placeholder="npr. godišnji pregled"
              />
              {errors.reason && (
                <p id="pregled-razlog-greska" className="text-sm text-destructive">
                  {errors.reason}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pregled-nalaz">Nalaz i dijagnoza</Label>
              <Textarea id="pregled-nalaz" value={form.findings} onChange={(e) => set("findings", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pregled-preporuke">Preporuke</Label>
              <Textarea
                id="pregled-preporuke"
                value={form.recommendations}
                onChange={(e) => set("recommendations", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pregled-cena">Cena (RSD)</Label>
                <Input
                  id="pregled-cena"
                  inputMode="decimal"
                  className="h-11 md:h-9"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  onBlur={() => setErrors((prev) => ({ ...prev, cost: validate(form).cost }))}
                  aria-invalid={!!errors.cost}
                  aria-describedby={errors.cost ? "pregled-cena-greska" : undefined}
                  placeholder="npr. 2.990"
                />
                {errors.cost && (
                  <p id="pregled-cena-greska" className="text-sm text-destructive">
                    {errors.cost}
                  </p>
                )}
              </div>
              <DateField
                id="pregled-kontrola"
                label="Datum kontrole"
                value={form.checkup}
                onChange={(d) => {
                  set("checkup", d)
                  setErrors((prev) => ({ ...prev, checkup: undefined }))
                }}
                helper="Napravićemo podsetnik."
                error={errors.checkup}
              />
            </div>
          </Card>

          {/* Attachments */}
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">Prilozi</h2>
              {isFree && (
                <Badge variant="secondary" aria-live="polite">
                  {total} / {FREE_LIMIT} priloga
                </Badge>
              )}
            </div>
            {isFree && (
              <div className="space-y-1">
                <Progress value={(total / FREE_LIMIT) * 100} aria-label={`Iskorišćeno ${total} od ${FREE_LIMIT} priloga`} />
                <p className="text-xs font-medium text-muted-foreground">
                  Free plan: do {FREE_LIMIT} priloga po ljubimcu. Luna već ima {existingOnPet} na drugim pregledima.
                </p>
              </div>
            )}

            {files.length > 0 && (
              <ul className="space-y-2" aria-label="Dodati prilozi">
                {files.map((f) => {
                  const Icon = f.kind === "pdf" ? FileText : ImageIcon
                  return (
                    <li key={f.id} className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
                      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatSize(f.bytes)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 md:size-9"
                        aria-label={`Ukloni ${f.name}`}
                        onClick={() => removeFile(f.id)}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {limitHit ? (
              <PremiumLock description="Na Free planu možeš da sačuvaš 10 priloga po ljubimcu. Premium nema ograničenje — čuvaj sve nalaze i snimke." />
            ) : (
              <div className="space-y-2">
                <div className="rounded-sm border border-dashed border-border p-6 text-center focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <input
                    id="prilozi"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={onFiles}
                    aria-describedby={fileError ? "prilozi-pomoc prilozi-greska" : "prilozi-pomoc"}
                    aria-invalid={!!fileError}
                  />
                  <Label htmlFor="prilozi" className="flex cursor-pointer flex-col items-center gap-2">
                    <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
                      <Paperclip className="size-5 text-muted-foreground" aria-hidden />
                    </span>
                    <span className="text-sm font-medium">Dodaj slike ili PDF</span>
                  </Label>
                  <p id="prilozi-pomoc" className="mt-1 text-sm text-muted-foreground">
                    JPG, PNG ili PDF, do 10 MB po fajlu.
                  </p>
                </div>
                {fileError && (
                  <p id="prilozi-greska" className="text-sm text-destructive">
                    {fileError}
                  </p>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline" className="h-11 md:h-9">
              <Link href="/ljubimci/luna">Otkaži</Link>
            </Button>
            <Button type="submit" className="h-11 md:h-9">
              Sačuvaj pregled
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground sm:text-right">
            {saved}
          </p>
        </form>
      </div>
    </AppShell>
  )
}
