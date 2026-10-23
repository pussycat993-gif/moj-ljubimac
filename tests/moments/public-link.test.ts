import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-19 / BR-45 / E-07 — EP-23 set_moment_public_link (lib/actions/moments.ts) with a fake server client
// over in-memory tables, EP-24 (app/api/public/moments/[slug]/route.ts) with a fake service role over the
// same tables, and S09 (app/(public)/t/[slug]/public-moment-client.tsx): the first enable creates a
// 128-bit base62 22-char slug and the link opens; disabling keeps the slug and EP-24 answers 404 on the
// very next request (nothing cached), which S09 shows as link_disabled; enabling again reuses the slug.
// care_check_write answers a member on someone else's moment with forbidden_role.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const MOMENT = "c4000000-0000-4000-8000-000000000001";

const state = {
  tables: {} as Record<string, Row[]>,
  writeError: null as Row | null,
};

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const run = () => {
    if (op !== "select" && state.writeError) return { data: null, error: state.writeError };
    const rows = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (op === "insert") {
      const row = { id: `l-${state.tables[table].length + 1}`, ...payload };
      state.tables[table].push(row);
      return { data: [row], error: null };
    }
    if (op === "update") {
      for (const r of rows) Object.assign(r, payload);
      return { data: rows, error: null };
    }
    return { data: rows, error: null };
  };
  const first = async () => {
    const result = run();
    return { data: result.data?.[0] ?? null, error: result.error };
  };
  const builder = {
    select: () => builder,
    insert: (row: Row) => ((op = "insert"), (payload = row), builder),
    update: (row: Row) => ((op = "update"), (payload = row), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    maybeSingle: first,
    single: first,
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: OWNER, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
  }),
}));

// EP-24's service-role read: the link (filtered by slug and active) with its moment, pet and photos.
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        maybeSingle: async () => {
          const link = state.tables.moment_public_links.find((l) => filters.every(([c, v]) => l[c] === v));
          if (!link) return { data: null, error: null };
          const moment = state.tables.moments.find((m) => m.id === link.moment_id)!;
          return {
            data: {
              slug: link.slug,
              active: link.active,
              moments: { moment_date: moment.moment_date, text: moment.text, pets: { name: "Luna", sex: "female" }, moment_photos: [] },
            },
            error: null,
          };
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/integrations/r2", () => ({ r2: () => ({}), safeFileName: (n: string) => n }));

const { setMomentPublicLink } = await import("@/lib/actions/moments");
const { GET } = await import("@/app/api/public/moments/[slug]/route");
const { getPublicMoment } = await import("@/lib/server/public-moments");
const { PublicMomentClient } = await import("@/app/(public)/t/[slug]/public-moment-client");
const { sr } = await import("@/lib/i18n/sr");

async function ep24(slug: string) {
  return GET(new Request(`https://mojljubimac.test/api/public/moments/${slug}`), { params: Promise.resolve({ slug }) });
}

async function renderS09(slug: string) {
  const moment = await getPublicMoment(slug);
  render(createElement(PublicMomentClient, { moment, locale: "sr", copy: sr.publicMoment, shellLabels: sr.shell.public }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.test/");
  state.tables = {
    profiles: [{ id: OWNER, deletion_requested_at: null }],
    organisation_memberships: [],
    moments: [{ id: MOMENT, pet_id: LUNA, moment_date: "2026-10-12", text: "Štrand", created_by: OWNER }],
    moment_public_links: [],
  };
  state.writeError = null;
});

describe("EP-23 set_moment_public_link", () => {
  it("first enable inserts the link with a random 22-char base62 slug and returns its url", async () => {
    const result = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(result.data).toEqual({ slug: result.data.slug, active: true, url: `https://mojljubimac.test/t/${result.data.slug}` });
    expect(state.tables.moment_public_links).toEqual([expect.objectContaining({ moment_id: MOMENT, slug: result.data.slug, active: true })]);

    const other = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    expect(other.ok && other.data.slug).toBe(result.data.slug);
    state.tables.moment_public_links = [];
    const fresh = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    expect(fresh.ok && fresh.data.slug).not.toBe(result.data.slug);
  });

  it("an active link opens for a Visitor (EP-24 200, S09 default)", async () => {
    const link = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    if (!link.ok) throw new Error(link.error.code);
    const response = await ep24(link.data.slug);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: link.data.slug, pet_name: "Luna", text: "Štrand" });
    await renderS09(link.data.slug);
    expect(screen.getByRole("heading", { level: 1, name: "Luna" })).toBeInTheDocument();
    expect(screen.getByText("Štrand")).toBeInTheDocument();
  });

  it("disabling keeps the slug, and EP-24 answers 404 on the next request → S09 link_disabled (FR-19)", async () => {
    const on = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    if (!on.ok) throw new Error(on.error.code);
    expect((await ep24(on.data.slug)).status).toBe(200);

    const off = await setMomentPublicLink({ moment_id: MOMENT, active: false });
    expect(off).toEqual({ ok: true, data: { slug: on.data.slug, active: false, url: on.data.url } });

    const response = await ep24(on.data.slug);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await renderS09(on.data.slug);
    expect(screen.getByRole("heading", { level: 1, name: "Ovaj trenutak više nije javan" })).toBeInTheDocument();
    expect(screen.getByText("Vlasnik je isključio link ili je trenutak obrisan.")).toBeInTheDocument();
    expect(screen.queryByText("Štrand")).not.toBeInTheDocument();

    const again = await setMomentPublicLink({ moment_id: MOMENT, active: true });
    expect(again.ok && again.data.slug).toBe(on.data.slug);
    expect((await ep24(on.data.slug)).status).toBe(200);
  });

  it("answers not_found for a moment the caller cannot see and validation_failed without `active`", async () => {
    expect(await setMomentPublicLink({ moment_id: "nope", active: true })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await setMomentPublicLink({ moment_id: MOMENT } as never)).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { active: "required" } },
    });
  });

  it("passes the database's forbidden_role (member, someone else's moment) and household_read_only through", async () => {
    state.writeError = { code: "P0001", message: "forbidden_role" };
    expect(await setMomentPublicLink({ moment_id: MOMENT, active: true })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    state.writeError = { code: "P0001", message: "household_read_only" };
    expect(await setMomentPublicLink({ moment_id: MOMENT, active: false })).toMatchObject({
      ok: false,
      error: { code: "household_read_only" },
    });
  });
});
