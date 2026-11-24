import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];
export type Clinic = T["clinics"]["Row"];
export type Professional = T["professionals"]["Row"];
export type Service = T["services"]["Row"];
export type Patient = T["patients"]["Row"];
export type Appointment = T["appointments"]["Row"];
export type ScheduleBlock = T["schedule_blocks"]["Row"];
export type Conversation = T["conversations"]["Row"];
export type Message = T["messages"]["Row"];
export type Reminder = T["reminders"]["Row"];
export type BusinessHours = T["business_hours"]["Row"];

function check<D>(res: { data: D | null; error: { message: string } | null }): D {
  if (res.error) throw new Error(res.error.message);
  return res.data as D;
}

export function useClinic() {
  return useQuery({
    queryKey: ["clinic"],
    queryFn: async (): Promise<Clinic> => {
      const first = await supabase.from("clinics").select("*").maybeSingle();
      if (first.error) throw new Error(first.error.message);
      if (first.data) return first.data;
      const r = await supabase.rpc("ensure_my_clinic");
      if (r.error) throw new Error(r.error.message);
      const second = await supabase.from("clinics").select("*").maybeSingle();
      if (second.error) throw new Error(second.error.message);
      if (!second.data) throw new Error("Não foi possível carregar a clínica.");
      return second.data;
    },
    staleTime: 60_000,
  });
}

export function useProfessionals(clinicId?: string) {
  return useQuery({
    queryKey: ["professionals", clinicId],
    enabled: !!clinicId,
    queryFn: async () => check(await supabase.from("professionals").select("*").eq("clinic_id", clinicId!).order("created_at")),
  });
}

export function useServices(clinicId?: string) {
  return useQuery({
    queryKey: ["services", clinicId],
    enabled: !!clinicId,
    queryFn: async () => check(await supabase.from("services").select("*").eq("clinic_id", clinicId!).order("created_at")),
  });
}

export function useHours(clinicId?: string) {
  return useQuery({
    queryKey: ["hours", clinicId],
    enabled: !!clinicId,
    queryFn: async () => check(await supabase.from("business_hours").select("*").eq("clinic_id", clinicId!).order("weekday")),
  });
}

export function usePatients(clinicId?: string) {
  return useQuery({
    queryKey: ["patients", clinicId],
    enabled: !!clinicId,
    queryFn: async () => check(await supabase.from("patients").select("*").eq("clinic_id", clinicId!).order("name")),
  });
}

export function useAppointments(clinicId: string | undefined, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["appointments", clinicId, fromIso, toIso],
    enabled: !!clinicId,
    queryFn: async () =>
      check(
        await supabase
          .from("appointments")
          .select("*")
          .eq("clinic_id", clinicId!)
          .gte("starts_at", fromIso)
          .lt("starts_at", toIso)
          .order("starts_at"),
      ),
  });
}

export function useBlocks(clinicId: string | undefined, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["blocks", clinicId, fromIso, toIso],
    enabled: !!clinicId,
    queryFn: async () =>
      check(
        await supabase
          .from("schedule_blocks")
          .select("*")
          .eq("clinic_id", clinicId!)
          .lt("starts_at", toIso)
          .gt("ends_at", fromIso)
          .order("starts_at"),
      ),
  });
}

export function useConversations(clinicId?: string) {
  return useQuery({
    queryKey: ["conversations", clinicId],
    enabled: !!clinicId,
    refetchInterval: 15_000,
    queryFn: async () =>
      check(await supabase.from("conversations").select("*").eq("clinic_id", clinicId!).order("last_message_at", { ascending: false }).limit(200)),
  });
}

export function useMessages(conversationId?: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () =>
      check(await supabase.from("messages").select("*").eq("conversation_id", conversationId!).order("created_at")),
  });
}

export function useReminders(clinicId?: string) {
  return useQuery({
    queryKey: ["reminders", clinicId],
    enabled: !!clinicId,
    queryFn: async () =>
      check(
        await supabase
          .from("reminders")
          .select("*, appointments(starts_at, status, patient_id, service_id, professional_id)")
          .eq("clinic_id", clinicId!)
          .order("scheduled_for", { ascending: true })
          .limit(300),
      ),
  });
}

export function useUpcomingAppointments(clinicId?: string) {
  return useQuery({
    queryKey: ["appointments", clinicId, "upcoming"],
    enabled: !!clinicId,
    queryFn: async () =>
      check(
        await supabase
          .from("appointments")
          .select("*")
          .eq("clinic_id", clinicId!)
          .in("status", ["scheduled", "confirmed"])
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(200),
      ),
  });
}
