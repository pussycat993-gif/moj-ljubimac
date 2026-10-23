import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { checkGates } from "@/lib/server/gates"
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { getFileUrls } from "@/lib/actions/files"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import {
  CareLogClient,
  CareLogLoading,
  type CareKind,
  type CareLogCopy,
  type CareLogPage,
  type FeedingEntry,
  type FeedingInput,
  type MealSchedule,
  type MealScheduleInput,
  type StoolEntry,
  type StoolInput,
} from "./care-log-client"

// S07 Dnevnik ishrane i stolice · /ljubimci/[id]/dnevnik · EP-01 single-pet header (view:pet_summaries_api,
// id filter), EP-17 first pages (view:feeding_entries_api / view:stool_entries_api), EP-19 get
// (view:meal_schedules_api) and EP-43 (locale) on the server. The client pages, writes and saves the meal
// schedule through the server actions below; they run on the server because the session lives in httpOnly
// cookies (owner decision, Steps 13–17) and Step 20 has no lib/actions file (as in Step 18). The database
// enforces the rules (RLS on the care tables, care_check_write: member own entries only → forbidden_role,
// read-only household → household_read_only; the brand / note / amount checks; set_meal_schedule's role,
// memorial and schedule rules). No pet, or a pet without a care log (organisation animals) → ErrorState.

const PAGE_SIZE = 20
const FOOD_TYPES = ["dry", "wet", "treat", "home_made", "other"]
const CONSISTENCIES = ["normal", "soft", "diarrhoea", "hard"]

type Supabase = Awaited<ReturnType<typeof createClient>>
type Checked = { values: Record<string, unknown> } | { fields: Record<string, string> }

function copyFor(locale: Locale): CareLogCopy {
  const dict = getDictionary(locale)
  return { careLog: dict.careLog, pet: dict.pet, petForm: dict.petForm, common: dict.common }
}

/** EP-18 timestamp rule: a valid ISO timestamp, not more than 5 minutes in the future. */
function checkTimestamp(value: unknown): string | { code: string } {
  if (value === null || value === undefined || value === "") return { code: "required" }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return { code: "invalid" }
  if (Date.parse(value) > Date.now() + 5 * 60 * 1000) return { code: "out_of_range" }
  return new Date(value).toISOString()
}

function checkNote(input: Record<string, unknown>, fields: Record<string, string>, values: Record<string, unknown>) {
  const note = typeof input.note === "string" ? input.note.trim() : null
  if (note && note.length > 500) fields.note = "too_long"
  else values.note = note || null
}

/** EP-18 feeding Request rules → the column values, or the field error codes (API §7.1). */
function validateFeeding(input: Record<string, unknown>, { partial }: { partial: boolean }): Checked {
  const fields: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const has = (key: string) => !partial || key in input

  if (!partial) {
    if (typeof input.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required"
    else values.pet_id = input.pet_id
  }
  if (has("fed_at")) {
    const at = checkTimestamp(input.fed_at)
    if (typeof at === "string") values.fed_at = at
    else fields.fed_at = at.code
  }
  if (has("type")) {
    if (input.type === null || input.type === undefined || input.type === "") fields.type = "required"
    else if (!FOOD_TYPES.includes(input.type as string)) fields.type = "invalid"
    else values.type = input.type
  }
  if (has("brand")) {
    const brand = typeof input.brand === "string" ? input.brand.trim() : null
    if (brand && brand.length > 100) fields.brand = "too_long"
    else values.brand = brand || null
  }
  if (has("amount_g")) {
    const amount = input.amount_g
    if (amount === null || amount === undefined || amount === "") values.amount_g = null
    else if (typeof amount !== "number" || !Number.isFinite(amount)) fields.amount_g = "invalid"
    else if (amount <= 0 || amount >= 10_000_000) fields.amount_g = "out_of_range"
    else if (Math.round(amount * 10) / 10 !== amount) fields.amount_g = "invalid"
    else values.amount_g = amount
  }
  if (has("note")) checkNote(input, fields, values)
  return Object.keys(fields).length > 0 ? { fields } : { values }
}

/** EP-18 stool Request rules → the column values, or the field error codes (API §7.1). */
function validateStool(input: Record<string, unknown>, { partial }: { partial: boolean }): Checked {
  const fields: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const has = (key: string) => !partial || key in input

  if (!partial) {
    if (typeof input.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required"
    else values.pet_id = input.pet_id
  }
  if (has("observed_at")) {
    const at = checkTimestamp(input.observed_at)
    if (typeof at === "string") values.observed_at = at
    else fields.observed_at = at.code
  }
  if (has("consistency")) {
    if (input.consistency === null || input.consistency === undefined || input.consistency === "") {
      fields.consistency = "required"
    } else if (!CONSISTENCIES.includes(input.consistency as string)) fields.consistency = "invalid"
    else values.consistency = input.consistency
  }
  if (has("blood_or_mucus")) {
    const blood = input.blood_or_mucus
    if (blood === null || blood === undefined) values.blood_or_mucus = false
    else if (typeof blood !== "boolean") fields.blood_or_mucus = "invalid"
    else values.blood_or_mucus = blood
  }
  if (has("note")) checkNote(input, fields, values)
  return Object.keys(fields).length > 0 ? { fields } : { values }
}

const TABLES = { feeding: "feeding_entries", stool: "stool_entries" } as const
const VIEWS = { feeding: "feeding_entries_api", stool: "stool_entries_api" } as const
const ORDER = { feeding: "fed_at", stool: "observed_at" } as const

async function readEntry<T>(supabase: Supabase, kind: CareKind, id: string): Promise<ActionResult<T>> {
  const { data, error } = await supabase.from(VIEWS[kind]).select("*").eq("id", id).maybeSingle()
  if (error) return { ok: false, error: fromDatabaseError(error) }
  if (!data) return fail("not_found")
  return ok(data as unknown as T)
}

async function insertEntry<T>(kind: CareKind, input: unknown): Promise<ActionResult<T>> {
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  const validate = kind === "feeding" ? validateFeeding : validateStool
  const checked = validate((input ?? {}) as Record<string, unknown>, { partial: false })
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields })

  const { data, error } = await supabase
    .from(TABLES[kind])
    .insert(checked.values as never)
    .select("id")
    .single()
  if (error) {
    // RLS rejects an insert on a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found")
    return { ok: false, error: fromDatabaseError(error) }
  }
  return readEntry<T>(supabase, kind, data.id)
}

async function patchEntry<T>(kind: CareKind, id: string, input: unknown): Promise<ActionResult<T>> {
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  const body = (input ?? {}) as Record<string, unknown>
  if ("pet_id" in body) return fail("validation_failed", { fields: { pet_id: "invalid" } })
  const validate = kind === "feeding" ? validateFeeding : validateStool
  const checked = validate(body, { partial: true })
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields })

  const { data, error } = await supabase
    .from(TABLES[kind])
    .update(checked.values as never)
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, error: fromDatabaseError(error) }
  if (!data || data.length === 0) return fail("not_found")
  return readEntry<T>(supabase, kind, id)
}

/** EP-17 — one page of the Ishrana / Stolica list ("Učitaj još"). */
async function listEntries(input: {
  pet_id: string
  kind: CareKind
  offset: number
  limit?: number
}): Promise<ActionResult<CareLogPage<FeedingEntry> | CareLogPage<StoolEntry>>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "read" })
  if (!caller.ok) return caller

  const kind = input?.kind
  if (kind !== "feeding" && kind !== "stool") return fail("validation_failed", { fields: { kind: "invalid" } })
  const limit = input.limit ?? PAGE_SIZE
  const offset = input.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail("validation_failed", { fields: { limit: "out_of_range" } })
  if (!Number.isInteger(offset) || offset < 0) return fail("validation_failed", { fields: { offset: "out_of_range" } })

  const { data, error, count } = await supabase
    .from(VIEWS[kind])
    .select("*", { count: "exact" })
    .eq("pet_id", input.pet_id)
    .order(ORDER[kind], { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return { ok: false, error: fromDatabaseError(error) }
  return ok({ items: (data ?? []) as never[], total: count ?? 0 })
}

/** EP-18 feeding insert — "Dodaj obrok". */
async function createFeeding(input: FeedingInput): Promise<ActionResult<FeedingEntry>> {
  "use server"
  return insertEntry<FeedingEntry>("feeding", input)
}

/** EP-18 feeding update — the row menu "Izmeni". */
async function updateFeeding(id: string, input: Omit<FeedingInput, "pet_id">): Promise<ActionResult<FeedingEntry>> {
  "use server"
  return patchEntry<FeedingEntry>("feeding", id, input)
}

/** EP-18 stool insert — "Dodaj stolicu". */
async function createStool(input: StoolInput): Promise<ActionResult<StoolEntry>> {
  "use server"
  return insertEntry<StoolEntry>("stool", input)
}

/** EP-18 stool update — the row menu "Izmeni". */
async function updateStool(id: string, input: Omit<StoolInput, "pet_id">): Promise<ActionResult<StoolEntry>> {
  "use server"
  return patchEntry<StoolEntry>("stool", id, input)
}

/** EP-18 delete — the row menu "Obriši" → AlertDialog "Da, obriši". */
async function deleteEntry(kind: CareKind, id: string): Promise<ActionResult<{ id: string }>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  if (kind !== "feeding" && kind !== "stool") return fail("validation_failed", { fields: { kind: "invalid" } })
  const { data, error } = await supabase.from(TABLES[kind]).delete().eq("id", id).select("id")
  if (error) return { ok: false, error: fromDatabaseError(error) }
  if (!data || data.length === 0) return fail("not_found")
  return ok({ id: data[0].id })
}

/** EP-19 set — rpc:set_meal_schedule ("Sačuvaj podsetnike"); field codes travel in the error DETAIL. */
async function setMealSchedule(input: MealScheduleInput): Promise<ActionResult<MealSchedule>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  const times = input?.meal_times
  const weekdays = input?.meal_weekdays ?? []
  if (!Array.isArray(times)) return fail("validation_failed", { fields: { p_meal_times: "required" } })
  if (times.some((t) => typeof t !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
    return fail("validation_failed", { fields: { p_meal_times: "invalid" } })
  }
  if (!Array.isArray(weekdays) || weekdays.some((d) => !Number.isInteger(d))) {
    return fail("validation_failed", { fields: { p_meal_weekdays: "invalid" } })
  }

  const { data, error } = await supabase.rpc("set_meal_schedule", {
    p_pet_id: input.pet_id,
    p_meal_times: times,
    p_meal_weekdays: weekdays,
  })
  if (error) {
    const mapped: ApiError = fromDatabaseError(error)
    if (mapped.code === "validation_failed" && error.details) {
      const [field, code] = error.details.split(":")
      if (field && code) mapped.fields = { [field]: code }
    }
    return { ok: false, error: mapped }
  }
  return ok(data as unknown as MealSchedule)
}

const actions = {
  listEntries,
  createFeeding,
  updateFeeding,
  createStool,
  updateStool,
  deleteEntry,
  setMealSchedule,
}

async function CareLogView({ id, locale }: { id: string; locale: Locale }) {
  const supabase = await createClient()
  const firstPage = (kind: CareKind) =>
    supabase
      .from(VIEWS[kind])
      .select("*", { count: "exact" })
      .eq("pet_id", id)
      .order(ORDER[kind], { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1)
  const [pets, feeding, stool, meal] = await Promise.all([
    supabase.from("pet_summaries_api").select("*").eq("id", id),
    firstPage("feeding"),
    firstPage("stool"),
    supabase.from("meal_schedules_api").select("*").eq("pet_id", id),
  ])
  for (const [name, result] of [
    ["pet_summaries_api", pets],
    ["feeding_entries_api", feeding],
    ["stool_entries_api", stool],
    ["meal_schedules_api", meal],
  ] as const) {
    if (result.error) console.error(`[ljubimci/[id]/dnevnik] ${name}:`, result.error.message)
  }

  const copy = copyFor(locale)
  const pet = ((pets.data ?? []) as unknown as PetSummary[])[0]
  // The care log is personal: only the owner and household members have one (EP-17).
  const hasCareLog = pet && (pet.access.role === "owner" || pet.access.role === "member")
  if (pets.error || feeding.error || stool.error || meal.error || !hasCareLog) {
    return <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} />
  }

  let photoUrl: string | undefined
  if (pet.has_photo) {
    const urls = await getFileUrls({ items: [{ kind: "pet_photo", id: pet.id }] }).catch(() => null)
    photoUrl = urls?.ok ? (urls.data[0]?.url ?? undefined) : undefined
  }

  return (
    <CareLogClient
      pet={pet}
      photoUrl={photoUrl}
      feeding={{ items: (feeding.data ?? []) as unknown as FeedingEntry[], total: feeding.count ?? 0 }}
      stool={{ items: (stool.data ?? []) as unknown as StoolEntry[], total: stool.count ?? 0 }}
      schedule={((meal.data ?? []) as unknown as MealSchedule[])[0] ?? null}
      now={new Date().toISOString()}
      locale={locale}
      copy={copy}
      actions={actions}
    />
  )
}

export default async function CareLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[ljubimci/[id]/dnevnik] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<CareLogLoading copy={copyFor(locale)} />}>
      <CareLogView id={id} locale={locale} />
    </Suspense>
  )
}
