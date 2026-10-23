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
};

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
