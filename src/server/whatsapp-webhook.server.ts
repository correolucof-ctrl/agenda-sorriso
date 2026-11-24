// Signed receiver for the official WhatsApp connector, in restricted test mode.
// Order: verify signature -> allowlist gate (discard before saving) -> durable inbox -> process.
import { verifyWebhookRequest, WebhookError } from "@lovable.dev/webhooks-js";
import { gateDelivery } from "./whatsapp-gate";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
const BUDGET_MS = 4000;

export type StoredEvent = { id: string; deliveryId: string; event: string; payload: unknown; processedAt: string | null; attempts: number };

export interface WaStore {
  loadAllowlist(): Promise<string[]>;
  /** Inserts the delivery once (unique delivery id) and returns the stored row. */
  saveEvent(e: { deliveryId: string; event: string; payload: Record<string, unknown> }): Promise<StoredEvent>;
  markProcessed(id: string): Promise<void>;
  markPending(id: string, error: string, attempts: number): Promise<void>;
  /** Unfinished rows whose retry time has come, earliest first (failures are pushed back). */
  listDue(limit: number, excludeId?: string): Promise<StoredEvent[]>;
}

export type ProcessFn = (row: StoredEvent, deadline: number) => Promise<void>;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function runStoredEvent(store: WaStore, process: ProcessFn, row: StoredEvent, deadline: number): Promise<boolean> {
  try {
    await process(row, deadline);
    await store.markProcessed(row.id);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[whatsapp] processing pending for delivery ${row.deliveryId}: ${message}`);
    try {
      await store.markPending(row.id, message.slice(0, 500), row.attempts + 1);
    } catch (e) {
      console.error("[whatsapp] could not record pending state", e instanceof Error ? e.message : e);
    }
    return false;
  }
}

/** Bounded recovery of unfinished deliveries, used by the receiver and the admin button. */
export async function processDue(store: WaStore, process: ProcessFn, deadline: number, limit: number, excludeId?: string) {
  let done = 0;
  let pending = 0;
  const due = await store.listDue(limit, excludeId);
  for (const row of due) {
    if (Date.now() > deadline - 1500) break;
    if (await runStoredEvent(store, process, row, deadline)) done++;
    else pending++;
  }
  return { done, pending, checked: due.length };
}

export async function handleWhatsAppWebhook(request: Request, deps: { secret: string | undefined; store: WaStore; process: ProcessFn }): Promise<Response> {
  const started = Date.now();
  // Not linked yet: nothing can be verified, so refuse without processing. A 4xx (not 5xx) because this is
  // an expected state, not a server failure; once linked, WHATSAPP_API_KEY exists and this branch is unreachable.
  if (!deps.secret) return json({ status: "not_configured", message: "WhatsApp não vinculado a este projeto." }, 401);

  let payload: unknown;
  try {
    ({ payload } = await verifyWebhookRequest({ req: request, secret: deps.secret, maxBodyBytes: MAX_BODY_BYTES }));
  } catch (error) {
    if (error instanceof WebhookError && error.code === "body_too_large") return json({ status: "payload_too_large" }, 413);
    if (error instanceof WebhookError && error.code === "invalid_json") return json({ status: "invalid_json" }, 400);
    return json({ status: "invalid_signature" }, 401);
  }

  const deliveryId = request.headers.get("x-lovable-delivery")?.trim() ?? "";
  const event = request.headers.get("x-lovable-event")?.trim() ?? "";
  if (!deliveryId || !event || deliveryId.length > 200 || event.length > 100) return json({ status: "missing_headers" }, 400);

  let allowlist: string[];
  try {
    allowlist = await deps.store.loadAllowlist();
  } catch (error) {
    console.error("[whatsapp] allowlist unavailable", error instanceof Error ? error.message : error);
    return json({ status: "temporarily_unavailable" }, 503);
  }

  const gate = gateDelivery(event, payload, allowlist);
  if (gate.action === "discard") {
    // Nothing about this delivery is stored or answered (no number, no content).
    console.info(`[whatsapp] delivery discarded: ${gate.reason}`);
    return json({ received: true, stored: false }, 200);
  }

  let row: StoredEvent;
  try {
    row = await deps.store.saveEvent({ deliveryId, event, payload: gate.payload });
  } catch (error) {
    console.error("[whatsapp] inbox write failed", error instanceof Error ? error.message : error);
    return json({ status: "storage_failed" }, 503);
  }
  if (row.processedAt) return json({ received: true, duplicate: true }, 200);

  const deadline = started + BUDGET_MS;
  const ok = await runStoredEvent(deps.store, deps.process, row, deadline);
  try {
    if (Date.now() < deadline - 1500) await processDue(deps.store, deps.process, deadline, 2, row.id);
  } catch (error) {
    console.error("[whatsapp] recovery pass failed", error instanceof Error ? error.message : error);
  }
  return ok ? json({ received: true, processed: true }, 200) : json({ received: true, processed: false }, 503);
}
