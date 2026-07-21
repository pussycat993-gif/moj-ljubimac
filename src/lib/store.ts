import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { toISODate } from './dates';
import { newId } from './id';
import type {
  Checkup,
  FoodProfile,
  Medication,
  Milestone,
  Pet,
  Reminder,
  StoolEntry,
  StoolQuality,
  Vaccination,
  WeightEntry,
} from './types';

/** Besplatan paket dozvoljava jednog ljubimca; Premium neograničeno. */
export const FREE_PET_LIMIT = 1;

interface AppState {
  pets: Pet[];
  activePetId: string | null;
  weights: WeightEntry[];
  vaccinations: Vaccination[];
  medications: Medication[];
  checkups: Checkup[];
  foodProfiles: FoodProfile[];
  stools: StoolEntry[];
  milestones: Milestone[];
  reminders: Reminder[];
  premium: boolean;
  seeded: boolean;

  setActivePet: (id: string) => void;
  addPet: (pet: Omit<Pet, 'id' | 'createdAt'>) => Pet;
  updatePet: (id: string, patch: Partial<Pet>) => void;
  deletePet: (id: string) => void;

  addWeight: (petId: string, kg: number, dateISO: string) => void;
  addVaccination: (v: Omit<Vaccination, 'id'>) => void;
  deleteVaccination: (id: string) => void;
  addMedication: (m: Omit<Medication, 'id'>) => void;
  updateMedication: (id: string, patch: Partial<Medication>) => void;
  deleteMedication: (id: string) => void;
  addCheckup: (c: Omit<Checkup, 'id'>) => void;
  deleteCheckup: (id: string) => void;
  setFoodProfile: (p: FoodProfile) => void;
  addStool: (petId: string, quality: StoolQuality) => void;
  addMilestone: (m: Omit<Milestone, 'id'>) => Milestone;
  deleteMilestone: (id: string) => void;
  addReminder: (r: Omit<Reminder, 'id' | 'done'>) => void;
  completeReminder: (id: string) => void;
  deleteReminder: (id: string) => void;

  setPremium: (v: boolean) => void;
  seedIfEmpty: () => void;
}

const notPet = (petId: string) => (x: { petId: string }) => x.petId !== petId;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      pets: [],
      activePetId: null,
      weights: [],
      vaccinations: [],
      medications: [],
      checkups: [],
      foodProfiles: [],
      stools: [],
      milestones: [],
      reminders: [],
      premium: false,
      seeded: false,

      setActivePet: (id) => set({ activePetId: id }),

      addPet: (pet) => {
        const full: Pet = { ...pet, id: newId(), createdAt: new Date().toISOString() };
        set((s) => ({ pets: [...s.pets, full], activePetId: full.id }));
        return full;
      },

      updatePet: (id, patch) =>
        set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

      /** Brisanje ljubimca briše i sve njegove zapise (kaskadno). */
      deletePet: (id) =>
        set((s) => {
          const pets = s.pets.filter((p) => p.id !== id);
          return {
            pets,
            activePetId: s.activePetId === id ? (pets[0]?.id ?? null) : s.activePetId,
            weights: s.weights.filter(notPet(id)),
            vaccinations: s.vaccinations.filter(notPet(id)),
            medications: s.medications.filter(notPet(id)),
            checkups: s.checkups.filter(notPet(id)),
            foodProfiles: s.foodProfiles.filter(notPet(id)),
            stools: s.stools.filter(notPet(id)),
            milestones: s.milestones.filter(notPet(id)),
            reminders: s.reminders.filter(notPet(id)),
          };
        }),

      addWeight: (petId, kg, dateISO) =>
        set((s) => ({ weights: [...s.weights, { id: newId(), petId, kg, dateISO }] })),

      addVaccination: (v) =>
        set((s) => ({ vaccinations: [...s.vaccinations, { ...v, id: newId() }] })),
      deleteVaccination: (id) =>
        set((s) => ({ vaccinations: s.vaccinations.filter((v) => v.id !== id) })),

      addMedication: (m) =>
        set((s) => ({ medications: [...s.medications, { ...m, id: newId() }] })),
      updateMedication: (id, patch) =>
        set((s) => ({
          medications: s.medications.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      deleteMedication: (id) =>
        set((s) => ({ medications: s.medications.filter((m) => m.id !== id) })),

      addCheckup: (c) => set((s) => ({ checkups: [...s.checkups, { ...c, id: newId() }] })),
      deleteCheckup: (id) => set((s) => ({ checkups: s.checkups.filter((c) => c.id !== id) })),

      setFoodProfile: (p) =>
        set((s) => ({
          foodProfiles: [...s.foodProfiles.filter((f) => f.petId !== p.petId), p],
        })),

      addStool: (petId, quality) =>
        set((s) => ({
          stools: [...s.stools, { id: newId(), petId, quality, dateISO: new Date().toISOString() }],
        })),

      addMilestone: (m) => {
        const full: Milestone = { ...m, id: newId() };
        set((s) => ({ milestones: [...s.milestones, full] }));
        return full;
      },
      deleteMilestone: (id) =>
        set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) })),

      addReminder: (r) =>
        set((s) => ({ reminders: [...s.reminders, { ...r, id: newId(), done: false }] })),
      completeReminder: (id) =>
        set((s) => ({
          reminders: s.reminders.map((r) => (r.id === id ? { ...r, done: true } : r)),
        })),
      deleteReminder: (id) =>
        set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),

      setPremium: (v) => set({ premium: v }),

      /** Demo podaci pri prvom pokretanju, da aplikacija ne bude prazna. */
      seedIfEmpty: () => {
        const s = get();
        if (s.seeded || s.pets.length > 0) return;
        const today = new Date();
        const iso = (daysAgo: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() - daysAgo);
          return toISODate(d);
        };
        const luna: Pet = {
          id: newId(),
          name: 'Luna',
          species: 'pas',
          breed: 'Zlatni retriver',
          sex: 'f',
          dob: '2022-03-15',
          microchip: '688050000123456',
          neutered: true,
          createdAt: new Date().toISOString(),
        };
        const weights: WeightEntry[] = [29.1, 29.0, 28.8, 28.9, 28.6, 28.5, 28.4].map((kg, i) => ({
          id: newId(),
          petId: luna.id,
          kg,
          dateISO: iso((6 - i) * 14),
        }));
        set({
          seeded: true,
          pets: [luna],
          activePetId: luna.id,
          weights,
          vaccinations: [
            { id: newId(), petId: luna.id, name: 'Besnilo', dateISO: iso(340), validUntilISO: iso(-25), clinic: 'Vet centar „Lav"' },
            { id: newId(), petId: luna.id, name: 'DHPPi (štenećak, parvo…)', dateISO: iso(120), validUntilISO: iso(-245) },
          ],
          medications: [
            { id: newId(), petId: luna.id, name: 'Bravecto 1000 mg', dose: '1 tableta', intervalDays: 84, lastGivenISO: iso(40), active: true },
          ],
          checkups: [
            { id: newId(), petId: luna.id, title: 'Godišnji sistematski', dateISO: iso(120), vet: 'dr Jovana Perić', notes: 'Sve uredno.', attachments: [] },
          ],
          foodProfiles: [
            { petId: luna.id, brand: 'Royal Canin Golden Retriever Adult', dailyGrams: 380 },
          ],
          milestones: [
            { id: newId(), petId: luna.id, dateISO: iso(0), title: 'Naučila „daj šapu" 🐾' },
            { id: newId(), petId: luna.id, dateISO: iso(37), title: 'Preselila se u novu kuću 🏡', description: 'Prvo njuškanje dvorišta trajalo 45 minuta.' },
          ],
        });
      },
    }),
    {
      name: 'moj-ljubimac-v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/* ---------- Selektori (hukovi) ----------
 * Filtriranje pravi novi niz pri svakom pozivu, što bi u zustand v5 izazvalo
 * beskonačne re-rendere. Zato: useShallow (stabilna referenca dok se sadržaj
 * ne promeni) + useMemo za sortiranje bez mutiranja keširane vrednosti. */

function useSorted<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  return useMemo(() => [...items].sort(compare), [items, compare]);
}

export const useActivePet = () =>
  useApp((s) => s.pets.find((p) => p.id === s.activePetId) ?? s.pets[0] ?? null);

const byDateAsc = (a: { dateISO: string }, b: { dateISO: string }) =>
  a.dateISO.localeCompare(b.dateISO);
const byDateDesc = (a: { dateISO: string }, b: { dateISO: string }) =>
  b.dateISO.localeCompare(a.dateISO);

export const usePetWeights = (petId?: string) =>
  useSorted(useApp(useShallow((s) => s.weights.filter((w) => w.petId === petId))), byDateAsc);

export const usePetVaccinations = (petId?: string) =>
  useSorted(useApp(useShallow((s) => s.vaccinations.filter((v) => v.petId === petId))), byDateDesc);

export const usePetMedications = (petId?: string) =>
  useApp(useShallow((s) => s.medications.filter((m) => m.petId === petId)));

export const usePetCheckups = (petId?: string) =>
  useSorted(useApp(useShallow((s) => s.checkups.filter((c) => c.petId === petId))), byDateDesc);

export const usePetFood = (petId?: string) =>
  useApp((s) => s.foodProfiles.find((f) => f.petId === petId));

export const usePetStools = (petId?: string) =>
  useSorted(useApp(useShallow((s) => s.stools.filter((st) => st.petId === petId))), byDateDesc);

export const usePetMilestones = (petId?: string) =>
  useSorted(useApp(useShallow((s) => s.milestones.filter((m) => m.petId === petId))), byDateDesc);

export const usePetReminders = (petId?: string) =>
  useSorted(
    useApp(useShallow((s) => s.reminders.filter((r) => r.petId === petId && !r.done))),
    byDateAsc
  );
