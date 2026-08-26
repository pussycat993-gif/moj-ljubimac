import { deleteAllMedia } from './media';
import { cancelAllScheduled } from './notifications';
import { useApp } from './store';
import { supabase } from './supabase';
import { stopSync } from './sync';

/**
 * Brisanje naloga i podataka.
 *
 * OBAVEZNO ZA PRODAVNICE:
 * - Apple App Store, pravilo 5.1.1(v): ako aplikacija ume da napravi nalog,
 *   mora da ume i da ga obriše — iz same aplikacije, bez mejlova i podrške.
 * - Google Play: isto, plus javno dostupan URL za zahtev za brisanje
 *   (vidi docs/brisanje-naloga.html).
 *
 * Dva scenarija:
 * - Bez naloga (cloud ugašen ili neprijavljen) → briše se samo ovaj telefon.
 * - Sa nalogom → Edge Function `delete-account` briše korisnika i podatke u
 *   Supabase-u, pa se čisti i telefon.
 */

export interface DeleteResult {
  ok: boolean;
  /** Poruka za prikaz korisniku (srpski). */
  error?: string;
}

/**
 * Briše sve lokalne podatke: store, zakazane notifikacije, kopirane fajlove.
 *
 * VAŽNO — stopSync() ide PRVI. Sync sloj sluša store i prenosi brisanja na
 * cloud (propagateDeletes). Da nije ugašen, lokalno praznjenje bi obrisalo i
 * kartone koje deli ostatak porodice.
 */
export async function wipeLocalData(): Promise<DeleteResult> {
  stopSync();
  await cancelAllScheduled();
  useApp.getState().resetAll();
  deleteAllMedia();
  return { ok: true };
}

/** Izvlači čitljivu poruku iz greške Edge Function-a. */
async function readInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.text === 'function') {
    try {
      const raw = await ctx.text();
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) return parsed.error;
      } catch {
        // odgovor nije JSON — vrati sirov tekst
      }
      if (raw.trim()) return raw.trim().slice(0, 200);
    } catch {
      // telo odgovora je već pročitano ili nedostupno
    }
  }
  const msg = (error as { message?: string }).message;
  return msg?.trim() || 'Brisanje nije uspelo. Proveri internet i pokušaj ponovo.';
}

/**
 * Trajno briše nalog: prvo na serveru (Edge Function sa service_role ključem),
 * pa lokalno. Ako server padne, NE brišemo lokalno — inače bi korisnik ostao
 * bez podataka a nalog bi mu i dalje postojao.
 */
export async function deleteAccount(): Promise<DeleteResult> {
  if (!supabase) return { ok: false, error: 'Nalozi nisu podešeni u ovoj verziji.' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, error: 'Nisi prijavljen.' };

  // Ugasi sync pre brisanja da realtime/push ne rade u pozadini.
  stopSync();

  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    body: {},
  });
  if (error) return { ok: false, error: await readInvokeError(error) };

  // Korisnik na serveru više ne postoji, pa server-side odjava ne bi prošla —
  // scope: 'local' samo čisti token sa telefona.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // token je već nevažeći — nastavi sa lokalnim čišćenjem
  }

  return wipeLocalData();
}
