import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./google-calendar.server";

type Db = SupabaseClient;
export type ClinicNumber = { clinicId: string; phoneId: string; token: string; sendingPaused: boolean };

function encryptionKey(): string {
  const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("Criptografia Meta não configurada.");
  return key;
}

export async function registerClinicNumber(db: Db, input: { clinicId: string; phoneId: string; displayPhone: string; accessToken: string }): Promise<void> {
  if (!/^\d{5,30}$/.test(input.phoneId) || !/^\+?[\d ()-]{8,25}$/.test(input.displayPhone) || !input.accessToken.trim()) {
    throw new Error("Dados do número oficial inválidos.");
  }
  const cipher = await encryptToken(input.accessToken, encryptionKey());
  const { error } = await db.from("whatsapp_clinic_numbers").upsert({
    clinic_id: input.clinicId, phone_number_id: input.phoneId, display_phone: input.displayPhone,
    access_token_ciphertext: cipher, status: "pending", sending_paused: true,
    reminder_template_name: null, reminder_template_language: "pt_BR", updated_at: new Date().toISOString(),
  }, { onConflict: "clinic_id" });
  if (error) throw new Error("Não foi possível vincular o número oficial.");
}

export async function resolveClinicNumber(db: Db, phoneId: string): Promise<ClinicNumber | null> {
  if (!/^\d{5,30}$/.test(phoneId)) return null;
  const { data: number, error } = await db.from("whatsapp_clinic_numbers")
    .select("clinic_id,phone_number_id,access_token_ciphertext,sending_paused,status")
    .eq("phone_number_id", phoneId).maybeSingle();
  if (error || !number || number.status !== "active") return null;
  const { data: access } = await db.from("commercial_access").select("status,expires_at,payment_required")
    .eq("clinic_id", number.clinic_id).maybeSingle();
  if (!access || access.status !== "approved" || new Date(access.expires_at).getTime() <= Date.now()) return null;
  if (access.payment_required) {
    const { data: billing } = await db.from("billing_subscriptions").select("status,current_period_end")
      .eq("clinic_id", number.clinic_id).maybeSingle();
    if (!billing || !["active", "trialing"].includes(billing.status) || new Date(billing.current_period_end).getTime() <= Date.now()) return null;
  }
  return { clinicId: number.clinic_id, phoneId: number.phone_number_id,
    token: await decryptToken(number.access_token_ciphertext, encryptionKey()), sendingPaused: number.sending_paused };
}
