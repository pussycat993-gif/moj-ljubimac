// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ADR-11 / API §9.4 — lib/integrations/nominatim.ts over a fake HTTP server: the search URL
// (format=jsonv2, limit=1, countrycodes=rs, q = "<address, city, Serbia>"), the identifying User-Agent
// "MojLjubimac/1.0 (+<site>)", at most 1 request per second (a second call waits for the rest of the
// second), no retry, and geocoding_failed on no result, an HTTP error or a network failure.

const SITE = "https://mojljubimac.test";

type Nominatim = typeof import("@/lib/integrations/nominatim");

async function load(): Promise<Nominatim> {
  vi.resetModules();
  return import("@/lib/integrations/nominatim");
}

function fakeFetch(answer: () => Response | Promise<Response>) {
  return vi.fn(async (...args: [string, RequestInit?]) => {
    void args;
    return answer();
  });
}

/** The adapter config with a fake fetch (typed as the platform fetch). */
function cfg(fetch: (...args: [string, RequestInit?]) => Promise<Response>) {
  return { siteUrl: SITE, fetch: fetch as unknown as typeof globalThis.fetch, now, sleep };
}

const hit = () =>
  new Response(JSON.stringify([{ lat: "45.2551", lon: "19.8452", display_name: "Bulevar oslobođenja 45, Novi Sad, Srbija" }]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let clock = 0;
const now = () => clock;
const sleep = vi.fn(async (ms: number) => {
  clock += ms;
});

beforeEach(() => {
  clock = 1_000_000;
  sleep.mockClear();
});

describe("Nominatim adapter", () => {
  it("sends the search with the app User-Agent and returns the coordinates", async () => {
    const { geocode } = await load();
    const fetch = fakeFetch(hit);
    const result = await geocode({ address: "Bulevar oslobođenja 45", city: "Novi Sad" }, cfg(fetch));

    expect(result).toEqual({
      ok: true,
      data: { latitude: 45.2551, longitude: 19.8452, display_name: "Bulevar oslobođenja 45, Novi Sad, Srbija" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(parsed.searchParams.get("format")).toBe("jsonv2");
    expect(parsed.searchParams.get("limit")).toBe("1");
    expect(parsed.searchParams.get("countrycodes")).toBe("rs");
    expect(parsed.searchParams.get("q")).toBe("Bulevar oslobođenja 45, Novi Sad, Serbia");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(`MojLjubimac/1.0 (+${SITE})`);
  });

  it("does not repeat the city when the address already ends with it", async () => {
    const { geocodeQuery } = await load();
    expect(geocodeQuery("Zmaj Jovina 20, Novi Sad", "Novi Sad")).toBe("Zmaj Jovina 20, Novi Sad, Serbia");
  });

  it("makes at most 1 request per second", async () => {
    const { geocode } = await load();
    const times: number[] = [];
    const fetch = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      times.push(clock);
      return hit();
    });
    const config = cfg(fetch);

    await geocode({ address: "A 1", city: "Novi Sad" }, config);
    clock += 200;
    await geocode({ address: "A 2", city: "Novi Sad" }, config);
    expect(sleep).toHaveBeenCalledWith(800);

    // Concurrent calls are serialised too.
    await Promise.all([geocode({ address: "A 3", city: "Novi Sad" }, config), geocode({ address: "A 4", city: "Novi Sad" }, config)]);
    expect(fetch).toHaveBeenCalledTimes(4);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000);
  });

  it("does not wait when a second has already passed", async () => {
    const { geocode } = await load();
    const config = cfg(fakeFetch(hit));
    await geocode({ address: "A 1", city: "Novi Sad" }, config);
    clock += 1500;
    await geocode({ address: "A 2", city: "Novi Sad" }, config);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns geocoding_failed when nothing is found", async () => {
    const { geocode } = await load();
    const fetch = fakeFetch(() => new Response("[]", { status: 200 }));
    expect(await geocode({ address: "Nepostojeća 999", city: "Novi Sad" }, cfg(fetch))).toEqual({
      ok: false,
      error: "geocoding_failed",
    });
  });

  it("returns geocoding_failed on an HTTP error, without retrying", async () => {
    const { geocode } = await load();
    const fetch = fakeFetch(() => new Response("busy", { status: 503 }));
    const result = await geocode({ address: "A 1", city: "Novi Sad" }, cfg(fetch));
    expect(result).toEqual({ ok: false, error: "geocoding_failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns geocoding_failed on a network failure", async () => {
    const { geocode } = await load();
    const fetch = vi.fn(async (...args: [string, RequestInit?]): Promise<Response> => {
      void args;
      throw new Error("offline");
    });
    const result = await geocode({ address: "A 1", city: "Novi Sad" }, cfg(fetch));
    expect(result).toEqual({ ok: false, error: "geocoding_failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
