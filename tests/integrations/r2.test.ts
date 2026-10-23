import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createR2, safeFileName, PRESIGN_EXPIRES_S, r2ConfigFromEnv } = await import("@/lib/integrations/r2");

// lib/integrations/r2.ts (TC ADR-07, ADR-17; API §10) against a fake R2: an in-memory bucket
// behind the injected fetch, which also records every signed request.

const NOW = new Date("2026-10-23T08:00:00Z");

function fakeR2(objects: Record<string, { size: number; type: string }> = {}) {
  const requests: Request[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    requests.push(request);
    const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/bucket\//, ""));
    const object = objects[key];
    if (request.method === "HEAD") {
      if (!object) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "content-length": String(object.size), "content-type": object.type } });
    }
    if (request.method === "DELETE") {
      delete objects[key];
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 400 });
  });
  const storage = createR2({
    accountId: "acc123",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret",
    bucket: "bucket",
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => NOW,
  });
  return { storage, requests, objects };
}

const KEY = "u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/photo/0b1c-luna.jpg";

describe("presigned URLs (API §10 steps 3 and 5)", () => {
  it("PUT: R2 S3 endpoint, SigV4 query signature, 10-minute expiry, Content-Type and Content-Length signed", async () => {
    const { storage } = fakeR2();
    const signed = await storage.presignPut(KEY, { contentType: "image/jpeg", contentLength: 2048 });
    const url = new URL(signed.url);
    expect(url.origin).toBe("https://acc123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/bucket/${KEY}`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(PRESIGN_EXPIRES_S));
    expect(PRESIGN_EXPIRES_S).toBe(600);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDEXAMPLE\/20261023\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.expires_at).toBe("2026-10-23T08:10:00.000Z");
  });

  it("GET: inline Content-Disposition with the file name, 10-minute expiry", async () => {
    const { storage } = fakeR2();
    const signed = await storage.presignGet(KEY, { fileName: "0b1c-luna.jpg" });
    const url = new URL(signed.url);
    expect(url.searchParams.get("response-content-disposition")).toBe('inline; filename="0b1c-luna.jpg"');
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(signed.expires_at).toBe("2026-10-23T08:10:00.000Z");
  });

  it("a different key gives a different signature (no credentials in the URL)", async () => {
    const { storage } = fakeR2();
    const a = new URL((await storage.presignGet(KEY)).url);
    const b = new URL((await storage.presignGet(`${KEY}x`)).url);
    expect(a.searchParams.get("X-Amz-Signature")).not.toBe(b.searchParams.get("X-Amz-Signature"));
    expect(a.toString()).not.toContain("secret");
  });
});

describe("HEAD and DELETE (signed requests)", () => {
  it("HEAD returns size and content type of an existing object", async () => {
    const { storage, requests } = fakeR2({ [KEY]: { size: 2048, type: "image/jpeg" } });
    expect(await storage.head(KEY)).toEqual({ size: 2048, content_type: "image/jpeg" });
    expect(requests[0].method).toBe("HEAD");
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  });

  it("HEAD of a missing object → null (confirm answers not_uploaded)", async () => {
    const { storage } = fakeR2();
    expect(await storage.head(KEY)).toBeNull();
  });

  it("DELETE removes the object; a missing object also counts as deleted", async () => {
    const { storage, objects, requests } = fakeR2({ [KEY]: { size: 1, type: "image/png" } });
    expect(await storage.remove(KEY)).toBe(true);
    expect(objects[KEY]).toBeUndefined();
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("DELETE failure → false (the caller queues the key instead)", async () => {
    const storage = createR2({
      accountId: "acc123",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      bucket: "bucket",
      fetch: (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch,
    });
    expect(await storage.remove(KEY)).toBe(false);
  });
});

describe("configuration and key helpers", () => {
  it("reads R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (TC §8.1)", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "a");
    vi.stubEnv("R2_ACCESS_KEY_ID", "b");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "c");
    vi.stubEnv("R2_BUCKET", "d");
    expect(r2ConfigFromEnv()).toEqual({ accountId: "a", accessKeyId: "b", secretAccessKey: "c", bucket: "d" });
    vi.stubEnv("R2_BUCKET", "");
    expect(() => r2ConfigFromEnv()).toThrow(/R2 is not configured/);
    vi.unstubAllEnvs();
  });

  it("safe_file_name: lowercased, other characters → '-', at most 100 chars (API §10 step 6)", () => {
    expect(safeFileName("Luna Profil (1).JPG")).toBe("luna-profil--1-.jpg");
    expect(safeFileName("Žuća_šapa.png")).toBe("-u-a_-apa.png");
    expect(safeFileName(`${"a".repeat(150)}.jpg`)).toHaveLength(100);
  });
});
