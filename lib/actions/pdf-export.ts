"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { getFileUrls, type FileUrl } from "@/lib/actions/files";
import type { MemorialRecord, Pet, PetRecord } from "@/lib/actions/pets";
import type { Me } from "@/lib/actions/registration";
import type { DoseLog, Treatment } from "@/lib/actions/treatments";
import type { Vaccination } from "@/lib/actions/vaccinations";
import type { VetVisit } from "@/lib/actions/vet-visits";
import type { WeightEntry } from "@/lib/actions/weights";

// EP-16 get_pdf_export_bundle — S03 "Izvezi PDF" (FR-10). The PDF itself is rendered in the browser
// with @react-pdf/renderer (ADR-12, ADR-17; app/(app)/ljubimci/[id]/pdf-export-client.tsx); this
// action only gathers the data. Owner with Premium ✅; Free owner → premium_required
// (details.limit = "pdf_export", E-25); member and organisation roles → forbidden_role; no relation →
// not_found. The record comes from EP-02 (RLS-scoped, security invoker), the full dose logs from
// dose_logs, and the file URLs from EP-15 (image attachments only — PDFs are listed by name, ADR-12).

/** API §6 PdfExportBundle. */
export type PdfExportBundle = {
  generated_at: string;
  pet: Pet;
  owner_name: string | null;
  memorial: MemorialRecord | null;
  vaccinations: Vaccination[];
  treatments: (Treatment & { doses: DoseLog[] })[];
  vet_visits: VetVisit[];
  attachment_files: FileUrl[];
  weights: WeightEntry[];
  photo: FileUrl | null;
};

type DoseRow = { id: string; treatment_id: string; given_at: string; occurrence_id: string | null; created_by: string };

/** EP-15 in batches of 50 (its request limit). */
async function fileUrls(items: { kind: "attachment" | "pet_photo"; id: string }[]): Promise<ActionResult<FileUrl[]>> {
  const urls: FileUrl[] = [];
  for (let i = 0; i < items.length; i += 50) {
    const result = await getFileUrls({ items: items.slice(i, i + 50) });
    if (!result.ok) return result;
    urls.push(...result.data);
  }
  return ok(urls);
}

export async function getPdfExportBundle(input: { pet_id: string }): Promise<ActionResult<PdfExportBundle>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  if (typeof input?.pet_id !== "string" || input.pet_id === "") {
    return fail("validation_failed", { fields: { pet_id: "required" } });
  }

  const { data: recordData, error: recordError } = await supabase.rpc("get_pet_record", { p_pet_id: input.pet_id });
  if (recordError) return { ok: false, error: fromDatabaseError(recordError) };
  const record = (recordData ?? null) as unknown as PetRecord | null;
  if (!record) return fail("not_found");

  // Owner only: members and organisation roles are not offered the export (EP-16 Authorization).
  if (record.access.role !== "owner") return fail("forbidden_role");

  const { data: meData, error: meError } = await supabase.rpc("get_me");
  if (meError) return { ok: false, error: fromDatabaseError(meError) };
  const me = (meData ?? null) as unknown as Me | null;
  if (!me?.entitlements.pdf_export) return fail("premium_required", { details: { limit: "pdf_export" } });

  const treatments = record.treatments as unknown as Treatment[];
  const visits = record.vet_visits as unknown as VetVisit[];

  // All dose logs of the pet's treatments, oldest first. Author names: EP-02 resolves them for the
  // latest doses (profiles are self-only under RLS); the owner's own name is known as well.
  let doseRows: DoseRow[] = [];
  if (treatments.length > 0) {
    const { data, error } = await supabase
      .from("dose_logs")
      .select("id, treatment_id, given_at, occurrence_id, created_by")
      .in("treatment_id", treatments.map((t) => t.id))
      .order("given_at", { ascending: true });
    if (error) return { ok: false, error: fromDatabaseError(error) };
    doseRows = (data ?? []) as DoseRow[];
  }
  const names = new Map<string, string | null>();
  if (record.pet.owner_id) names.set(record.pet.owner_id, record.owner_name);
  for (const t of treatments) for (const d of t.recent_doses) if (d.created_by_name) names.set(d.created_by, d.created_by_name);
  const recent = new Map(treatments.flatMap((t) => t.recent_doses.map((d) => [d.id, d] as const)));
  const toDose = (row: DoseRow): DoseLog => ({
    ...row,
    created_by_name: names.get(row.created_by) ?? null,
    access: recent.get(row.id)?.access ?? record.access,
  });

  const images = visits.flatMap((v) => v.attachments.filter((a) => a.mime_type.startsWith("image/")));
  const items = [
    ...(record.pet.has_photo ? [{ kind: "pet_photo" as const, id: record.pet.id }] : []),
    ...images.map((a) => ({ kind: "attachment" as const, id: a.id })),
  ];
  const urls = items.length > 0 ? await fileUrls(items) : ok<FileUrl[]>([]);
  if (!urls.ok) return urls;
  const photo = urls.data.find((u) => u.kind === "pet_photo" && u.url) ?? null;

  const byDate = <T>(key: (x: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

  return ok({
    generated_at: new Date().toISOString(),
    pet: record.pet,
    owner_name: record.owner_name,
    memorial: record.memorial,
    vaccinations: [...(record.vaccinations as unknown as Vaccination[])].sort(
      byDate((v: Vaccination) => `${v.given_on}${v.created_at}`),
    ),
    treatments: treatments.map((t) => ({
      ...t,
      doses: doseRows.filter((d) => d.treatment_id === t.id).map(toDose),
    })),
    vet_visits: [...visits].sort(byDate((v: VetVisit) => `${v.visited_on}${v.created_at}`)),
    attachment_files: urls.data.filter((u) => u.kind === "attachment"),
    weights: [...(record.weights as unknown as WeightEntry[])].sort(
      byDate((w: WeightEntry) => `${w.measured_on}${w.created_at}`),
    ),
    photo,
  });
}
