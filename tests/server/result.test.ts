import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ERROR_CODES, fromAuthError, fromDatabaseError, fail, ok } = await import("@/lib/server/result");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("database error → ApiError (TC §5.7.1, API §7.1)", () => {
  it("'<code>' maps to { code }", () => {
    expect(fromDatabaseError({ code: "P0001", message: "household_full" })).toEqual({
      code: "household_full",
      message: "household_full",
    });
  });

  it.each(["pets", "memorials", "attachments", "moments", "pdf_export", "household", "whatsapp", "transfer_slot"])(
    "'premium_required:%s' maps to details.limit",
    (limit) => {
      expect(fromDatabaseError({ code: "P0001", message: `premium_required:${limit}` })).toMatchObject({
        code: "premium_required",
        details: { limit },
      });
    },
  );

  it("'premium_required:listings' maps to details.limit = listings", () => {
    expect(fromDatabaseError({ code: "P0001", message: "premium_required:listings" })).toMatchObject({
      code: "premium_required",
      details: { limit: "listings" },
    });
  });

  it("'whatsapp_not_connected:<channel>' maps to details.channel", () => {
    expect(fromDatabaseError({ code: "P0001", message: "whatsapp_not_connected:viber" })).toMatchObject({
      code: "whatsapp_not_connected",
      details: { channel: "viber" },
    });
  });

  it("a detail on a code that defines no details key is dropped", () => {
    const error = fromDatabaseError({ code: "P0001", message: "organisation_pending_approval:rejected" });
    expect(error.code).toBe("organisation_pending_approval");
    expect(error.details).toBeUndefined();
  });

  it("every §7.2 catalog code raised as '<code>' keeps its code", () => {
    for (const code of ERROR_CODES) {
      expect(fromDatabaseError({ code: "P0001", message: code }).code).toBe(code);
    }
  });

  it("a code not in §7.2 maps to internal_error and logs the original message", () => {
    const error = fromDatabaseError({ code: "P0001", message: "no_such_code:x" });
    expect(error.code).toBe("internal_error");
    expect(error.message).toBe("no_such_code:x");
    expect(console.error).toHaveBeenCalledWith(expect.any(String), "no_such_code:x");
  });

  it("a non-P0001 database error maps to internal_error", () => {
    expect(fromDatabaseError({ code: "42501", message: "permission denied for table pets" }).code).toBe(
      "internal_error",
    );
  });
});

describe("Supabase Auth error → ApiError (EP-41, EP-42)", () => {
  it("wrong credentials → unauthenticated with reason invalid_credentials", () => {
    expect(fromAuthError({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" })).toMatchObject({
      code: "unauthenticated",
      details: { reason: "invalid_credentials" },
    });
  });

  it("email not confirmed → email_not_verified", () => {
    expect(fromAuthError({ code: "email_not_confirmed", status: 400, message: "Email not confirmed" }).code).toBe(
      "email_not_verified",
    );
  });

  it("auth rate limits → rate_limited", () => {
    expect(fromAuthError({ code: "over_email_send_rate_limit", status: 429, message: "x" }).code).toBe("rate_limited");
    expect(fromAuthError({ status: 429, message: "x" }).code).toBe("rate_limited");
  });

  it("weak password → validation_failed with fields.password = too_weak", () => {
    expect(fromAuthError({ code: "weak_password", status: 422, message: "x" })).toMatchObject({
      code: "validation_failed",
      fields: { password: "too_weak" },
    });
  });

  it("anything else → internal_error", () => {
    expect(fromAuthError({ code: "unexpected_failure", status: 500, message: "x" }).code).toBe("internal_error");
  });
});

describe("ActionResult (API §3.6)", () => {
  it("ok and fail build the discriminated result", () => {
    expect(ok(1)).toEqual({ ok: true, data: 1 });
    expect(fail("not_found")).toEqual({ ok: false, error: { code: "not_found", message: "not_found" } });
  });
});
