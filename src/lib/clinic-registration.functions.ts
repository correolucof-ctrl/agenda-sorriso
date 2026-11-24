import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clinicRegistrationSchema } from "@/lib/clinic-registration";
import type { SupabaseClient } from "@supabase/supabase-js";

export const getClinicPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const [status, admin] = await Promise.all([
      client.rpc("get_clinic_portal_status"),
      client.rpc("is_platform_admin"),
    ]);
    if (status.error || admin.error) throw new Error("Não foi possível consultar o acesso da clínica.");
    return { status: String(status.data), isAdmin: admin.data === true };
  });

export const getClinicRegistration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clinic = await context.supabase.from("clinics").select("id").eq("owner_id", context.userId).single();
    if (clinic.error?.code === "PGRST116") return null;
    if (clinic.error || !clinic.data) throw new Error("Não foi possível carregar sua clínica.");
    const registration = await context.supabase.from("clinic_registrations").select("*").eq("clinic_id", clinic.data.id).maybeSingle();
    if (registration.error) throw new Error("Não foi possível carregar o cadastro.");
    return registration.data;
  });

export const saveClinicRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clinicRegistrationSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (import.meta.env["VITE_STANDALONE"] === "true") {
      const workspace = await context.supabase.rpc("ensure_my_clinic");
      if (workspace.error) throw new Error("Não foi possível preparar o cadastro.");
    }
    const clinic = await context.supabase.from("clinics").select("id").eq("owner_id", context.userId).single();
    if (clinic.error || !clinic.data) throw new Error("Sua conta precisa ter uma clínica antes de concluir o cadastro.");
    const saved = await context.supabase.from("clinic_registrations").upsert({ ...data, clinic_id: clinic.data.id, updated_at: new Date().toISOString() }).select("*").single();
    if (saved.error) throw new Error("Não foi possível salvar o cadastro da clínica.");
    return saved.data;
  });
