/** Pomoćne funkcije za datume — ručno formatiranje na srpskom, bez oslanjanja na Intl. */

const MONTHS = [
  'januar', 'februar', 'mart', 'april', 'maj', 'jun',
  'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar',
];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  return new Date(iso);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`;
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = `${d.getHours()}`.padStart(2, '0');
  const min = `${d.getMinutes()}`.padStart(2, '0');
  return `${formatDateShort(iso)} u ${h}:${min}`;
}

/** „3 god i 4 mes" — starost od datuma rođenja. */
export function ageString(dobISO: string): string {
  const dob = new Date(dobISO);
  const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob > now) return '';
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return months <= 0 ? 'manje od mesec dana' : `${months} mes`;
  return months === 0 ? `${years} god` : `${years} god i ${months} mes`;
}

/** Sledeći rođendan u 09:00 lokalno. */
export function nextBirthday(dobISO: string, from: Date = new Date()): Date {
  const dob = new Date(dobISO);
  const next = new Date(from.getFullYear(), dob.getMonth(), dob.getDate(), 9, 0, 0);
  if (next <= from) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function daysUntilBirthday(dobISO: string): number {
  const next = nextBirthday(dobISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(next);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Relativna oznaka za podsetnike: „danas", „za 5 dana", „pre 2 dana". */
export function relativeDays(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return 'danas';
  if (d === 1) return 'sutra';
  if (d > 1) return `za ${d} dana`;
  if (d === -1) return 'juče';
  return `pre ${Math.abs(d)} dana`;
}
