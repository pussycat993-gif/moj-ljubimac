import "server-only";

import { AwsClient } from "aws4fetch";

// Cloudflare R2 adapter (TC ADR-07, ADR-17; API §10). Every request is signed by aws4fetch
// against the S3-compatible endpoint https://<account>.r2.cloudflarestorage.com/<bucket>/<key>.
// Presigned URLs expire after 10 minutes (API §10 steps 3 and 5). Files are private; the
// browser only ever gets a presigned URL, never a key or a credential.

export const PRESIGN_EXPIRES_S = 600;

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Injected in tests (fake R2); the global fetch otherwise. */
  fetch?: typeof fetch;
  /** Clock for expiry timestamps; injected in tests. */
  now?: () => Date;
};

export type PresignedUrl = { url: string; expires_at: string };
export type ObjectHead = { size: number; content_type: string | null };

export type R2 = {
  presignPut(key: string, opts: { contentType: string; contentLength: number }): Promise<PresignedUrl>;
  presignGet(key: string, opts?: { fileName?: string | null }): Promise<PresignedUrl>;
  /** null when the object does not exist. */
  head(key: string): Promise<ObjectHead | null>;
  /** true when R2 confirmed the deletion (a missing object counts as deleted). */
  remove(key: string): Promise<boolean>;
  /**
   * Server-side copy inside the bucket (S3 CopyObject: PUT with x-amz-copy-source), used by the EP-60 record
   * transfer (API §10 step 6). Throws when R2 does not confirm the copy.
   */
  copy(sourceKey: string, targetKey: string): Promise<void>;
  /**
   * One page of S3 ListObjectsV2 under a prefix (EP-52 orphan scan, API §10 step 7). `next_token` is the
   * continuation token for the next page, null on the last one. Throws when R2 does not answer 2xx.
   */
  list(prefix: string, opts?: { maxKeys?: number; continuationToken?: string | null }): Promise<ObjectPage>;
  /** Server-side read of a whole object (EP-50 archive builder). Throws when R2 does not answer 2xx. */
  get(key: string): Promise<Uint8Array>;
  /** Server-side upload of a whole object (EP-50 archive builder). Throws when R2 does not answer 2xx. */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
};

export type ListedObject = { key: string; last_modified: string };
export type ObjectPage = { objects: ListedObject[]; next_token: string | null };

/** R2 credentials are set (TC §8.1). The nightly job skips R2 entirely without them (owner decision, Step 30). */
export function r2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function xmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function xmlTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? xmlText(match[1]) : null;
}

/** TC §8.1: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. */
export function r2ConfigFromEnv(): R2Config {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createR2(config: R2Config): R2 {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const objectUrl = (key: string) =>
    new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`);

  async function presign(url: URL, init: { method: string; headers?: Record<string, string> }): Promise<PresignedUrl> {
    const issued = now();
    url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRES_S));
    const signed = await client.sign(url.toString(), {
      method: init.method,
      headers: init.headers,
      // Content-Type and Content-Length are signed too, so R2 rejects any other value (API §6 UploadTicket).
      aws: { signQuery: true, allHeaders: true, datetime: issued.toISOString().replace(/[:-]|\.\d{3}/g, "") },
    });
    return { url: signed.url, expires_at: new Date(issued.getTime() + PRESIGN_EXPIRES_S * 1000).toISOString() };
  }

  return {
    presignPut(key, { contentType, contentLength }) {
      return presign(objectUrl(key), {
        method: "PUT",
        headers: { "Content-Type": contentType, "Content-Length": String(contentLength) },
      });
    },

    presignGet(key, opts = {}) {
      const url = objectUrl(key);
      if (opts.fileName) {
        url.searchParams.set("response-content-disposition", `inline; filename="${opts.fileName.replace(/["\\\r\n]/g, "_")}"`);
      }
      return presign(url, { method: "GET" });
    },

    async head(key) {
      const response = await doFetch(await client.sign(objectUrl(key).toString(), { method: "HEAD" }));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 HEAD failed with ${response.status}`);
      return {
        size: Number(response.headers.get("content-length") ?? "-1"),
        content_type: response.headers.get("content-type"),
      };
    },

    async remove(key) {
      try {
        const response = await doFetch(await client.sign(objectUrl(key).toString(), { method: "DELETE" }));
        return response.ok || response.status === 404;
      } catch {
        return false;
      }
    },

    async copy(sourceKey, targetKey) {
      const response = await doFetch(
        await client.sign(objectUrl(targetKey).toString(), {
          method: "PUT",
          headers: { "x-amz-copy-source": `/${encodeURIComponent(config.bucket)}/${encodeKey(sourceKey)}` },
        }),
      );
      // CopyObject can answer 200 with an <Error> body when the copy fails part-way.
      const body = response.ok ? await response.text().catch(() => "") : "";
      if (!response.ok || body.includes("<Error>")) throw new Error(`R2 copy failed with ${response.status}`);
    },

    async list(prefix, opts = {}) {
      const url = new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("max-keys", String(Math.min(Math.max(opts.maxKeys ?? 1000, 1), 1000)));
      if (opts.continuationToken) url.searchParams.set("continuation-token", opts.continuationToken);
      const response = await doFetch(await client.sign(url.toString(), { method: "GET" }));
      if (!response.ok) throw new Error(`R2 list failed with ${response.status}`);
      const xml = await response.text();
      const objects: ListedObject[] = [];
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = xmlTag(match[1], "Key");
        const lastModified = xmlTag(match[1], "LastModified");
        if (key !== null && lastModified !== null) objects.push({ key, last_modified: lastModified });
      }
      const truncated = xmlTag(xml, "IsTruncated") === "true";
      return { objects, next_token: truncated ? xmlTag(xml, "NextContinuationToken") : null };
    },

    async get(key) {
      const response = await doFetch(await client.sign(objectUrl(key).toString(), { method: "GET" }));
      if (!response.ok) throw new Error(`R2 GET failed with ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },

    async put(key, body, contentType) {
      const response = await doFetch(
        await client.sign(objectUrl(key).toString(), {
          method: "PUT",
          headers: { "Content-Type": contentType, "Content-Length": String(body.byteLength) },
          // Our bytes are always backed by an ArrayBuffer (never a SharedArrayBuffer).
          body: body as Uint8Array<ArrayBuffer>,
        }),
      );
      if (!response.ok) throw new Error(`R2 PUT failed with ${response.status}`);
    },
  };
}

let cached: R2 | null = null;

/** The adapter configured from the environment (TC §8.1). */
export function r2(): R2 {
  cached ??= createR2(r2ConfigFromEnv());
  return cached;
}

/** API §10 step 6: lowercased, characters outside [a-z0-9._-] → "-", at most 100 chars. */
export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 100);
}
