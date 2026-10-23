"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromAuthError, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, parseLocale, type Locale, type ProfileLocale } from "@/lib/i18n";
import { TERMS_VERSION } from "@/lib/legal";

// EP-41 (sign-up, complete_registration), EP-43 (update me) and the visitor language
// cookie. The session lives in httpOnly cookies (API §4.1), so sign-up runs here on the server.

/** API §6 City. */
export type City = { id: string; name_sr: string; name_en: string; latitude: number; longitude: number };

/** API §6 Me (Me.display_name and Me.marketplace arrive in Step 28b). */
export type Me = {
  id: string;
  email: string;
  full_name: string | null;
  account_type: AccountType;
  locale: ProfileLocale;
  city: City | null;
  is_operator: boolean;
  terms_version: string;
  terms_accepted_at: string;
  deletion_requested_at: string | null;
  deletion_due_at: string | null;
  deletion_days_left: number | null;
  organisation: {
    id: string;
    name: string;
    type: "shelter" | "breeder";
    slug: string;
    role: "admin" | "volunteer";
    approval_status: "pending" | "approved" | "rejected";
  } | null;
  entitlements: {
    plan: "free" | "premium" | "breeder";
    premium: boolean;
    breeder_plan: boolean;
    subscription_status: "trialing" | "active" | "cancelled" | "expired" | "payment_failed" | null;
    premium_until: string | null;
    days_left: number | null;
    auto_renew: boolean | null;
    trial_available: boolean;
    limits: {
      active_pets: number | null;
      memorials: number | null;
      attachments_per_pet: number | null;
      moments_per_pet: number | null;
      household_members: number;
    };
    channels: ("email" | "push" | "whatsapp" | "viber")[];
    pdf_export: boolean;
    household_sharing: boolean;
    logo_removal: boolean;
  };
  usage: {
    active_pets: number;
    memorials: number;
    household_members: number | null;
    attachments_by_pet: { pet_id: string; pet_name: string; count: number }[];
    moments_by_pet: { pet_id: string; pet_name: string; count: number }[];
    free_slot_pet: { id: string; name: string } | null;
    whatsapp_connected: boolean;
  };
};

export type AccountType = "owner" | "shelter" | "breeder";

export type RegistrationInput = {
  account_type: AccountType;
  locale: ProfileLocale;
  terms_version: string;
  org_name?: string | null;
  city_id?: string | null;
  tax_id?: string | null;
  registration_note?: string | null;
};

export type SignUpInput = RegistrationInput & { email: string; password: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const ACCOUNT_TYPES: readonly AccountType[] = ["owner", "shelter", "breeder"];

// Visitor language (owner decision, Step 12) --------------------------------------------------

/** The `ml_locale` cookie of this request; no cookie (or no request scope) → sr. */
export async function getVisitorLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    return parseLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return parseLocale(null);
  }
}

async function writeLocaleCookie(locale: Locale) {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
}

/** The S15 SR/EN switch: remembers the visitor's language for every auth-free page. */
export async function setVisitorLocale(locale: Locale): Promise<ActionResult<{ locale: Locale }>> {
  if (locale !== "sr" && locale !== "en") return fail("validation_failed", { fields: { locale: "invalid" } });
  await writeLocaleCookie(locale);
  return ok({ locale });
}

// Validation (EP-41 Request) --------------------------------------------------------------

async function siteOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function isOrganisation(type: AccountType) {
  return type === "shelter" || type === "breeder";
}

async function validateRegistration(
  supabase: Supabase,
  input: RegistrationInput,
): Promise<{ fields: Record<string, string> } | { error: ActionResult<never> } | null> {
  const fields: Record<string, string> = {};
  if (!ACCOUNT_TYPES.includes(input.account_type)) fields.account_type = "required";
  if (input.locale !== "sr-Latn" && input.locale !== "en") fields.locale = "invalid";
  if (!input.terms_version) fields.terms_version = "required";
  else if (input.terms_version !== TERMS_VERSION) fields.terms_version = "outdated";

  if (isOrganisation(input.account_type)) {
    const name = (input.org_name ?? "").trim();
    if (name.length < 2 || name.length > 120) fields.org_name = "invalid";
    if (!input.city_id) fields.city_id = "unknown";
    else {
      const { data, error } = await supabase.from("cities").select("id").eq("id", input.city_id).maybeSingle();
      if (error) return { error: { ok: false, error: fromDatabaseError(error) } };
      if (!data) fields.city_id = "unknown";
    }
    if (input.tax_id && !/^\d{9}$/.test(input.tax_id)) fields.tax_id = "invalid";
  }
  if (input.registration_note && input.registration_note.length > 500) fields.registration_note = "too_long";
  return Object.keys(fields).length > 0 ? { fields } : null;
}

// EP-41 sign-up ---------------------------------------------------------------------------

/** EP-41 sign-up: verification pending → S15 email_sent; the profile is created after the link (callback). */
export async function signUp(input: SignUpInput): Promise<ActionResult<{ email: string }>> {
  const supabase = await createClient();
  const fields: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(input.email)) fields.email = "invalid";
  if (input.password.length < MIN_PASSWORD_LENGTH) fields.password = "too_weak";
  const checked = await validateRegistration(supabase, input);
  if (checked && "error" in checked) return checked.error;
  Object.assign(fields, checked?.fields);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const org = isOrganisation(input.account_type);
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
      data: {
        account_type: input.account_type,
        locale: input.locale,
        terms_version: input.terms_version,
        org_name: org ? (input.org_name ?? "").trim() : null,
        city_id: org ? (input.city_id ?? null) : null,
        tax_id: org ? input.tax_id || null : null,
        registration_note: input.registration_note ?? null,
      },
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return fail("validation_failed", { message: error.message, fields: { email: "taken" } });
    }
    return { ok: false, error: fromAuthError(error) };
  }
  // An existing address comes back as a user without identities (no enumeration by Supabase).
  if (data.user && (data.user.identities ?? []).length === 0) {
    return fail("validation_failed", { fields: { email: "taken" } });
  }
  return ok({ email: input.email });
}

// EP-41 complete_registration ---------------------------------------------------------------

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "organizacija";
}

async function readMe(supabase: Supabase): Promise<ActionResult<Me | null>> {
  const { data, error } = await supabase.rpc("get_me");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok((data ?? null) as Me | null);
}

async function insertOrganisation(supabase: Supabase, userId: string, input: RegistrationInput) {
  const name = (input.org_name ?? "").trim();
  const base = slugify(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const { error } = await supabase.from("organisations").insert({
      id: crypto.randomUUID(),
      type: input.account_type as "shelter" | "breeder",
      name,
      slug,
      city_id: input.city_id ?? null,
      tax_id: input.tax_id || null,
      registration_note: input.registration_note ?? null,
      created_by: userId,
    });
    if (!error) return null;
    if (error.code !== "23505") return error;
  }
  return { code: "23505", message: "organisations.slug: no free slug" };
}

/**
 * EP-41 action:complete_registration → Me. Called by /auth/callback after the verification
 * link (payload from user_metadata) and by the S15 completion step after a first Google
 * sign-in. Exempt from the profile gates; idempotent when a profile already exists.
 */
export async function completeRegistration(input: RegistrationInput): Promise<ActionResult<Me>> {
  const supabase = await createClient();
  const gate = await checkGates(supabase, { access: "read" });
  if (!gate.ok) return gate;
  const { user, profile, organisations } = gate.data;

  if (profile) {
    // A profile exists. The one gap to close: an organisation account whose organisation
    // insert failed after its profile insert (two Data API calls) gets its organisation now.
    const { data: existing } = await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle();
    const type = existing?.account_type;
    if (type && isOrganisation(type) && organisations.length === 0 && input.account_type === type && input.org_name) {
      const checked = await validateRegistration(supabase, { ...input, terms_version: TERMS_VERSION });
      if (!checked) {
        const orgError = await insertOrganisation(supabase, user.id, input);
        if (orgError) return { ok: false, error: fromDatabaseError(orgError) };
      }
    }
    const me = await readMe(supabase);
    if (!me.ok) return me;
    return me.data ? ok(me.data) : fail("internal_error");
  }

  const checked = await validateRegistration(supabase, input);
  if (checked && "error" in checked) return checked.error;
  if (checked) return fail("validation_failed", { fields: checked.fields });

  const { error: profileError } = await supabase.from("profiles").insert({
    id: user.id,
    account_type: input.account_type,
    locale: input.locale,
    email: user.email ?? "",
    terms_accepted_at: new Date().toISOString(),
    terms_version: input.terms_version,
  });
  if (profileError) return { ok: false, error: fromDatabaseError(profileError) };

  if (isOrganisation(input.account_type)) {
    // Shelter → pending, breeder → approved (BR-32 trigger); the creator becomes Admin.
    // The Operator notification for a pending shelter is not sent yet (CR-24, Step 19).
    const orgError = await insertOrganisation(supabase, user.id, input);
    if (orgError) return { ok: false, error: fromDatabaseError(orgError) };
  }

  const me = await readMe(supabase);
  if (!me.ok) return me;
  return me.data ? ok(me.data) : fail("internal_error");
}

// EP-43 update ---------------------------------------------------------------------------

export type UpdateMeInput = { full_name?: string | null; city_id?: string | null; locale?: ProfileLocale };

/** EP-43 update (S18): name, city, language. A language change also updates `ml_locale`. */
export async function updateMe(input: UpdateMeInput): Promise<ActionResult<Me>> {
  const supabase = await createClient();
  // EP-43 lists no organisation gate: only the session, verification and pending deletion apply.
  const gate = await checkGates(supabase, { access: "read" });
  if (!gate.ok) return gate;
  if (!gate.data.profile) return fail("not_found");

  const fields: Record<string, string> = {};
  const patch: { full_name?: string | null; city_id?: string | null; locale?: ProfileLocale } = {};
  if (input.full_name !== undefined) {
    const name = input.full_name?.trim() || null;
    if (name && name.length > 100) fields.full_name = "too_long";
    patch.full_name = name;
  }
  if (input.city_id !== undefined) {
    if (input.city_id) {
      const { data, error } = await supabase.from("cities").select("id").eq("id", input.city_id).maybeSingle();
      if (error) return { ok: false, error: fromDatabaseError(error) };
      if (!data) fields.city_id = "unknown";
    }
    patch.city_id = input.city_id || null;
  }
  if (input.locale !== undefined) {
    if (input.locale !== "sr-Latn" && input.locale !== "en") fields.locale = "invalid";
    patch.locale = input.locale;
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const { error } = await supabase.from("profiles").update(patch).eq("id", gate.data.user.id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };

  if (patch.locale) await writeLocaleCookie(patch.locale === "en" ? "en" : "sr");

  const me = await readMe(supabase);
  if (!me.ok) return me;
  return me.data ? ok(me.data) : fail("internal_error");
}
