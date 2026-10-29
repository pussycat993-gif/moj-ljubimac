import { NextResponse, type NextRequest } from "next/server";
import { cancelSubscription, mapPaddleEvent, paddleConfigured, verifyPaddleSignature } from "@/lib/integrations/paddle";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// EP-46 — POST /api/webhooks/payments, the Paddle Billing notification destination (FR-37, FR-38, FR-42, FR-25,
// FR-32; API §9.2; TC ADR-09). System, no session:
//   1. the raw body is read as bytes before any parsing and Paddle-Signature is verified against
//      PADDLE_WEBHOOK_SECRET (lib/integrations/paddle.ts) → 401 invalid_signature, nothing written;
//   2. the JSON envelope is mapped to the neutral EP-46 event → 422 validation_failed when it is not JSON or lacks a
//      required field; the event types outside API §9.2 → 200 ignored;
//   3. the service-role database function apply_payment_event applies the side effects in one transaction
//      (dedupe on event_id, out-of-order guard, status table, payment rows; the subscriptions trigger keeps the
//      household flag, BR-28). Any failure → 500 internal_error with nothing recorded, so Paddle retries;
//   4. a duplicate purchase is cancelled at Paddle immediately and logged for an Operator refund.
// 200 {"received": true} for processed, duplicate and ignored events. Env vars are read per request.

export const dynamic = "force-dynamic";

const received = () => NextResponse.json({ received: true });

export async function POST(request: NextRequest) {
  const raw = new Uint8Array(await request.arrayBuffer());
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";
  const valid = await verifyPaddleSignature(request.headers.get("paddle-signature"), raw, secret);
  if (!valid) {
    return NextResponse.json(apiError("invalid_signature", { message: "Paddle-Signature check failed" }), { status: 401 });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return NextResponse.json(apiError("validation_failed", { message: "body is not JSON" }), { status: 422 });
  }

  const mapped = mapPaddleEvent(envelope);
  if (mapped.kind === "ignored") return received();
  if (mapped.kind === "invalid") {
    return NextResponse.json(
      apiError("validation_failed", { message: `missing ${mapped.reason}`, fields: { [mapped.reason]: "required" } }),
      { status: 422 },
    );
  }
  const event = mapped.event;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("apply_payment_event", { p_event: event, p_record_event: true });
    if (error) {
      if (error.code === "P0001" && error.message === "validation_failed") {
        return NextResponse.json(apiError("validation_failed", { message: error.details ?? error.message }), { status: 422 });
      }
      throw new Error(`apply_payment_event: ${error.message}`);
    }

    if (data === "duplicate_subscription" && event.provider_subscription_id) {
      console.error(
        "[webhooks/payments] duplicate purchase — cancelling it at Paddle; refund it in Paddle:",
        event.provider_subscription_id,
      );
      if (paddleConfigured()) {
        try {
          await cancelSubscription(event.provider_subscription_id, "immediately");
        } catch (cancelError) {
          console.error(
            "[webhooks/payments] duplicate purchase not cancelled:",
            event.provider_subscription_id,
            cancelError instanceof Error ? cancelError.message : cancelError,
          );
        }
      }
    } else if (data === "ignored") {
      console.warn("[webhooks/payments] event ignored:", event.event_id, event.type);
    }
    return received();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[webhooks/payments] processing failed:", event.event_id, message);
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
