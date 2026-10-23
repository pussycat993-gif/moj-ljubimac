import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { r2 } from "@/lib/integrations/r2";
import { fromDatabaseError, type ApiError } from "@/lib/server/result";
import type { City } from "@/lib/actions/registration";
import type { FileUrl } from "@/lib/actions/files";
import type { Money } from "@/lib/actions/pets";

// EP-62 Public organisation page — the read shared by app/api/public/orgs/[slug]/route.ts and the S23 page
// app/(public)/o/[slug]/page.tsx (owner decision, Step 26). Public, no session: rpc:get_public_org_page returns
// only the PublicOrgPage / PublicAnimal fields (BR-37) of an approved organisation (a breeder also needs an active
// breeder plan, E-21) and its available animals; the service role additionally gets the R2 keys, turned here into
// presigned GET URLs (10 min, API §10) and dropped. Nothing is cached (TC ADR-18): every request reads the current
// rows, so EP-55 / EP-58 / EP-59 / EP-61 / EP-68 / EP-72 changes show on the next request.

/** API §6 PublicAnimal. */
export type PublicAnimal = {
  pet_id: string;
  name: string;
  species: string;
  species_other: string | null;
  breed: string | null;
  sex: "male" | "female" | "unknown";
  approx_age_text: string | null;
  birth_date: string | null;
  birth_year: number | null;
  public_description: string | null;
  neutered: "yes" | "no" | "unknown";
  vaccinated: boolean;
  price: Money | null;
  photo_url: FileUrl | null;
};

/** API §6 PublicOrgPage. */
export type PublicOrgPage = {
  organisation: {
    name: string;
    type: "shelter" | "breeder";
    slug: string;
    initials: string;
    city: City | null;
    description: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logo_url: FileUrl | null;
  };
  animals: PublicAnimal[];
  total: number;
};

/** EP-62 response headers, on every answer (TC ADR-18). */
export const PUBLIC_ORG_HEADERS = { "Cache-Control": "no-store" } as const;

/** EP-62 Request: limit default 20, max 50; offset default 0. */
export const PUBLIC_ORG_PAGE_SIZE = 20;

export type PublicOrgPageResult = { ok: true; data: PublicOrgPage } | { ok: false; error: ApiError };

type RawAnimal = Omit<PublicAnimal, "photo_url"> & { photo_url: null; photo_r2_key?: string | null };
type RawPage = {
  organisation: Omit<PublicOrgPage["organisation"], "logo_url"> & { logo_url: null; logo_r2_key?: string | null };
  animals: RawAnimal[];
  total: number;
};

const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * A presigned GET as an API §6 FileUrl (id = the pet id, or the slug for the logo — PublicOrgPage carries no
 * organisation id). A failed presign answers url = null rather than failing the page (EP-53 rule, Step 24).
 */
async function presign(kind: "pet_photo" | "organisation_logo", id: string, key: string | null | undefined) {
  if (!key) return null;
  try {
    const signed = await r2().presignGet(key);
    return { kind, id, url: signed.url, expires_at: signed.expires_at, mime_type: null } satisfies FileUrl;
  } catch (error) {
    console.error("[public-org-page] presign failed:", error instanceof Error ? error.message : error);
    return { kind, id, url: null, expires_at: null, mime_type: null } satisfies FileUrl;
  }
}

/**
 * EP-62 — the public page of `slug`. `not_found` for an unknown, pending, rejected or plan-less breeder
 * organisation (indistinguishable on purpose); `validation_failed` for bad paging. Throws on a database failure.
 */
export async function getPublicOrgPage(
  slug: string,
  paging: { limit?: number; offset?: number } = {},
): Promise<PublicOrgPageResult> {
  const limit = paging.limit ?? PUBLIC_ORG_PAGE_SIZE;
  const offset = paging.offset ?? 0;
  const fields: Record<string, string> = {};
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fields.limit = "out_of_range";
  if (!Number.isInteger(offset) || offset < 0) fields.offset = "out_of_range";
  if (Object.keys(fields).length > 0) {
    return { ok: false, error: { code: "validation_failed", message: "bad paging", fields } };
  }
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    return { ok: false, error: { code: "not_found", message: "organisation not found" } };
  }

  const { data, error } = await createServiceRoleClient().rpc("get_public_org_page", {
    p_slug: slug,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    const mapped = fromDatabaseError(error);
    if (mapped.code === "not_found" || mapped.code === "validation_failed") return { ok: false, error: mapped };
    throw new Error(`[public-org-page] ${error.message}`);
  }

  const raw = data as unknown as RawPage;
  const { logo_r2_key: logoKey, ...organisation } = raw.organisation;
  const animals = await Promise.all(
    raw.animals.map(async ({ photo_r2_key: photoKey, ...animal }) => ({
      ...animal,
      photo_url: await presign("pet_photo", animal.pet_id, photoKey),
    })),
  );
  return {
    ok: true,
    data: { organisation: { ...organisation, logo_url: await presign("organisation_logo", organisation.slug, logoKey) }, animals, total: raw.total },
  };
}
