import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { r2 } from "@/lib/integrations/r2";

// EP-24 Get public moment — the read shared by app/api/public/moments/[slug]/route.ts and the S09
// page app/(public)/t/[slug]/page.tsx (owner decision, Step 21). Public, no session: the service role
// reads only the PublicMoment fields — the pet's name and sex, the moment's date, text and photos —
// never health data, the owner, or other moments (BR-37, BR-45). Unknown slug, an inactive link or a
// deleted moment all answer null (404), indistinguishable on purpose (E-07). Nothing is cached
// (TC ADR-18): photo URLs are presigned for 10 minutes each time the response is built.

/** API §6 PublicMoment. */
export type PublicMoment = {
  slug: string;
  pet_name: string;
  pet_sex: "male" | "female" | "unknown";
  moment_date: string;
  text: string | null;
  photos: { position: number; url: string; expires_at: string }[];
};

/** EP-24 Request: 22 chars [0-9A-Za-z]. */
export const PUBLIC_SLUG = /^[0-9A-Za-z]{22}$/;

/** EP-24 response headers, on 200 and 404 alike. */
export const PUBLIC_MOMENT_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

type LinkRow = {
  slug: string;
  active: boolean;
  moments: {
    moment_date: string;
    text: string | null;
    pets: { name: string; sex: PublicMoment["pet_sex"] } | null;
    moment_photos: { position: number; r2_key: string }[];
  } | null;
};

export async function getPublicMoment(slug: string): Promise<PublicMoment | null> {
  if (typeof slug !== "string" || !PUBLIC_SLUG.test(slug)) return null;

  const { data, error } = await createServiceRoleClient()
    .from("moment_public_links")
    .select("slug, active, moments(moment_date, text, pets(name, sex), moment_photos(position, r2_key))")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`[public-moments] ${error.message}`);

  const row = data as unknown as LinkRow | null;
  const moment = row?.moments;
  if (!row || !row.active || !moment || !moment.pets) return null;

  const photos = [...(moment.moment_photos ?? [])].sort((a, b) => a.position - b.position);
  const storage = photos.length > 0 ? r2() : null;
  return {
    slug: row.slug,
    pet_name: moment.pets.name,
    pet_sex: moment.pets.sex,
    moment_date: moment.moment_date,
    text: moment.text,
    photos: await Promise.all(
      photos.map(async (photo) => {
        const signed = await storage!.presignGet(photo.r2_key);
        return { position: photo.position, url: signed.url, expires_at: signed.expires_at };
      }),
    ),
  };
}
