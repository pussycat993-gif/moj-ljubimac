import { getSession, isCloudConfigured, supabase } from './supabase';
import { useApp } from './store';
import type {
  Checkup,
  FoodProfile,
  Medication,
  Milestone,
  Pet,
  Reminder,
  StoolEntry,
  Vaccination,
  WeightEntry,
} from './types';

/**
 * Sinhronizacija lokalnog store-a sa Supabase-om (deljenje profila u okviru „household"-a).
 *
 * OBIM (Foundation):
 * - Čitanje: pull svih redova + realtime osvežavanje (izvor istine je cloud).
 * - Pisanje: upsert lokalnih redova (write-through, debounce-ovan).
 *
 * POZNATA OGRANIČENJA (sledeći korak):
 * - Brisanja se ne prenose na cloud (upsert ne briše). Treba soft-delete ili diff.
 * - Fotografije/prilozi su lokalni URI-jevi uređaja — metapodaci se sinhronizuju,
 *   ali sami fajlovi ne (za to treba Supabase Storage).
 */

// ---------- Mapiranje TS tipova <-> redovi tabela (snake_case) ----------

interface PetRow {
  id: string; household_id: string; name: string; species: string; breed: string;
  sex: string; dob: string; microchip: string | null; neutered: boolean | null;
  photo_uri: string | null; created_at: string;
}
interface WeightRow { id: string; household_id: string; pet_id: string; date_iso: string; kg: number; }
interface VaxRow {
  id: string; household_id: string; pet_id: string; name: string; date_iso: string;
  valid_until_iso: string | null; clinic: string | null; notes: string | null;
}
interface MedRow {
  id: string; household_id: string; pet_id: string; name: string; dose: string | null;
  interval_days: number | null; last_given_iso: string | null; active: boolean; notes: string | null;
}
interface CheckupRow {
  id: string; household_id: string; pet_id: string; title: string; date_iso: string;
  vet: string | null; notes: string | null; attachments: Checkup['attachments'];
}
interface FoodRow {
  pet_id: string; household_id: string; brand: string | null; daily_grams: number | null;
  notes: string | null; photo_uri: string | null;
}
interface StoolRow { id: string; household_id: string; pet_id: string; date_iso: string; quality: string; }
interface MilestoneRow {
  id: string; household_id: string; pet_id: string; date_iso: string; title: string;
  description: string | null; photo_uri: string | null;
}
interface ReminderRow {
  id: string; household_id: string; pet_id: string; title: string; date_iso: string; done: boolean;
}

const petToRow = (h: string) => (p: Pet): PetRow => ({
  id: p.id, household_id: h, name: p.name, species: p.species, breed: p.breed, sex: p.sex,
  dob: p.dob, microchip: p.microchip ?? null, neutered: p.neutered ?? null,
  photo_uri: p.photoUri ?? null, created_at: p.createdAt,
});
const rowToPet = (r: PetRow): Pet => ({
  id: r.id, name: r.name, species: r.species as Pet['species'], breed: r.breed,
  sex: r.sex as Pet['sex'], dob: r.dob, microchip: r.microchip ?? undefined,
  neutered: r.neutered ?? undefined, photoUri: r.photo_uri ?? undefined, createdAt: r.created_at,
});

const weightToRow = (h: string) => (w: WeightEntry): WeightRow => ({
  id: w.id, household_id: h, pet_id: w.petId, date_iso: w.dateISO, kg: w.kg,
});
const rowToWeight = (r: WeightRow): WeightEntry => ({
  id: r.id, petId: r.pet_id, dateISO: r.date_iso, kg: r.kg,
});

const vaxToRow = (h: string) => (v: Vaccination): VaxRow => ({
  id: v.id, household_id: h, pet_id: v.petId, name: v.name, date_iso: v.dateISO,
  valid_until_iso: v.validUntilISO ?? null, clinic: v.clinic ?? null, notes: v.notes ?? null,
});
const rowToVax = (r: VaxRow): Vaccination => ({
  id: r.id, petId: r.pet_id, name: r.name, dateISO: r.date_iso,
  validUntilISO: r.valid_until_iso ?? undefined, clinic: r.clinic ?? undefined, notes: r.notes ?? undefined,
});

const medToRow = (h: string) => (m: Medication): MedRow => ({
  id: m.id, household_id: h, pet_id: m.petId, name: m.name, dose: m.dose ?? null,
  interval_days: m.intervalDays ?? null, last_given_iso: m.lastGivenISO ?? null,
  active: m.active, notes: m.notes ?? null,
});
const rowToMed = (r: MedRow): Medication => ({
  id: r.id, petId: r.pet_id, name: r.name, dose: r.dose ?? undefined,
  intervalDays: r.interval_days ?? undefined, lastGivenISO: r.last_given_iso ?? undefined,
  active: r.active, notes: r.notes ?? undefined,
});

const checkupToRow = (h: string) => (c: Checkup): CheckupRow => ({
  id: c.id, household_id: h, pet_id: c.petId, title: c.title, date_iso: c.dateISO,
  vet: c.vet ?? null, notes: c.notes ?? null, attachments: c.attachments,
});
const rowToCheckup = (r: CheckupRow): Checkup => ({
  id: r.id, petId: r.pet_id, title: r.title, dateISO: r.date_iso, vet: r.vet ?? undefined,
  notes: r.notes ?? undefined, attachments: r.attachments ?? [],
});

const foodToRow = (h: string) => (f: FoodProfile): FoodRow => ({
  pet_id: f.petId, household_id: h, brand: f.brand ?? null, daily_grams: f.dailyGrams ?? null,
  notes: f.notes ?? null, photo_uri: f.photoUri ?? null,
});
const rowToFood = (r: FoodRow): FoodProfile => ({
  petId: r.pet_id, brand: r.brand ?? undefined, dailyGrams: r.daily_grams ?? undefined,
  notes: r.notes ?? undefined, photoUri: r.photo_uri ?? undefined,
});

const stoolToRow = (h: string) => (s: StoolEntry): StoolRow => ({
  id: s.id, household_id: h, pet_id: s.petId, date_iso: s.dateISO, quality: s.quality,
});
const rowToStool = (r: StoolRow): StoolEntry => ({
  id: r.id, petId: r.pet_id, dateISO: r.date_iso, quality: r.quality as StoolEntry['quality'],
});

const milestoneToRow = (h: string) => (m: Milestone): MilestoneRow => ({
  id: m.id, household_id: h, pet_id: m.petId, date_iso: m.dateISO, title: m.title,
  description: m.description ?? null, photo_uri: m.photoUri ?? null,
});
const rowToMilestone = (r: MilestoneRow): Milestone => ({
  id: r.id, petId: r.pet_id, dateISO: r.date_iso, title: r.title,
  description: r.description ?? undefined, photoUri: r.photo_uri ?? undefined,
});

const reminderToRow = (h: string) => (r: Reminder): ReminderRow => ({
  id: r.id, household_id: h, pet_id: r.petId, title: r.title, date_iso: r.dateISO, done: r.done,
});
const rowToReminder = (r: ReminderRow): Reminder => ({
  id: r.id, petId: r.pet_id, title: r.title, dateISO: r.date_iso, done: r.done,
});

// ---------- Household ----------

async function ensureHousehold(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data: mem } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (mem?.household_id) return mem.household_id as string;

  const { data: h, error } = await supabase
    .from('households')
    .insert({ name: 'Moja porodica', created_by: userId })
    .select('id')
    .single();
  if (error || !h) return null;

  await supabase
    .from('household_members')
    .insert({ household_id: h.id, user_id: userId, role: 'owner' });
  return h.id as string;
}

// ---------- Push / Pull ----------

async function pushLocal(hid: string): Promise<void> {
  if (!supabase) return;
  const s = useApp.getState();
  // Pets prvi (deca imaju FK na pets.id), pa ostalo paralelno.
  await supabase.from('pets').upsert(s.pets.map(petToRow(hid)));
  await Promise.all([
    supabase.from('weights').upsert(s.weights.map(weightToRow(hid))),
    supabase.from('vaccinations').upsert(s.vaccinations.map(vaxToRow(hid))),
    supabase.from('medications').upsert(s.medications.map(medToRow(hid))),
    supabase.from('checkups').upsert(s.checkups.map(checkupToRow(hid))),
    supabase.from('food_profiles').upsert(s.foodProfiles.map(foodToRow(hid))),
    supabase.from('stools').upsert(s.stools.map(stoolToRow(hid))),
    supabase.from('milestones').upsert(s.milestones.map(milestoneToRow(hid))),
    supabase.from('reminders').upsert(s.reminders.map(reminderToRow(hid))),
  ]);
}

type StoreState = ReturnType<typeof useApp.getState>;

/**
 * Prenosi na cloud TAČNO one zapise koje je korisnik lokalno obrisao (diff prev->next).
 * Precizno (ne "mirror svega") da push sa zastarelog uređaja ne bi obrisao tuđe nove zapise.
 */
async function propagateDeletes(prev: StoreState, next: StoreState): Promise<void> {
  if (!supabase || !householdId) return;
  const sb = supabase;
  const hid = householdId;
  const jobs: PromiseLike<unknown>[] = [];
  const del = <T,>(table: string, col: string, before: T[], after: T[], key: (x: T) => string) => {
    const keep = new Set(after.map(key));
    const ids = before.filter((x) => !keep.has(key(x))).map(key);
    if (ids.length) jobs.push(sb.from(table).delete().eq('household_id', hid).in(col, ids));
  };
  del('pets', 'id', prev.pets, next.pets, (p) => p.id);
  del('weights', 'id', prev.weights, next.weights, (w) => w.id);
  del('vaccinations', 'id', prev.vaccinations, next.vaccinations, (v) => v.id);
  del('medications', 'id', prev.medications, next.medications, (m) => m.id);
  del('checkups', 'id', prev.checkups, next.checkups, (c) => c.id);
  del('food_profiles', 'pet_id', prev.foodProfiles, next.foodProfiles, (f) => f.petId);
  del('stools', 'id', prev.stools, next.stools, (s) => s.id);
  del('milestones', 'id', prev.milestones, next.milestones, (m) => m.id);
  del('reminders', 'id', prev.reminders, next.reminders, (r) => r.id);
  await Promise.all(jobs);
}

async function pullAll(hid: string): Promise<void> {
  if (!supabase) return;
  const sb = supabase; // lokalni alias — TS zadržava narrowing u ugnježdenim funkcijama
  const q = <T,>(table: string) =>
    sb.from(table).select('*').eq('household_id', hid).then((r) => (r.data ?? []) as T[]);

  const [pets, weights, vaccinations, medications, checkups, food, stools, milestones, reminders] =
    await Promise.all([
      q<PetRow>('pets'),
      q<WeightRow>('weights'),
      q<VaxRow>('vaccinations'),
      q<MedRow>('medications'),
      q<CheckupRow>('checkups'),
      q<FoodRow>('food_profiles'),
      q<StoolRow>('stools'),
      q<MilestoneRow>('milestones'),
      q<ReminderRow>('reminders'),
    ]);

  // notifId / birthdayNotifId su lokalni za uređaj (nisu kolone) — sačuvaj ih pri pull-u,
  // inače bi zakazane notifikacije ostale "siročići" bez ID-a za otkazivanje.
  const prev = useApp.getState();
  const petNotif = new Map(prev.pets.map((p) => [p.id, p.birthdayNotifId]));
  const medNotif = new Map(prev.medications.map((m) => [m.id, m.notifId]));
  const remNotif = new Map(prev.reminders.map((r) => [r.id, r.notifId]));

  // setState je sinhron: subscribe listener vidi applyingRemote=true i preskače push.
  applyingRemote = true;
  useApp.setState({
    pets: pets.map((r) => ({ ...rowToPet(r), birthdayNotifId: petNotif.get(r.id) })),
    weights: weights.map(rowToWeight),
    vaccinations: vaccinations.map(rowToVax),
    medications: medications.map((r) => ({ ...rowToMed(r), notifId: medNotif.get(r.id) })),
    checkups: checkups.map(rowToCheckup),
    foodProfiles: food.map(rowToFood),
    stools: stools.map(rowToStool),
    milestones: milestones.map(rowToMilestone),
    reminders: reminders.map((r) => ({ ...rowToReminder(r), notifId: remNotif.get(r.id) })),
  });
  applyingRemote = false;
}

async function cloudIsEmpty(hid: string): Promise<boolean> {
  if (!supabase) return true;
  const { count } = await supabase
    .from('pets')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', hid);
  return (count ?? 0) === 0;
}

// ---------- Realtime + orchestracija ----------

let householdId: string | null = null;
let unsubRealtime: (() => void) | null = null;
let unsubStore: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
// Dok primenjujemo podatke iz cloud-a, ne guramo ih nazad (izbegava petlju pull->push->realtime->pull).
let applyingRemote = false;
// Sprečava preklapanje dva startSync poziva (mount + INITIAL_SESSION event).
let starting = false;
// Korisnik za koga je sync već aktivan — da TOKEN_REFRESHED ne pokreće pun re-sync svaki put.
let syncedUserId: string | null = null;

function subscribeRealtime(hid: string): () => void {
  if (!supabase) return () => {};
  const sb = supabase; // lokalni alias za korišćenje u cleanup closure-u
  // Za MVP: na bilo koju promenu u shemi ponovo povuci sve (mali skup podataka).
  const channel = sb
    .channel(`household-${hid}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      pullAll(hid);
    })
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

function schedulePush(): void {
  if (!householdId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (householdId) pushLocal(householdId);
  }, 1500);
}

/** Pokreće sinhronizaciju ako je cloud konfigurisan i korisnik prijavljen. */
export async function startSync(): Promise<void> {
  if (!isCloudConfigured() || !supabase) return;
  if (starting) return;
  starting = true;
  try {
    const session = await getSession();
    if (!session) return;
    // Već sinhronizovano za istog korisnika (npr. TOKEN_REFRESHED) — ne ponavljaj pun sync.
    if (householdId && syncedUserId === session.user.id) return;

    const hid = await ensureHousehold(session.user.id);
    if (!hid) return;

    // Očisti prethodne pretplate PRE nego što postavimo householdId (stopSync ga nulira).
    stopSync();
    householdId = hid;

    // Prvi put: ako je cloud prazan, ubaci lokalne podatke; zatim cloud postaje izvor istine.
    if (await cloudIsEmpty(hid)) await pushLocal(hid);
    await pullAll(hid);

    unsubRealtime = subscribeRealtime(hid);
    unsubStore = useApp.subscribe((nextState, prevState) => {
      if (applyingRemote) return;
      propagateDeletes(prevState, nextState);
      schedulePush();
    });
    syncedUserId = session.user.id;
  } finally {
    starting = false;
  }
}

/** Zaustavlja sinhronizaciju (npr. pri odjavi). */
export function stopSync(): void {
  unsubRealtime?.();
  unsubStore?.();
  unsubRealtime = null;
  unsubStore = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  householdId = null;
  syncedUserId = null;
}
