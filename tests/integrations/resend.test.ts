// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { renderEmail, sendEmail, RESEND_API_URL } = await import("@/lib/integrations/resend");
type EmailTemplate = import("@/lib/integrations/resend").EmailTemplate;

// lib/integrations/resend.ts (TC ADR-08; API §9.4) against a fake Resend: Design §9.1 reminder_email
// rendered in the recipient's locale with the shared email_footer; 3 tries, then failed; local mode
// without RESEND_API_KEY.

const variables = {
  first_name: "Ivana",
  pet: "Luna",
  title: "Besnilo",
  date: "19. 10. 2026.",
  time: "08:00",
  done_url: "https://mojljubimac.rs/api/a/done?t=dn_abc.def",
  app_url: "https://mojljubimac.rs/podsetnici",
};
const template: EmailTemplate = { id: "reminder_email", variables };

function fakeResend(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const config = (fetchImpl: typeof fetch, sleep = vi.fn(async () => {})) => ({
  apiKey: "re_test",
  from: "Moj Ljubimac <podsetnici@mojljubimac.rs>",
  production: true,
  fetch: fetchImpl,
  sleep,
});

describe("renderEmail — Design §9.1 reminder_email", () => {
  it("renders the Serbian copy with the bold title, both buttons, the note and the footer", () => {
    const email = renderEmail(template, "sr");
    expect(email.subject).toBe("Luna: Besnilo");
    expect(email.html).toContain("Zdravo, Ivana! Podsetnik: <strong>Besnilo</strong> — Luna, 19. 10. 2026. u 08:00.");
    expect(email.html).toContain(`href="${variables.done_url}"`);
    expect(email.html).toMatch(/>Urađeno<\/a>/);
    expect(email.html).toMatch(/href="https:\/\/mojljubimac\.rs\/podsetnici"[^>]*>Otvori u aplikaciji<\/a>/);
    expect(email.html).toContain("Dugme „Urađeno“ važi 24 sata.");
    expect(email.html).toContain("Moj Ljubimac · Ovaj mejl ti šaljemo jer imaš nalog. Obaveštenja menjaš u Podešavanjima.");
    expect(email.html).toContain('lang="sr-Latn"');
    expect(email.text).toContain("Zdravo, Ivana! Podsetnik: Besnilo — Luna, 19. 10. 2026. u 08:00.");
    expect(email.text).toContain(`Urađeno: ${variables.done_url}`);
  });

  it("renders English for an English recipient", () => {
    const email = renderEmail({ id: "reminder_email", variables: { ...variables, date: "19 Oct 2026" } }, "en");
    expect(email.subject).toBe("Luna: Besnilo");
    expect(email.html).toContain("Hi Ivana! Reminder: <strong>Besnilo</strong> — Luna, 19 Oct 2026 at 08:00.");
    expect(email.html).toMatch(/>Done<\/a>/);
    expect(email.html).toContain(">Open in the app</a>");
    expect(email.html).toContain("The &quot;Done&quot; button works for 24 hours.");
    expect(email.html).toContain("Moj Ljubimac · You&#39;re getting this email because you have an account. Change notifications in Settings.");
    expect(email.html).toContain('lang="en"');
  });

  it("greets without a name when the profile has none (owner decision)", () => {
    expect(renderEmail({ id: "reminder_email", variables: { ...variables, first_name: null } }, "sr").text).toContain(
      "Zdravo! Podsetnik: Besnilo — Luna",
    );
    expect(renderEmail({ id: "reminder_email", variables: { ...variables, first_name: null } }, "en").text).toContain(
      "Hi! Reminder: Besnilo — Luna",
    );
  });

  it("escapes user-entered values", () => {
    const email = renderEmail({ id: "reminder_email", variables: { ...variables, title: "<img src=x>", pet: "Maks & Co" } }, "sr");
    expect(email.html).toContain("<strong>&lt;img src=x&gt;</strong> — Maks &amp; Co");
    expect(email.html).not.toContain("<img src=x>");
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the rendered email to the Resend API and returns its id", async () => {
    const { fetchImpl, calls } = fakeResend([new Response(JSON.stringify({ id: "re_123" }), { status: 200 })]);
    const result = await sendEmail({ to: "ivana.petrovic@mojljubimac.test", template, locale: "sr" }, config(fetchImpl));
    expect(result).toEqual({ status: "delivered", id: "re_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_API_URL);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      from: "Moj Ljubimac <podsetnici@mojljubimac.rs>",
      to: ["ivana.petrovic@mojljubimac.test"],
      subject: "Luna: Besnilo",
    });
    expect(body.html).toContain("Podsetnik:");
  });

  it("tries 3 times (now, +1 s, +3 s), then reports failed", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeResend([
      new Response("busy", { status: 500 }),
      new Response("busy", { status: 503 }),
      new Response("slow down", { status: 429 }),
    ]);
    const result = await sendEmail({ to: "a@b.test", template, locale: "sr" }, config(fetchImpl, sleep));
    expect(calls).toHaveLength(3);
    expect(sleep.mock.calls).toEqual([[1000], [3000]]);
    expect(result).toEqual({ status: "failed", error: "resend_429: slow down" });
  });

  it("succeeds on a later try", async () => {
    const { fetchImpl, calls } = fakeResend([new Error("socket hang up"), new Response(JSON.stringify({ id: "re_2" }), { status: 200 })]);
    expect(await sendEmail({ to: "a@b.test", template, locale: "sr" }, config(fetchImpl))).toEqual({ status: "delivered", id: "re_2" });
    expect(calls).toHaveLength(2);
  });

  it("does not retry a permanent rejection", async () => {
    const { fetchImpl, calls } = fakeResend([new Response("invalid to", { status: 422 })]);
    expect(await sendEmail({ to: "bad", template, locale: "sr" }, config(fetchImpl))).toEqual({
      status: "failed",
      error: "resend_422: invalid to",
    });
    expect(calls).toHaveLength(1);
  });

  it("network errors on every try → failed", async () => {
    const { fetchImpl, calls } = fakeResend([new Error("down"), new Error("down"), new Error("down")]);
    expect(await sendEmail({ to: "a@b.test", template, locale: "sr" }, config(fetchImpl))).toEqual({
      status: "failed",
      error: "network: down",
    });
    expect(calls).toHaveLength(3);
  });

  it("local mode: no API key outside production logs the email and sends nothing", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { fetchImpl, calls } = fakeResend([]);
    const result = await sendEmail(
      { to: "a@b.test", template, locale: "sr" },
      { apiKey: "", from: "", production: false, fetch: fetchImpl },
    );
    expect(result.status).toBe("delivered");
    if (result.status === "delivered") expect(result.id).toMatch(/^local-[0-9a-f-]{36}$/);
    expect(calls).toHaveLength(0);
    expect(info.mock.calls[0][0]).toContain("Subject: Luna: Besnilo");
  });

  it("no API key in production → failed", async () => {
    const { fetchImpl } = fakeResend([]);
    expect(
      await sendEmail({ to: "a@b.test", template, locale: "sr" }, { apiKey: "", from: "", production: true, fetch: fetchImpl }),
    ).toEqual({ status: "failed", error: "resend_not_configured" });
  });
});
