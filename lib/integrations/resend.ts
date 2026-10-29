import "server-only";

import { format, getDictionary, type Dictionary, type Locale } from "@/lib/i18n";

// Resend adapter (TC ADR-08, §8.1 RESEND_API_KEY / EMAIL_FROM; API §9.4): an email is a Design §9.1
// template id + the recipient's locale + variables. Copy lives in lib/i18n under messages.<id>; every
// email ends with messages.email_footer. Sent through Resend's HTTP API with the platform fetch.
// Retries: 3 tries inside the dispatch run (now, +1 s, +3 s) on network errors, 429 and 5xx, then
// `failed` (the delivery row records it). Other 4xx answers fail at once.
// Local mode: with RESEND_API_KEY empty outside production the rendered email is logged with
// console.info and reported as sent with id "local-<uuid>". Env vars are read at call time.

export const RESEND_API_URL = "https://api.resend.com/emails";
export const RETRY_DELAYS_MS = [0, 1000, 3000] as const;

export type ReminderEmailVariables = {
  /** First word of profiles.full_name; null → the greeting without a name. */
  first_name: string | null;
  /** Pet name (nominative) or "Za mene" / "For me". */
  pet: string;
  title: string;
  date: string;
  time: string;
  /** EP-32 action link. */
  done_url: string;
  /** /podsetnici in the app. */
  app_url: string;
};

export type HouseholdInvitationEmailVariables = {
  /** profiles.full_name of the inviting owner. */
  inviter: string;
  household: string;
  /** Shared pet names joined with Intl.ListFormat; null → the body without " ({pets})" (owner decision, Step 22). */
  pets: string | null;
  /** household_invitations.expires_at in the recipient's date format. */
  date: string;
  /** invite_url — /poziv/<token> (EP-35). */
  url: string;
};

export type AccountDeletionScheduledEmailVariables = {
  /** profiles.deletion_due_at in the recipient's date format. */
  date: string;
  /** NEXT_PUBLIC_SITE_URL/profil/podaci — S19, where the deletion is cancelled (owner decision, Step 23). */
  url: string;
};

export type TeamInvitationEmailVariables = {
  /** profiles.full_name of the inviting Admin. */
  inviter: string;
  /** organisations.name. */
  organisation: string;
  /** organisation_invitations.role, shown as Admin / Volonter (Volunteer) in the recipient's language. */
  role: "admin" | "volunteer";
  /** organisation_invitations.expires_at in the recipient's date format. */
  date: string;
  /** /poziv/<token> (EP-56). */
  url: string;
};

export type RecordTransferEmailVariables = {
  /** organisations.name of the sending organisation. */
  organisation: string;
  /** pets.name (nominative). */
  pet: string;
  /** record_transfers.expires_at in the recipient's date format. */
  date: string;
  /** /poziv/<token> (EP-59). */
  url: string;
};

export type OrgRequestAcceptedEmailVariables = {
  organisation: string;
  pet: string;
  /** The organisation's contact details (BR-36). */
  org_phone: string;
  org_email: string;
};

export type OrgRequestRejectedEmailVariables = {
  organisation: string;
  pet: string;
  /** The organisation's public page /o/<slug> (S23). */
  url: string;
};

export type ShelterApprovedEmailVariables = {
  /** organisations.name. */
  organisation: string;
  /** NEXT_PUBLIC_SITE_URL/organizacija (owner decision, Step 28). */
  url: string;
};

export type ShelterRejectedEmailVariables = {
  organisation: string;
  /** organisations.rejection_reason; when given, "Razlog: {reason}." is appended (owner decision, Step 28). */
  reason: string | null;
};

export type ListingExpiringEmailVariables = {
  /** listings.title. */
  listing: string;
  /** listings.expires_at as a Europe/Belgrade date in the recipient's date format. */
  date: string;
  /** NEXT_PUBLIC_SITE_URL/sapa-pomoci/moje?produzi=<listing_id> — S35 extends after sign-in (EP-77). */
  extend_url: string;
  /** NEXT_PUBLIC_SITE_URL/sapa-pomoci/moje — S35. */
  manage_url: string;
};

export type ListingExpiredEmailVariables = {
  listing: string;
  /** listings.expires_at as a Europe/Belgrade date in the recipient's date format. */
  date: string;
  /** NEXT_PUBLIC_SITE_URL/sapa-pomoci/moje — S35 (Objavi ponovo). */
  url: string;
};

export type NewMessageEmailVariables = {
  /** First word of the recipient's profiles.full_name; null → the greeting without a name (as reminder_email). */
  first_name: string | null;
  /** listings.title, or the "listing deleted" label. */
  listing: string;
  /** The sender's display name (never declined, Design §9.1). */
  sender: string;
  /** The first 120 characters of the message. */
  preview: string;
  /** NEXT_PUBLIC_SITE_URL/poruke/<conversation_id> — S36. */
  url: string;
};

export type ListingHiddenEmailVariables = {
  listing: string;
  /** The Operator's reason_note, or the report reason label (Design §9.1). */
  reason: string;
  /** NEXT_PUBLIC_SITE_URL/sapa-pomoci/moje — S35. */
  url: string;
};

export type MarketplaceSuspendedEmailVariables = {
  /** The Operator's reason_note, or the report reason label (Design §9.1). */
  reason: string;
};

/** Template ids of Design §9.1 this adapter renders. Later steps add theirs here. */
export type EmailTemplate =
  | { id: "reminder_email"; variables: ReminderEmailVariables }
  | { id: "household_invitation"; variables: HouseholdInvitationEmailVariables }
  | { id: "account_deletion_scheduled"; variables: AccountDeletionScheduledEmailVariables }
  | { id: "team_invitation"; variables: TeamInvitationEmailVariables }
  | { id: "record_transfer"; variables: RecordTransferEmailVariables }
  | { id: "adoption_request_accepted"; variables: OrgRequestAcceptedEmailVariables }
  | { id: "adoption_request_rejected"; variables: OrgRequestRejectedEmailVariables }
  | { id: "breeder_inquiry_accepted"; variables: OrgRequestAcceptedEmailVariables }
  | { id: "breeder_inquiry_rejected"; variables: OrgRequestRejectedEmailVariables }
  | { id: "shelter_approved"; variables: ShelterApprovedEmailVariables }
  | { id: "shelter_rejected"; variables: ShelterRejectedEmailVariables }
  | { id: "listing_expiring"; variables: ListingExpiringEmailVariables }
  | { id: "listing_expired"; variables: ListingExpiredEmailVariables }
  | { id: "new_message"; variables: NewMessageEmailVariables }
  | { id: "listing_hidden"; variables: ListingHiddenEmailVariables }
  | { id: "marketplace_suspended"; variables: MarketplaceSuspendedEmailVariables };

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailResult = { status: "delivered"; id: string } | { status: "failed"; error: string };

export type ResendConfig = {
  apiKey: string;
  from: string;
  production: boolean;
  /** Injected in tests (fake Resend); the global fetch otherwise. */
  fetch?: typeof fetch;
  /** Injected in tests so retries do not wait. */
  sleep?: (ms: number) => Promise<void>;
};

export function resendConfigFromEnv(): ResendConfig {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "",
    production: process.env.NODE_ENV === "production",
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type EmailParts = {
  subject: string;
  /** Paragraph with already escaped HTML. */
  bodyHtml: string;
  bodyText: string;
  buttons: { label: string; url: string; primary: boolean }[];
  note: string | null;
};

/**
 * Design §4.1 token values for HTML that cannot read the CSS variables of app/globals.css: emails and
 * the EP-32 action pages (owner decision, Step 19). The only raw colours outside globals.css and the
 * manifest; tests/design/no-raw-hex.test.ts checks they equal the globals.css tokens.
 */
export const TOKEN_COLORS = {
  background: "#F6F1EB",
  foreground: "#2A1D14",
  card: "#FFFFFF",
  mutedForeground: "#6B5B4E",
  primary: "#563218",
  primaryForeground: "#FFFFFF",
  secondary: "#EFE7DF",
  border: "#D9CCBF",
} as const;

/** Subject, body and (optional) button of a template whose variables are all plain strings. */
function simple(
  copy: { subject: string; body: string; button?: string },
  values: Record<string, string>,
  url: string | null,
): EmailParts {
  const escaped = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, escapeHtml(value)]));
  return {
    subject: format(copy.subject, values),
    bodyHtml: format(escapeHtml(copy.body), escaped),
    bodyText: format(copy.body, values),
    buttons: copy.button && url ? [{ label: copy.button, url, primary: true }] : [],
    note: null,
  };
}

/** "Razlog: {reason}." — no second full stop when the Operator's note already ends a sentence. */
function withReason(body: string, reason: string): string {
  return /[.!?…]$/.test(reason.trim()) ? body.replace("{reason}.", "{reason}") : body;
}

const RENDERERS: { [K in EmailTemplate["id"]]: (t: Dictionary, v: Extract<EmailTemplate, { id: K }>["variables"]) => EmailParts } = {
  record_transfer(t, v) {
    return simple(t.messages.record_transfer, { organisation: v.organisation, pet: v.pet, date: v.date }, v.url);
  },
  adoption_request_accepted(t, v) {
    return simple(t.messages.adoption_request_accepted, { ...v }, null);
  },
  adoption_request_rejected(t, v) {
    return simple(t.messages.adoption_request_rejected, { organisation: v.organisation, pet: v.pet }, v.url);
  },
  breeder_inquiry_accepted(t, v) {
    return simple(t.messages.breeder_inquiry_accepted, { ...v }, null);
  },
  breeder_inquiry_rejected(t, v) {
    return simple(t.messages.breeder_inquiry_rejected, { organisation: v.organisation, pet: v.pet }, v.url);
  },
  listing_expiring(t, v) {
    const date = v.date;
    const copy = t.messages.listing_expiring;
    // A Serbian date already ends with a full stop ("19. 10. 2026."), and the sentence ends right after {date}.
    const body = date.endsWith(".") ? copy.body.replace("{date}.", "{date}") : copy.body;
    return {
      subject: format(copy.subject, { listing: v.listing }),
      bodyHtml: format(escapeHtml(body), { listing: `<strong>${escapeHtml(v.listing)}</strong>`, date: escapeHtml(date) }),
      bodyText: format(body, { listing: v.listing, date }),
      buttons: [
        { label: copy.extend, url: v.extend_url, primary: true },
        { label: copy.resolve, url: v.manage_url, primary: false },
      ],
      note: null,
    };
  },
  listing_expired(t, v) {
    const copy = t.messages.listing_expired;
    return {
      subject: format(copy.subject, { listing: v.listing }),
      bodyHtml: format(escapeHtml(copy.body), { listing: `<strong>${escapeHtml(v.listing)}</strong>`, date: escapeHtml(v.date) }),
      bodyText: format(copy.body, { listing: v.listing, date: v.date }),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
  new_message(t, v) {
    const copy = t.messages.new_message;
    const template = v.first_name ? copy.body : copy.bodyNoName;
    const values = { first_name: v.first_name ?? "", sender: v.sender, preview: v.preview };
    const escaped = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, escapeHtml(value)]));
    return {
      subject: format(copy.subject, { listing: v.listing }),
      bodyHtml: format(escapeHtml(template), { ...escaped, listing: `<strong>${escapeHtml(v.listing)}</strong>` }),
      bodyText: format(template, { ...values, listing: v.listing }),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
  listing_hidden(t, v) {
    const copy = t.messages.listing_hidden;
    const body = withReason(copy.body, v.reason);
    return {
      subject: format(copy.subject, { listing: v.listing }),
      bodyHtml: format(escapeHtml(body), { listing: `<strong>${escapeHtml(v.listing)}</strong>`, reason: escapeHtml(v.reason) }),
      bodyText: format(body, { listing: v.listing, reason: v.reason }),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
  marketplace_suspended(t, v) {
    const copy = t.messages.marketplace_suspended;
    const body = withReason(copy.body, v.reason);
    return {
      subject: copy.subject,
      bodyHtml: format(escapeHtml(body), { reason: escapeHtml(v.reason) }),
      bodyText: format(body, { reason: v.reason }),
      buttons: [],
      note: null,
    };
  },
  shelter_approved(t, v) {
    return simple(t.messages.shelter_approved, { organisation: v.organisation }, v.url);
  },
  shelter_rejected(t, v) {
    const copy = t.messages.shelter_rejected;
    const reason = v.reason?.trim() ? ` ${format(copy.reason, { reason: v.reason.trim() })}` : "";
    return {
      subject: format(copy.subject, { organisation: v.organisation }),
      bodyHtml: format(escapeHtml(copy.body), { organisation: escapeHtml(v.organisation) }) + escapeHtml(reason),
      bodyText: format(copy.body, { organisation: v.organisation }) + reason,
      buttons: [],
      note: null,
    };
  },
  reminder_email(t, v) {
    const copy = t.messages.reminder_email;
    const template = v.first_name ? copy.body : copy.bodyNoName;
    const values = { first_name: v.first_name ?? "", pet: v.pet, date: v.date, time: v.time };
    const escaped = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, escapeHtml(value)]));
    return {
      subject: format(copy.subject, { pet: v.pet, title: v.title }),
      bodyHtml: format(escapeHtml(template), { ...escaped, title: `<strong>${escapeHtml(v.title)}</strong>` }),
      bodyText: format(template, { ...values, title: v.title }),
      buttons: [
        { label: copy.done, url: v.done_url, primary: true },
        { label: copy.open, url: v.app_url, primary: false },
      ],
      note: copy.note,
    };
  },
  household_invitation(t, v) {
    const copy = t.messages.household_invitation;
    const template = v.pets ? copy.body : copy.bodyNoPets;
    const values = { inviter: v.inviter, household: v.household, pets: v.pets ?? "", date: v.date };
    const escaped = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, escapeHtml(value)]));
    return {
      subject: format(copy.subject, { inviter: v.inviter, household: v.household }),
      bodyHtml: format(escapeHtml(template), escaped),
      bodyText: format(template, values),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
  account_deletion_scheduled(t, v) {
    const copy = t.messages.account_deletion_scheduled;
    return {
      subject: format(copy.subject, { date: v.date }),
      bodyHtml: format(escapeHtml(copy.body), { date: escapeHtml(v.date) }),
      bodyText: format(copy.body, { date: v.date }),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
  team_invitation(t, v) {
    const copy = t.messages.team_invitation;
    const values = {
      inviter: v.inviter,
      organisation: v.organisation,
      role: v.role === "admin" ? copy.roleAdmin : copy.roleVolunteer,
      date: v.date,
    };
    const escaped = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, escapeHtml(value)]));
    return {
      subject: format(copy.subject, { organisation: v.organisation }),
      bodyHtml: format(escapeHtml(copy.body), escaped),
      bodyText: format(copy.body, values),
      buttons: [{ label: copy.button, url: v.url, primary: true }],
      note: null,
    };
  },
};

/** Renders a Design §9.1 email in the recipient's locale, with the shared footer. */
export function renderEmail(template: EmailTemplate, locale: Locale): RenderedEmail {
  const t = getDictionary(locale);
  // The map is keyed by id, so each renderer gets its own template's variables.
  const render = RENDERERS[template.id] as (t: Dictionary, v: EmailTemplate["variables"]) => EmailParts;
  const parts = render(t, template.variables);
  const footer = t.messages.email_footer;
  const button = (b: EmailParts["buttons"][number]) =>
    `<a href="${escapeHtml(b.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 16px;border-radius:8px;` +
    `font-weight:600;text-decoration:none;${
      b.primary
        ? `background:${TOKEN_COLORS.primary};color:${TOKEN_COLORS.primaryForeground};`
        : `background:${TOKEN_COLORS.secondary};color:${TOKEN_COLORS.foreground};border:1px solid ${TOKEN_COLORS.border};`
    }">${escapeHtml(b.label)}</a>`;
  const html =
    `<!doctype html><html lang="${locale === "en" ? "en" : "sr-Latn"}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(parts.subject)}</title></head>` +
    `<body style="margin:0;padding:24px 16px;background:${TOKEN_COLORS.background};color:${TOKEN_COLORS.foreground};` +
    `font-family:Inter,Arial,sans-serif;font-size:16px;line-height:24px;">` +
    `<div style="max-width:560px;margin:0 auto;background:${TOKEN_COLORS.card};border:1px solid ${TOKEN_COLORS.border};border-radius:12px;padding:24px;">` +
    `<p style="margin:0 0 16px;">${parts.bodyHtml}</p>` +
    `<div>${parts.buttons.map(button).join("")}</div>` +
    (parts.note ? `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${TOKEN_COLORS.mutedForeground};">${escapeHtml(parts.note)}</p>` : "") +
    `</div>` +
    `<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:16px;color:${TOKEN_COLORS.mutedForeground};">${escapeHtml(footer)}</p>` +
    `</body></html>`;
  const text = [
    parts.bodyText,
    "",
    ...parts.buttons.map((b) => `${b.label}: ${b.url}`),
    ...(parts.note ? ["", parts.note] : []),
    "",
    "--",
    footer,
  ].join("\n");
  return { subject: parts.subject, html, text };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends one email: 3 tries on transient failures, then `failed`. */
export async function sendEmail(
  input: { to: string; template: EmailTemplate; locale: Locale },
  config: ResendConfig = resendConfigFromEnv(),
): Promise<EmailResult> {
  const email = renderEmail(input.template, input.locale);

  if (!config.apiKey) {
    if (config.production) return { status: "failed", error: "resend_not_configured" };
    console.info(`[resend] local mode — not sent (${input.template.id}, ${input.locale}) to ${input.to}\n` +
      `Subject: ${email.subject}\n\n${email.text}`);
    return { status: "delivered", id: `local-${crypto.randomUUID()}` };
  }

  const doFetch = config.fetch ?? fetch;
  const sleep = config.sleep ?? defaultSleep;
  let lastError = "resend_failed";
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    let response: Response;
    try {
      response = await doFetch(RESEND_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, to: [input.to], subject: email.subject, html: email.html, text: email.text }),
      });
    } catch (error) {
      lastError = `network: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      return { status: "delivered", id: typeof body?.id === "string" ? body.id : "" };
    }
    const detail = await response.text().catch(() => "");
    lastError = `resend_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    if (response.status !== 429 && response.status < 500) break;
  }
  return { status: "failed", error: lastError };
}
