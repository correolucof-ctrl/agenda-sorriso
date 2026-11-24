import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsAppDigits } from "@/lib/whatsapp-phone";
import { resolveClinicNumber } from "./whatsapp-clinic.server";
import { sendWhatsAppReminder } from "./whatsapp-gateway.server";

type Db = SupabaseClient;

export async function sendDueReminders(db: Db, limit = 10): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (process.env["META_WHATSAPP_SEND_ENABLED"] !== "true") return { sent: 0, failed: 0, skipped: true };
  const { data: jobs, error } = await db.rpc("claim_due_reminders", { p_limit: limit });
  if (error) throw new Error("Não foi possível reservar lembretes.");
  let sent = 0, failed = 0;
  for (const job of jobs as Array<{ id: string; clinic_id: string; appointment_id: string }>) {
    let status: "sent" | "failed" | "pending" | "unresolved" | "blocked" = "unresolved";
    let messageId: string | null = null;
    let detail: string | null = null;
    try {
      const number = await db.from("whatsapp_clinic_numbers").select("phone_number_id,reminder_template_name,reminder_template_language")
        .eq("clinic_id", job.clinic_id).single();
      const connection = number.data?.phone_number_id ? await resolveClinicNumber(db, number.data.phone_number_id) : null;
      const { data: appointment } = await db.from("appointments").select("starts_at,status,patient:patients(phone),clinic:clinics(timezone)")
        .eq("id", job.appointment_id).eq("clinic_id", job.clinic_id).single();
      if (!connection || connection.sendingPaused || !number.data?.reminder_template_name) {
        status = "blocked"; detail = "Número ou acesso da clínica indisponível";
      } else if (!appointment || !["scheduled", "confirmed"].includes(appointment.status) || new Date(appointment.starts_at).getTime() <= Date.now()) {
        status = "blocked"; detail = "Consulta cancelada ou já iniciada";
      } else {
        const patient = Array.isArray(appointment.patient) ? appointment.patient[0] : appointment.patient;
        const clinic = Array.isArray(appointment.clinic) ? appointment.clinic[0] : appointment.clinic;
        const digits = normalizeWhatsAppDigits(patient?.phone ?? "");
        if (!digits) { status = "failed"; detail = "Paciente sem telefone válido"; }
        else {
          const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: clinic?.timezone ?? "America/Sao_Paulo",
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.starts_at));
          const result = await sendWhatsAppReminder({ toDigits: digits, dateTime, phoneId: connection.phoneId,
            token: connection.token, templateName: number.data.reminder_template_name,
            language: number.data.reminder_template_language });
          if (result.kind === "accepted") { status = "sent"; messageId = result.waMessageId; sent++; }
          else if (result.kind === "rejected") {
            status = "failed";
            detail = `Meta recusou lembrete (${result.status})`; failed++;
          } else { status = "unresolved"; detail = result.error; failed++; }
        }
      }
    } catch (e) { status = "unresolved"; detail = e instanceof Error ? e.message : "Falha desconhecida"; failed++; }
    const { error: saveError } = await db.from("reminders").update({ status, wa_message_id: messageId,
      last_error: detail?.slice(0, 500) ?? null, claimed_at: null,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
    }).eq("id", job.id).eq("status", "processing");
    if (saveError) throw new Error("Não foi possível registrar o resultado do lembrete.");
    if (messageId) {
      const { error: recError } = await db.rpc("whatsapp_reconcile_status", { _wa_id: messageId });
      if (recError) throw new Error("Não foi possível conciliar o status do lembrete.");
    }
  }
  return { sent, failed, skipped: false };
}
