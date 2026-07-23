import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

/**
 * Supabase klijent za deljenje profila (nalozi + sinhronizacija).
 *
 * Config-driven: bez URL-a/anon ključa u app.json → extra.supabase, klijent je
 * null i aplikacija radi potpuno lokalno (kao do sada). Čim se upišu podaci,
 * uključuje se nalog i sinhronizacija (vidi src/lib/sync.ts).
 *
 * PRODUKCIJA:
 * 1. Napravi Supabase projekat.
 * 2. Pokreni SQL iz `supabase/schema.sql` (tabele + RLS + household model).
 * 3. Upiši Project URL i anon (public) ključ u app.json → extra.supabase.
 */

interface SbConfig {
  url?: string;
  anonKey?: string;
}

const cfg = (Constants.expoConfig?.extra?.supabase ?? {}) as SbConfig;
const SB_URL = cfg.url?.trim() || '';
const SB_ANON = cfg.anonKey?.trim() || '';

/** Da li je cloud (nalozi + sync) konfigurisan. */
export function isCloudConfigured(): boolean {
  return SB_URL.length > 0 && SB_ANON.length > 0;
}

export const supabase: SupabaseClient | null = isCloudConfigured()
  ? createClient(SB_URL, SB_ANON, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Nema URL-a za detekciju sesije u RN-u (nije web).
        detectSessionInUrl: false,
      },
    })
  : null;

// Supabase preporuka za RN: osveži token dok je app aktivan, pauziraj u pozadini.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export interface AuthResult {
  ok: boolean;
  /** Poruka greške na srpskom za prikaz korisniku. */
  error?: string;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Nalozi nisu podešeni u ovoj verziji.' };
  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Nalozi nisu podešeni u ovoj verziji.' };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Pretplata na promene sesije (prijava/odjava). Vraća funkciju za otkazivanje. */
export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
