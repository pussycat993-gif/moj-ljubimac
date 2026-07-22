import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { useApp } from './store';

/**
 * RevenueCat integracija za pretplatu (Premium).
 *
 * Radi „graceful": ako nema API ključa (u app.json → extra.revenuecat) ili
 * native modul nije dostupan (npr. Expo Go), sve funkcije tiho prelaze u
 * demo režim i ne diraju native SDK — pa aplikacija normalno radi u razvoju.
 *
 * PRODUKCIJA:
 * 1. Napravi RevenueCat projekat i entitlement „premium".
 * 2. Poveži proizvode iz App Store Connect / Google Play.
 * 3. Upiši javne SDK ključeve u app.json → extra.revenuecat.
 * 4. Napravi development/production build (native modul ne radi u Expo Go).
 */

interface RcConfig {
  iosApiKey?: string;
  androidApiKey?: string;
  entitlement?: string;
}

const rc = (Constants.expoConfig?.extra?.revenuecat ?? {}) as RcConfig;
const ENTITLEMENT = rc.entitlement || 'premium';
const API_KEY = (Platform.OS === 'ios' ? rc.iosApiKey : rc.androidApiKey)?.trim() || '';

// Tip runtime modula bez statičkog importa (koji bi pao u Expo Go).
type PurchasesSdk = typeof import('react-native-purchases').default;

// undefined = još nismo probali; null = nedostupan; inače učitan modul.
let sdk: PurchasesSdk | null | undefined;
let configured = false;

function loadSdk(): PurchasesSdk | null {
  if (sdk !== undefined) return sdk;
  try {
    // Lazy require (namerno): ako native modul ne postoji (npr. Expo Go),
    // hvatamo grešku i ostajemo u demo režimu umesto da srušimo aplikaciju.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-purchases').default as PurchasesSdk;
  } catch {
    sdk = null;
  }
  return sdk;
}

/** Da li je prava naplata dostupna (ima ključ + native modul se učitao). */
export function isBillingConfigured(): boolean {
  return API_KEY.length > 0 && loadSdk() !== null;
}

function applyPremium(active: boolean): void {
  // Zustand van React-a: menjamo fleg koji ceo app već čita.
  useApp.getState().setPremium(active);
}

function hasPremium(info: CustomerInfo | null | undefined): boolean {
  return info?.entitlements.active[ENTITLEMENT] != null;
}

function configure(): boolean {
  if (configured) return true;
  const s = loadSdk();
  if (!s || !API_KEY) return false;
  try {
    s.configure({ apiKey: API_KEY });
    configured = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Poziva se pri pokretanju aplikacije. Konfiguriše SDK, sinhronizuje Premium
 * iz trenutnog statusa pretplate i pretplaćuje se na buduće promene.
 * U demo režimu ne dira lokalni fleg (ostaje šta je korisnik ranije izabrao).
 */
export async function initBilling(): Promise<void> {
  if (!configure()) return;
  const s = loadSdk();
  if (!s) return;
  try {
    const info = await s.getCustomerInfo();
    applyPremium(hasPremium(info));
  } catch {
    // Bez mreže — ne diramo lokalni status.
  }
  s.addCustomerInfoUpdateListener((info) => applyPremium(hasPremium(info)));
}

/** Dostupni paketi pretplate iz trenutne ponude (prazno ako nije konfigurisano). */
export async function getPackages(): Promise<PurchasesPackage[]> {
  const s = loadSdk();
  if (!s || !configure()) return [];
  try {
    const offerings = await s.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export type PurchaseResult = 'success' | 'cancelled' | 'error';

/** Kupovina paketa. Na uspeh odmah uključuje Premium lokalno. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  const s = loadSdk();
  if (!s) return 'error';
  try {
    const { customerInfo } = await s.purchasePackage(pkg);
    const active = hasPremium(customerInfo);
    applyPremium(active);
    return active ? 'success' : 'error';
  } catch (e) {
    if (e != null && typeof e === 'object' && 'userCancelled' in e && e.userCancelled) {
      return 'cancelled';
    }
    return 'error';
  }
}

/** „Vrati kupovinu" — obavezno za App Store. Vraća da li je Premium aktivan. */
export async function restorePurchases(): Promise<boolean> {
  const s = loadSdk();
  if (!s) return false;
  try {
    const info = await s.restorePurchases();
    const active = hasPremium(info);
    applyPremium(active);
    return active;
  } catch {
    return false;
  }
}
