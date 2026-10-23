"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";

// EP-14 delete_attachment (S03 Pregledi attachment chip, S05 a confirmed file). Owner and the
// organisation's team ✅; a household member ❌ forbidden_role (raised by health_record_check_write);
// no relation → not_found (RLS). The row goes first, then the R2 object; if R2 deletion fails the
// key stays queued for the nightly cleanup. The attachments after-delete trigger always queues the
// key inside the delete's transaction, so a successful R2 deletion takes it off the queue again.

export async function deleteAttachment(input: { attachment_id: string }): Promise<ActionResult<{ deleted_attachment_id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (typeof input?.attachment_id !== "string" || input.attachment_id === "") {
    return fail("validation_failed", { fields: { attachment_id: "required" } });
  }

  const { data, error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", input.attachment_id)
    .select("id, r2_key");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  const { id, r2_key } = data[0];

  // r2_deletion_queue has no client access (TC §5.7): the System queue writes use the service role.
  const queue = createServiceRoleClient().from("r2_deletion_queue");
  const removed = await r2()
    .remove(r2_key)
    .catch(() => false);
  if (removed) {
    const { error: dequeueError } = await queue.delete().eq("r2_key", r2_key);
    if (dequeueError) console.error("[attachments] dequeue deleted key:", dequeueError.message);
  } else {
    const { error: queueError } = await queue.upsert({ r2_key }, { onConflict: "r2_key", ignoreDuplicates: true });
    if (queueError) console.error("[attachments] queue key after R2 failure:", queueError.message);
  }

  return ok({ deleted_attachment_id: id });
}
