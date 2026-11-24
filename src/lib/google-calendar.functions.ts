import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { data: clinic } = await context.supabase.from("clinics").select("id")
      .eq("owner_id", context.userId).eq("is_demo", false).maybeSingle();
    if (!clinic) return { connected: false, enabled: false };
    const { data } = await admin.from("google_calendar_connections").select("enabled")
      .eq("clinic_id", clinic.id).maybeSingle();
    return { connected: !!data, enabled: !!data?.enabled };
  });

export const startGoogleCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: clinic } = await context.supabase.from("clinics").select("id")
      .eq("owner_id", context.userId).eq("is_demo", false).single();
    if (!clinic) throw new Error("Clínica não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { googleConnectUrl } = await import("@/server/google-calendar.server");
    return { url: await googleConnectUrl(supabaseAdmin as unknown as SupabaseClient, clinic.id, context.userId) };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: clinic } = await context.supabase.from("clinics").select("id")
      .eq("owner_id", context.userId).eq("is_demo", false).single();
    if (!clinic) throw new Error("Clínica não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { error } = await admin.from("google_calendar_connections").delete().eq("clinic_id", clinic.id);
    if (error) throw new Error("Não foi possível desconectar Google Agenda.");
    return { disconnected: true };
  });
