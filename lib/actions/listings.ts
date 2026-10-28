"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates, type Caller } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";
import type { City } from "@/lib/actions/registration";
import type { FileUrl } from "@/lib/actions/files";
import type { Money } from "@/lib/actions/pets";
import type { DonationInfo } from "@/lib/actions/organisation";

// Šapa pomoći writes and signed-in reads (Step 28b, API v1.3 §5.9): EP-75 saveListing (rpc:save_listing, one
// transaction), EP-77 changeListing (Data API listings update / delete), and the server wrappers of the Data API
// reads EP-76 rpc:list_my_listings and EP-78 rpc:get_donation_info (the session lives in httpOnly cookies, owner
// decision Steps 13–17). The database enforces the rules (API §3.1): RLS and the Step 28a triggers —
// listings_active_limit (premium_required:listings), listings_need_shelter_only (listing_type_not_allowed),
// listings_status_guard (listing_not_active), marketplace_not_suspended (marketplace_suspended) and the TC
// checks. Gate 4 (organisation_pending_approval) applies only to need listings (API §5.9 conventions).
// The public reads EP-73 / EP-74 / EP-79 are the route handlers under app/api/public/.

export type ListingType = "need" | "giving" | "selling" | "seeking";
export type ListingCategory = "food" | "equipment_toys" | "furniture" | "carriers" | "medicine_care" | "other";
export type ListingSpecies = "dog" | "cat" | "other";
export type ListingStatus = "active" | "resolved" | "expired" | "hidden";
export type ListingOutcome = "given" | "sold" | "donated" | "found";
export type ReportReason = "spam" | "scam" | "inappropriate" | "animal_welfare" | "other";

/** API §6 ListingSummary (S32, S37 ListingCard). */
export type ListingSummary = {
  id: string;
  type: ListingType;
  title: string;
  category: ListingCategory;
  species: ListingSpecies;
  city: City;
  price: Money | null;
  price_negotiable: boolean;
  published_at: string;
  photo_count: number;
  cover_photo: FileUrl | null;
  author: { kind: "user" | "shelter"; display_name: string | null };
};

/** API §6 ListingPhoto. */
export type ListingPhoto = {
  id: string;
  listing_id: string;
  position: number;
  file_name: string;
  url: FileUrl | null;
};

/** API §6 ListingAuthor. */
export type ListingAuthor = {
  kind: "user" | "shelter";
  user_id: string;
  display_name: string | null;
  initials: string | null;
  city: City | null;
  member_since: string;
  active_listing_count: number;
  organisation_id: string | null;
  organisation_slug: string | null;
};

/** API §6 Listing (S33, S34 edit, results of EP-75 / EP-77). */
export type Listing = {
  id: string;
  type: ListingType;
  title: string;
  description: string;
  category: ListingCategory;
  species: ListingSpecies;
  city: City;
  price: Money | null;
  price_negotiable: boolean;
  status: ListingStatus;
  resolved_outcome: ListingOutcome | null;
  resolved_at: string | null;
  published_at: string;
  expires_at: string;
  days_left: number | null;
  photos: ListingPhoto[];
  author: ListingAuthor;
  has_donation_info: boolean;
  viewer: {
    signed_in: boolean;
    is_author: boolean;
    my_conversation_id: string | null;
    can_message: boolean;
    conversation_count: number | null;
  };
  created_at: string;
  updated_at: string;
};

/** API §6 MyListing (S35 row). */
export type MyListing = {
  id: string;
  type: ListingType;
  title: string;
  price: Money | null;
  price_negotiable: boolean;
  status: ListingStatus;
  resolved_outcome: ListingOutcome | null;
  resolved_at: string | null;
  published_at: string;
  expires_at: string;
  days_left: number | null;
  photo_count: number;
  cover_photo_id: string | null;
  conversation_count: number;
  unread_count: number;
  hidden_at: string | null;
  hidden_reason: ReportReason | null;
  can_extend: boolean;
};

/** API §6 MarketplaceStatus (Me.marketplace, EP-76 usage). */
export type MarketplaceStatus = {
  suspended_at: string | null;
  active_listings: number;
  active_listing_limit: number | null;
  can_post_need: boolean;
  need_organisation: { id: string; name: string } | null;
  unread_conversations: number;
};

/** API §6 PublicProfile (EP-79). */
export type PublicProfile = {
  user_id: string;
  display_name: string | null;
  initials: string | null;
  city: City | null;
  member_since: string;
  active_listing_count: number;
  listings: ListingSummary[];
  listings_total: number;
  viewer: { signed_in: boolean; is_me: boolean; i_blocked: boolean };
};

/** EP-76 Response. */
export type MyListingsPage = {
  items: MyListing[];
  total: number;
  counts: { active: number; expired: number; resolved: number };
  usage: MarketplaceStatus;
};

/** EP-75 Request. */
export type SaveListingInput = {
  id?: string;
  type?: ListingType;
  title?: string;
  description?: string;
  category?: ListingCategory;
  species?: ListingSpecies;
  city_id?: string;
  price?: Money | null;
  price_negotiable?: boolean;
  photo_ids?: string[];
};

/** EP-77 Request. */
export type ChangeListingInput =
  | { listing_id: string; op: "extend" }
  | { listing_id: string; op: "resolve"; outcome?: ListingOutcome }
  | { listing_id: string; op: "delete"; confirm: boolean };

const TYPES: ListingType[] = ["need", "giving", "selling", "seeking"];
const CATEGORIES: ListingCategory[] = ["food", "equipment_toys", "furniture", "carriers", "medicine_care", "other"];
const SPECIES: ListingSpecies[] = ["dog", "cat", "other"];
const OUTCOMES: ListingOutcome[] = ["given", "sold", "donated", "found"];
/** EP-77 resolve: the default outcome by type. */
const DEFAULT_OUTCOME: Record<ListingType, ListingOutcome> = {
  giving: "given",
  selling: "sold",
  need: "donated",
  seeking: "found",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PRICE_MINOR = 999_999_900;
const EXTEND_DAYS = 30;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type RawListing = Omit<Listing, "photos"> & { photos: (ListingPhoto & { r2_key?: string })[] };
type StoredListing = {
  id: string;
  author_id: string;
  type: ListingType;
  status: ListingStatus;
  title: string;
  description: string;
  category: ListingCategory;
  species: ListingSpecies;
  city_id: string;
  price_minor: number | null;
  price_negotiable: boolean;
};

/** RPC and trigger errors carry their field code in DETAIL '<field>:<code>' (Step 15 convention). */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  if (error.code === "23503" && error.message.includes("city_id")) {
    return { code: "validation_failed", message: error.message, fields: { city_id: "unknown" } };
  }
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** listing_photos.r2_key (internal) → ListingPhoto.url, a presigned GET (10 min); a failed presign → url null. */
async function signPhotos(raw: RawListing): Promise<Listing> {
  let storage: ReturnType<typeof r2> | null = null;
  const photos = await Promise.all(
    raw.photos.map(async ({ r2_key: key, ...photo }): Promise<ListingPhoto> => {
      if (!key) return { ...photo, url: null };
      try {
        storage ??= r2();
        const signed = await storage.presignGet(key);
        return { ...photo, url: { kind: "listing_photo", id: photo.id, url: signed.url, expires_at: signed.expires_at, mime_type: null } };
      } catch (error) {
        console.error("[lib/actions/listings] presign failed:", error instanceof Error ? error.message : error);
        return { ...photo, url: { kind: "listing_photo", id: photo.id, url: null, expires_at: null, mime_type: null } };
      }
    }),
  );
  return { ...raw, photos };
}

/** EP-74 read with the caller's session (rpc:get_listing), photos signed. */
async function readListing(supabase: Supabase, id: string): Promise<ActionResult<Listing>> {
  const { data, error } = await supabase.rpc("get_listing", { p_listing_id: id });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(await signPhotos(data as unknown as RawListing));
}

/** The caller's own listing, or forbidden_role (someone else's visible listing) / not_found. */
async function ownListing(supabase: Supabase, caller: Caller, id: unknown): Promise<ActionResult<StoredListing>> {
  if (typeof id !== "string" || !UUID.test(id)) return fail("not_found");
  const { data, error } = await supabase
    .from("listings")
    .select("id, author_id, type, status, title, description, category, species, city_id, price_minor, price_negotiable")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: fromRpcError(error) };
  if (!data) return fail("not_found");
  if (data.author_id !== caller.user.id) return fail("forbidden_role");
  return ok(data as StoredListing);
}

/** Gate 4 for organisation writes only — need listings (API §5.9 conventions). */
function needGate(caller: Caller, type: ListingType): ActionResult<true> {
  if (type === "need" && caller.organisations.some((o) => o.approval_status === "pending")) {
    return fail("organisation_pending_approval");
  }
  return ok(true);
}

/** The caller's Me.marketplace (rpc:get_me). */
async function marketplace(supabase: Supabase): Promise<ActionResult<MarketplaceStatus>> {
  const { data, error } = await supabase.rpc("get_me");
  if (error) return { ok: false, error: fromRpcError(error) };
  const me = data as { marketplace?: MarketplaceStatus } | null;
  if (!me?.marketplace) return fail("unauthenticated");
  return ok(me.marketplace);
}

/**
 * EP-75 saveListing — create (status active, expires_at = published_at + 30 days) or update the caller's listing
 * (only the fields sent change; published_at and expires_at never do — BR-56). A need is posted for the caller's
 * approved shelter (Me.marketplace.need_organisation); `photo_ids` (update only) reorders and deletes photos with
 * their keys queued. Returns the Listing with signed photo URLs.
 */
export async function saveListing(input: SaveListingInput): Promise<ActionResult<Listing>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const creating = input?.id === undefined || input?.id === null;
  let existing: StoredListing | null = null;
  if (!creating) {
    const own = await ownListing(supabase, caller.data, input.id);
    if (!own.ok) return own;
    existing = own.data;
    if (existing.status === "resolved" || existing.status === "hidden") return fail("listing_not_active");
  }

  const fields: Record<string, string> = {};
  const pick = <K extends keyof SaveListingInput>(key: K) => input?.[key] !== undefined;

  const type = (pick("type") ? input.type : existing?.type) as ListingType | undefined;
  if (!type || !TYPES.includes(type)) fields.type = creating && !pick("type") ? "required" : "invalid";
  else if (existing && (existing.type === "need") !== (type === "need")) fields.type = "invalid_state";

  const title = pick("title") ? trimmed(input.title) : (existing?.title ?? "");
  if (!title) fields.title = "required";
  else if (title.length > 80) fields.title = "too_long";

  const description = pick("description") ? trimmed(input.description) : (existing?.description ?? "");
  if (!description) fields.description = "required";
  else if (description.length > 2000) fields.description = "too_long";

  const category = (pick("category") ? input.category : existing?.category) as ListingCategory | undefined;
  if (!category) fields.category = "required";
  else if (!CATEGORIES.includes(category)) fields.category = "invalid";

  const species = (pick("species") ? input.species : existing?.species) as ListingSpecies | undefined;
  if (!species) fields.species = "required";
  else if (!SPECIES.includes(species)) fields.species = "invalid";

  const cityId = pick("city_id") ? trimmed(input.city_id) : (existing?.city_id ?? "");
  if (!cityId) fields.city_id = "required";
  else if (!UUID.test(cityId)) fields.city_id = "unknown";

  // BR-57: selling carries a whole-RSD price or "po dogovoru"; other types carry neither.
  const negotiable = pick("price_negotiable") ? input.price_negotiable === true : (existing?.price_negotiable ?? false);
  let priceMinor = pick("price") ? (input.price?.amount_minor ?? null) : (existing?.price_minor ?? null);
  if (type === "selling") {
    if (priceMinor !== null && negotiable) fields.price = "invalid";
    else if (priceMinor === null && !negotiable) fields.price = "required";
    else if (priceMinor !== null && (!Number.isInteger(priceMinor) || priceMinor % 100 !== 0)) fields.price = "invalid";
    else if (priceMinor !== null && (priceMinor <= 0 || priceMinor > MAX_PRICE_MINOR)) fields.price = "out_of_range";
  } else if (type && TYPES.includes(type)) {
    if (pick("price") && input.price !== null) fields.price = "invalid";
    priceMinor = null;
  }

  let photoIds: string[] | null = null;
  if (pick("photo_ids")) {
    const ids = input.photo_ids;
    if (creating || !Array.isArray(ids) || ids.length > 5 || ids.some((id) => typeof id !== "string" || !UUID.test(id))) {
      fields.photo_ids = "invalid";
    } else {
      photoIds = ids;
    }
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  // BR-54: medicine and care only for needs (the TC check answers the same, API §7.1).
  if (category === "medicine_care" && type !== "need") return fail("category_not_allowed", { fields: { category: "not_allowed" } });

  const gate = needGate(caller.data, type!);
  if (!gate.ok) return gate;

  let organisationId: string | null = null;
  if (creating && type === "need") {
    const status = await marketplace(supabase);
    if (!status.ok) return status;
    if (!status.data.can_post_need || !status.data.need_organisation) return fail("listing_type_not_allowed");
    organisationId = status.data.need_organisation.id;
  }

  const { data: city, error: cityError } = await supabase.from("cities").select("id").eq("id", cityId).maybeSingle();
  if (cityError) return { ok: false, error: fromRpcError(cityError) };
  if (!city) return fail("validation_failed", { fields: { city_id: "unknown" } });

  const { data: id, error } = await supabase.rpc("save_listing", {
    p_id: (existing?.id ?? null) as string,
    p_type: type!,
    p_title: title,
    p_description: description,
    p_category: category!,
    p_species: species!,
    p_city_id: cityId,
    p_price_minor: (type === "selling" ? priceMinor : null) as number,
    p_price_negotiable: type === "selling" ? negotiable : false,
    ...(organisationId ? { p_organisation_id: organisationId } : {}),
    ...(photoIds ? { p_photo_ids: photoIds } : {}),
  });
  if (error) {
    const mapped = fromRpcError(error);
    if (mapped.code === "category_not_allowed") mapped.fields = { category: "not_allowed" };
    return { ok: false, error: mapped };
  }
  return readListing(supabase, String(id));
}

/**
 * EP-77 changeListing — the author extends (active / expired → active, expires_at = now + 30 days, notice
 * cleared), resolves (active → resolved with an outcome, default by type) or deletes (confirm = true; photos
 * cascade and their keys are queued by the listing_photos trigger) a listing.
 */
export async function changeListing(input: ChangeListingInput): Promise<ActionResult<Listing | { deleted_listing_id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const op = input?.op;
  if (op !== "extend" && op !== "resolve" && op !== "delete") return fail("validation_failed", { fields: { op: "invalid" } });

  const own = await ownListing(supabase, caller.data, input.listing_id);
  if (!own.ok) return own;
  const listing = own.data;
  const gate = needGate(caller.data, listing.type);
  if (!gate.ok) return gate;

  if (op === "delete") {
    if ((input as { confirm?: unknown }).confirm !== true) return fail("validation_failed", { fields: { confirm: "required" } });
    const { data, error } = await supabase.from("listings").delete().eq("id", listing.id).select("id");
    if (error) return { ok: false, error: fromRpcError(error) };
    if (!data || data.length === 0) return fail("not_found");
    return ok({ deleted_listing_id: listing.id });
  }

  let change: {
    status: "active" | "resolved";
    expires_at?: string;
    expiry_notice_sent_at?: null;
    resolved_outcome?: ListingOutcome;
  };
  if (op === "extend") {
    if (listing.status !== "active" && listing.status !== "expired") return fail("listing_not_active");
    change = {
      status: "active",
      expires_at: new Date(Date.now() + EXTEND_DAYS * 86_400_000).toISOString(),
      expiry_notice_sent_at: null,
    };
  } else {
    if (listing.status !== "active") return fail("listing_not_active");
    const outcome = (input as { outcome?: ListingOutcome }).outcome ?? DEFAULT_OUTCOME[listing.type];
    if (!OUTCOMES.includes(outcome)) return fail("validation_failed", { fields: { outcome: "invalid" } });
    change = { status: "resolved", resolved_outcome: outcome };
  }

  const { data, error } = await supabase.from("listings").update(change).eq("id", listing.id).select("id");
  if (error) return { ok: false, error: fromRpcError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return readListing(supabase, listing.id);
}

/** EP-76 — the caller's listings by group (active incl. hidden / expired / resolved) with counts and usage. */
export async function listMyListings(input: {
  group: "active" | "expired" | "resolved";
  limit?: number;
  offset?: number;
}): Promise<ActionResult<MyListingsPage>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const { data, error } = await supabase.rpc("list_my_listings", {
    p_group: input?.group,
    p_limit: input?.limit ?? 20,
    p_offset: input?.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as MyListingsPage);
}

/** EP-78 — the shelter's donation info for a need listing (signed-in callers; Visitors get unauthenticated). */
export async function getDonationInfo(input: { listing_id: string }): Promise<ActionResult<DonationInfo>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof input?.listing_id !== "string" || !UUID.test(input.listing_id)) return fail("not_found");
  const { data, error } = await supabase.rpc("get_donation_info", { p_listing_id: input.listing_id });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as DonationInfo);
}
