import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const decisionSchema = z.object({
  target_clinic: z.string().uuid(),
  next_status: z.enum(["approved", "rejected", "suspended"]),
  selected_plan: z.enum(["essencial", "crescimento", "profissional"]).nullable(),
  expiration: z.string().datetime().nullable(),
});

const applicationSchema = z.object({
  clinic_id: z.string().uuid(),
  clinic_name: z.string(),
  responsible_name: z.string(),
  contact_email: z.string(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  plan: decisionSchema.shape.selected_plan,
  expires_at: z.string().nullable(),
});

export const listCommercialApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { data, error } = await client.rpc("list_commercial_applications");
    if (error?.code === "42501") return null;
    if (error) throw new Error("Não foi possível consultar os cadastros comerciais.");
    return applicationSchema.array().parse(data);
  });

export const decideCommercialAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => decisionSchema.parse(value))
  .handler(async ({ context, data }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { error } = await client.rpc("decide_commercial_access", data);
    if (error?.code === "22023") throw new Error("Para aprovar, informe um plano e um vencimento futuro.");
    if (error) throw new Error("Não foi possível registrar a decisão.");
  });

async function requirePlatformAdmin(context: { supabase: SupabaseClient; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Acesso administrativo necessário.");
}

export const listClinicWhatsAppNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context as { supabase: SupabaseClient; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data, error } = await db.from("whatsapp_clinic_numbers")
      .select("clinic_id,phone_number_id,display_phone,status,sending_paused,reminder_template_name,reminder_template_language,updated_at");
    if (error) throw new Error("Não foi possível consultar os números oficiais.");
    return z.object({ clinic_id: z.string().uuid(), phone_number_id: z.string(), display_phone: z.string(),
      status: z.enum(["pending", "active", "paused"]), sending_paused: z.boolean(),
      reminder_template_name: z.string().nullable(), reminder_template_language: z.string(),
      updated_at: z.string() }).array().parse(data);
  });

export const linkClinicWhatsAppNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ clinicId: z.string().uuid(), phoneId: z.string().regex(/^\d{5,30}$/),
    accessToken: z.string().min(20).max(4096) }).parse(value))
  .handler(async ({ context, data }) => {
    await requirePlatformAdmin(context as { supabase: SupabaseClient; userId: string });
    const version = process.env["META_GRAPH_API_VERSION"] ?? "v27.0";
    if (!/^v\d+\.\d+$/.test(version)) throw new Error("Versão da API Meta inválida.");
    const response = await fetch(`https://graph.facebook.com/${version}/${data.phoneId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (!response.ok) throw new Error("A Meta não confirmou o número com esse token.");
    const details = await response.json() as { id?: string; display_phone_number?: string };
    if (details.id !== data.phoneId || !details.display_phone_number) throw new Error("Número retornado pela Meta é diferente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { registerClinicNumber } = await import("@/server/whatsapp-clinic.server");
    await registerClinicNumber(supabaseAdmin, { clinicId: data.clinicId, phoneId: data.phoneId,
      displayPhone: details.display_phone_number, accessToken: data.accessToken });
    return { displayPhone: details.display_phone_number };
  });

export const setClinicWhatsAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ clinicId: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(value))
  .handler(async ({ context, data }) => {
    await requirePlatformAdmin(context as { supabase: SupabaseClient; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data: access } = await db.from("commercial_access")
      .select("status").eq("clinic_id", data.clinicId).single();
    if (data.status === "active" && access?.status !== "approved") throw new Error("A clínica precisa estar aprovada.");
    const { data: changed, error } = await db.from("whatsapp_clinic_numbers").update({
      status: data.status, sending_paused: data.status !== "active", updated_at: new Date().toISOString(),
    }).eq("clinic_id", data.clinicId).select("clinic_id");
    if (error || !changed?.length) throw new Error("Número oficial não encontrado para esta clínica.");
  });

export const setClinicReminderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ clinicId: z.string().uuid(),
    templateName: z.string().trim().regex(/^[a-z][a-z0-9_]{1,99}$/, "Informe o nome exato do modelo aprovado na Meta."),
    language: z.enum(["pt_BR", "en_US", "es_ES"]) }).parse(value))
  .handler(async ({ context, data }) => {
    await requirePlatformAdmin(context as { supabase: SupabaseClient; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data: changed, error } = await db.from("whatsapp_clinic_numbers")
      .update({ reminder_template_name: data.templateName, reminder_template_language: data.language,
        updated_at: new Date().toISOString() }).eq("clinic_id", data.clinicId).select("clinic_id");
    if (error || !changed?.length) throw new Error("Vincule o número oficial antes de configurar lembretes.");
  });
