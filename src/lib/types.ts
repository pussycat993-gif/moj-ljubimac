/** Centralni model podataka aplikacije. Sve datume čuvamo kao ISO stringove. */

export type Sex = 'f' | 'm';
export type Species = 'pas' | 'macka' | 'drugo';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  /** Datum rođenja, ISO (YYYY-MM-DD) */
  dob: string;
  microchip?: string;
  neutered?: boolean;
  photoUri?: string;
  /** ID zakazane rođendanske notifikacije, da bismo je mogli otkazati */
  birthdayNotifId?: string;
  createdAt: string;
}

export interface WeightEntry {
  id: string;
  petId: string;
  dateISO: string;
  kg: number;
}

export interface Vaccination {
  id: string;
  petId: string;
  name: string;
  dateISO: string;
  validUntilISO?: string;
  clinic?: string;
  notes?: string;
}

export interface Medication {
  id: string;
  petId: string;
  name: string;
  dose?: string;
  /** Interval ponavljanja u danima (npr. Bravecto = 84) */
  intervalDays?: number;
  lastGivenISO?: string;
  active: boolean;
  notes?: string;
  notifId?: string;
}

export type AttachmentKind = 'image' | 'pdf';

export interface Attachment {
  id: string;
  name: string;
  uri: string;
  kind: AttachmentKind;
}

export interface Checkup {
  id: string;
  petId: string;
  title: string;
  dateISO: string;
  vet?: string;
  notes?: string;
  attachments: Attachment[];
}

export interface FoodProfile {
  petId: string;
  brand?: string;
  dailyGrams?: number;
  notes?: string;
  photoUri?: string;
}

export type StoolQuality = 'odlicna' | 'normalna' | 'meka' | 'problem';

export interface StoolEntry {
  id: string;
  petId: string;
  dateISO: string;
  quality: StoolQuality;
}

export interface Milestone {
  id: string;
  petId: string;
  dateISO: string;
  title: string;
  description?: string;
  photoUri?: string;
}

export interface Reminder {
  id: string;
  petId: string;
  title: string;
  /** Datum i vreme podsetnika, pun ISO */
  dateISO: string;
  notifId?: string;
  done: boolean;
}

export const STOOL_LABEL: Record<StoolQuality, string> = {
  odlicna: 'odlična',
  normalna: 'normalna',
  meka: 'meka',
  problem: 'problem',
};

export const STOOL_EMOJI: Record<StoolQuality, string> = {
  odlicna: '👌',
  normalna: '🙂',
  meka: '😕',
  problem: '⚠️',
};

export const SPECIES_LABEL: Record<Species, string> = {
  pas: 'Pas',
  macka: 'Mačka',
  drugo: 'Drugo',
};
