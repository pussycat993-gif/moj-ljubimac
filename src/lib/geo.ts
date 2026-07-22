import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface LocationResult {
  coords: Coords;
  /** Grad iz reverznog geokodiranja, ako je dostupan. */
  city?: string;
}

export type LocationOutcome =
  | { ok: true; data: LocationResult }
  | { ok: false; reason: 'denied' | 'error' };

/** Traži dozvolu, čita trenutnu lokaciju i pokušava da odredi grad. */
export async function getCurrentLocation(): Promise<LocationOutcome> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords: Coords = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };

    let city: string | undefined;
    try {
      const [place] = await Location.reverseGeocodeAsync(coords);
      city = place?.city ?? place?.subregion ?? place?.region ?? undefined;
    } catch {
      // Reverzno geokodiranje nije kritično — nastavljamo bez grada.
    }

    return { ok: true, data: { coords, city } };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Haversine rastojanje u kilometrima — spremno za listu partnera po blizini. */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Otvara sistemsku mapu sa pretragom (npr. „veterinar") u blizini datih koordinata.
 * Apple Maps na iOS-u, geo: nsheme na Androidu, uz Google Maps web kao rezervu.
 */
export async function openMapsSearch(query: string, coords?: Coords): Promise<void> {
  const q = encodeURIComponent(query);
  const ll = coords ? `${coords.latitude},${coords.longitude}` : undefined;

  const native =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${q}${ll ? `&sll=${ll}&z=14` : ''}`
      : ll
        ? `geo:${ll}?q=${q}`
        : `geo:0,0?q=${q}`;

  const webFallback = ll
    ? `https://www.google.com/maps/search/${q}/@${ll},14z`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;

  // Ne oslanjamo se na canOpenURL: na Androidu 11+ zna da vrati false za `geo:`
  // i kad mapa postoji (ograničenja vidljivosti paketa). Zato direktno pokušavamo
  // nativni URL, a na Google Maps web padamo samo ako otvaranje stvarno ne uspe.
  try {
    await Linking.openURL(native);
  } catch {
    try {
      await Linking.openURL(webFallback);
    } catch {
      // Ništa više ne možemo — tiho odustajemo umesto da rušimo ekran.
    }
  }
}
