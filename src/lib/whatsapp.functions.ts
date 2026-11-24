import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeWhatsAppDigits } from "@/lib/whatsapp-phone";

async function isAdmin(context: { supabase: SupabaseClient<Database>; userId: string }): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  return data === true;
}

export const getWhatsAppOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const linked = !!process.env["WHATSAPP_API_KEY"];
    const admin = await isAdmin(context);
    if (!admin) return { linked, isAdmin: false as const };
    const sb = context.supabase;
    const [settings, numbers, inbox, review, outbound] = await Promise.all([
      sb.from("whatsapp_settings").select("target_clinic_id, sending_paused, paused_reason").eq("id", true).maybeSingle(),
      sb.from("whatsapp_allowed_numbers").select("id, phone_digits, label, created_at").order("created_at"),
      sb.from("whatsapp_webhook_events").select("id", { count: "exact", head: true }).is("processed_at", null),
      sb.from("whatsapp_inbound_messages").select("id", { count: "exact", head: true }).eq("state", "needs_review"),
      sb.from("whatsapp_outbound_messages").select("id", { count: "exact", head: true }).in("state", ["failed", "unresolved", "blocked"]),
    ]);
    for (const r of [settings, numbers, inbox, review, outbound]) if (r.error) throw new Error(r.error.message);
    return {
      linked,
      isAdmin: true as const,
      sendingPaused: settings.data?.sending_paused ?? false,
      pausedReason: settings.data?.paused_reason ?? null,
      hasTargetClinic: !!settings.data?.target_clinic_id,
      numbers: numbers.data ?? [],
      pendingDeliveries: inbox.count ?? 0,
      needsReview: review.count ?? 0,
      problemReplies: outbound.count ?? 0,
    };
  });

export const addAllowedNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z.string().trim().min(8, "Informe o número com DDD").max(25),
        label: z.string().trim().min(1, "Informe o nome de quem vai testar").max(60, "Nome muito longo"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Somente o administrador pode editar a lista de números.");
    let digits = normalizeWhatsAppDigits(data.phone);
    if (digits && digits.length <= 11 && !data.phone.trim().startsWith("+")) digits = normalizeWhatsAppDigits(`55${digits}`);
    if (!digits) throw new Error("Número inválido. Use o formato com DDD, por exemplo (62) 90000-0000.");
    const sb = context.supabase;
    // Conversations from test numbers go to the administrator's own clinic. Without one, a test number's
    // messages could never be answered, so refuse to authorize it instead of leaving deliveries failing.
    const clinic = await sb.from("clinics").select("id").maybeSingle();
    if (clinic.error) throw new Error(clinic.error.message);
    if (!clinic.data) throw new Error("Sua conta ainda não tem uma clínica para receber as conversas de teste.");
    const ins = await sb.from("whatsapp_allowed_numbers").insert({ phone_digits: digits, label: data.label, created_by: context.userId });
    if (ins.error) throw new Error(ins.error.code === "23505" ? "Esse número já está na lista." : ins.error.message);
    {
      const upd = await sb
        .from("whatsapp_settings")
        .update({ target_clinic_id: clinic.data.id, updated_by: context.userId, updated_at: new Date().toISOString() })
        .eq("id", true)
        .is("target_clinic_id", null);
      if (upd.error) throw new Error(upd.error.message);
    }
    return { ok: true };
  });

export const removeAllowedNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Somente o administrador pode editar a lista de números.");
    const del = await context.supabase.from("whatsapp_allowed_numbers").delete().eq("id", data.id).select("id");
    if (del.error) throw new Error(del.error.message);
    if (!del.data.length) throw new Error("Número não encontrado.");
    return { ok: true };
  });

export const processPendingWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Somente o administrador pode reprocessar mensagens.");
    if (!process.env["WHATSAPP_API_KEY"]) throw new Error("WhatsApp não vinculado a este projeto.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createSupabaseStore, createProcessor } = await import("@/server/whatsapp-runtime.server");
    const { processDue } = await import("@/server/whatsapp-webhook.server");
    return processDue(createSupabaseStore(supabaseAdmin), createProcessor(supabaseAdmin), Date.now() + 9000, 5);
  });
