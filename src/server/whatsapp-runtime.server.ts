// Wires the receiver to the real database, agent, connector and transcription.
import type { DB } from "./booking.server";
import type { Json } from "@/integrations/supabase/types";
import { processPatientMessage } from "./agent.server";
import { downloadWhatsAppMedia, sendWhatsAppText, transcribeAudio } from "./whatsapp-gateway.server";
import { processStoredEvent } from "./whatsapp-processor.server";
import { resolveClinicNumber } from "./whatsapp-clinic.server";
import type { ProcessFn, StoredEvent, WaStore } from "./whatsapp-webhook.server";

type EventRow = { id: string; delivery_id: string; event: string; payload: unknown; processed_at: string | null; attempts: number };
const toStored = (r: EventRow): StoredEvent => ({ id: r.id, deliveryId: r.delivery_id, event: r.event, payload: r.payload, processedAt: r.processed_at, attempts: r.attempts });

export function createSupabaseStore(db: DB): WaStore {
  return {
    async loadAllowlist() {
      const { data, error } = await db.from("whatsapp_allowed_numbers").select("phone_digits");
      if (error) throw new Error(error.message);
      return data.map((r) => r.phone_digits);
    },
    async saveEvent(e) {
      const ins = await db
        .from("whatsapp_webhook_events")
        .upsert({ delivery_id: e.deliveryId, event: e.event, payload: e.payload as Json }, { onConflict: "delivery_id", ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
      const { data, error } = await db.from("whatsapp_webhook_events").select("*").eq("delivery_id", e.deliveryId).single();
      if (error) throw new Error(error.message);
      return toStored(data);
    },
    async markProcessed(id) {
      const { error } = await db.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async markPending(id, message, attempts) {
      const delayMs = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7));
      const { error } = await db
        .from("whatsapp_webhook_events")
        .update({ processing_error: message, attempts, next_attempt_at: new Date(Date.now() + delayMs).toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    async listDue(limit, excludeId) {
      let q = db.from("whatsapp_webhook_events").select("*").is("processed_at", null).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
      if (excludeId) q = q.neq("id", excludeId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data.map(toStored);
    },
  };
}

export function createProcessor(db: DB): ProcessFn {
  return (row, deadline) =>
    processStoredEvent(row.event, row.payload, row.deliveryId, {
      db,
      deadline,
      sendText: sendWhatsAppText,
      ...(process.env["META_MULTI_CLINIC_ENABLED"] === "true"
        ? { resolveNumber: (phoneId: string) => resolveClinicNumber(db, phoneId) } : {}),
      transcribe: async (mediaId, number) => {
        const media = await downloadWhatsAppMedia(mediaId, number ?? undefined);
        return transcribeAudio(media.bytes, media.mimeType);
      },
      runAgent: processPatientMessage,
    });
}
