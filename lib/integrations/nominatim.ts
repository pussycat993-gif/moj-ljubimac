import "server-only";

// OpenStreetMap Nominatim adapter (TC ADR-11, API §9.4): turns a partner address into coordinates for
// EP-69. Server-side only, with the fetch of the platform (no geocoding SDK). The usage policy asks for an
// identifying User-Agent and at most 1 request per second: calls are serialised and each waits until a
// second has passed since the previous one (module-level timestamp, owner decision Step 28). No retry;
// any failure or an empty answer is `geocoding_failed` and the Operator enters coordinates manually.

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const MIN_INTERVAL_MS = 1000;

export type GeocodeHit = { latitude: number; longitude: number; display_name: string };
export type GeocodeResult = { ok: true; data: GeocodeHit } | { ok: false; error: "geocoding_failed" };

export type NominatimConfig = {
  /** NEXT_PUBLIC_SITE_URL, for the User-Agent. */
  siteUrl: string;
  /** Injected in tests (fake Nominatim); the global fetch otherwise. */
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function nominatimConfigFromEnv(): NominatimConfig {
  return { siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "") };
}

export function userAgent(siteUrl: string): string {
  return `MojLjubimac/1.0 (+${siteUrl})`;
}

/** API §9.4: q = "<address, city, Serbia>"; the city is not repeated when the address already ends with it. */
export function geocodeQuery(address: string, city: string): string {
  const a = address.trim();
  const c = city.trim();
  const parts = c && !a.toLowerCase().endsWith(c.toLowerCase()) ? [a, c] : [a];
  return [...parts, "Serbia"].join(", ");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let lastCallAt: number | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function waitForSlot(now: () => number, sleep: (ms: number) => Promise<void>) {
  if (lastCallAt !== null) {
    const wait = lastCallAt + MIN_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
  }
  lastCallAt = now();
}

async function search(address: string, city: string, config: NominatimConfig): Promise<GeocodeResult> {
  const now = config.now ?? Date.now;
  await waitForSlot(now, config.sleep ?? defaultSleep);

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "rs");
  url.searchParams.set("q", geocodeQuery(address, city));

  try {
    const response = await (config.fetch ?? fetch)(url.toString(), {
      method: "GET",
      headers: { "User-Agent": userAgent(config.siteUrl), Accept: "application/json" },
    });
    if (!response.ok) {
      console.error(`[nominatim] search failed with ${response.status}`);
      return { ok: false, error: "geocoding_failed" };
    }
    const body = (await response.json()) as { lat?: unknown; lon?: unknown; display_name?: unknown }[];
    const hit = Array.isArray(body) ? body[0] : undefined;
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (!hit || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, error: "geocoding_failed" };
    return {
      ok: true,
      data: { latitude, longitude, display_name: typeof hit.display_name === "string" ? hit.display_name : "" },
    };
  } catch (error) {
    console.error("[nominatim] search failed:", error instanceof Error ? error.message : String(error));
    return { ok: false, error: "geocoding_failed" };
  }
}

/** Geocodes one address (≤ 1 request/s across the process, no retry). */
export function geocode(
  input: { address: string; city: string },
  config: NominatimConfig = nominatimConfigFromEnv(),
): Promise<GeocodeResult> {
  const run = queue.then(() => search(input.address, input.city, config));
  queue = run.catch(() => undefined);
  return run;
}
