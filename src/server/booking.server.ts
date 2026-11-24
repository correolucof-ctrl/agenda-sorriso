// Authoritative scheduling on the server. All queries run as the signed-in user (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { checkInterval, FIT_MESSAGES, generateSlots, type BusyInterval, type HoursRow, type Slot } from "@/lib/scheduling";
import { businessDate } from "@/lib/time";

export type DB = SupabaseClient<Database>;
type T = Database["public"]["Tables"];
export type ClinicRow = T["clinics"]["Row"];
export type ServiceRow = T["services"]["Row"];
export type ProfessionalRow = T["professionals"]["Row"];
export type AppointmentRow = T["appointments"]["Row"];

export interface ClinicContext {
  clinic: ClinicRow;
  hours: HoursRow[];
  services: ServiceRow[];
  professionals: ProfessionalRow[];
}

export async function loadClinicContext(sb: DB, clinicId?: string): Promise<ClinicContext> {
  const clinicQuery = clinicId
    ? sb.from("clinics").select("*").eq("id", clinicId).maybeSingle()
    : sb.from("clinics").select("*").maybeSingle();
  const { data: clinic, error } = await clinicQuery;
  if (error) throw new Error(error.message);
  if (!clinic) throw new Error("Clínica não encontrada para esta conta.");
  const [hours, services, professionals] = await Promise.all([
    sb.from("business_hours").select("*").eq("clinic_id", clinic.id),
    sb.from("services").select("*").eq("clinic_id", clinic.id).order("name"),
    sb.from("professionals").select("*").eq("clinic_id", clinic.id).order("created_at"),
  ]);
  if (hours.error) throw new Error(hours.error.message);
  if (services.error) throw new Error(services.error.message);
  if (professionals.error) throw new Error(professionals.error.message);
  return { clinic, hours: hours.data, services: services.data, professionals: professionals.data };
}

export async function loadBusy(sb: DB, clinicId: string, from: Date, to: Date, excludeAppointmentId?: string) {
  const [appts, blocks] = await Promise.all([
    sb
      .from("appointments")
      .select("id, professional_id, starts_at, ends_at")
      .eq("clinic_id", clinicId)
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
    sb
      .from("schedule_blocks")
      .select("professional_id, starts_at, ends_at")
      .eq("clinic_id", clinicId)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
  ]);
  if (appts.error) throw new Error(appts.error.message);
  if (blocks.error) throw new Error(blocks.error.message);
  const busy: BusyInterval[] = [];
  for (const a of appts.data) {
    if (a.id === excludeAppointmentId) continue;
    busy.push({ professionalId: a.professional_id, start: new Date(a.starts_at), end: new Date(a.ends_at), kind: "appointment" });
  }
  for (const b of blocks.data) {
    busy.push({ professionalId: b.professional_id, start: new Date(b.starts_at), end: new Date(b.ends_at), kind: "block" });
  }
  return busy;
}

export async function computeSlots(
  sb: DB,
  ctx: ClinicContext,
  args: {
    serviceId: string;
    professionalIds?: string[];
    fromDate?: string;
    days?: number;
    excludeAppointmentId?: string;
    applyAdvanceRules?: boolean;
  },
): Promise<Slot[]> {
  const service = ctx.services.find((s) => s.id === args.serviceId && s.active);
  if (!service) throw new Error("Serviço não encontrado ou inativo.");
  const activePros = ctx.professionals.filter((p) => p.active).map((p) => p.id);
  const professionalIds = args.professionalIds?.length ? args.professionalIds.filter((id) => activePros.includes(id)) : activePros;
  const now = new Date();
  const { clinic } = ctx;
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(now.getTime() + (clinic.max_advance_days + 2) * 86_400_000);
  const busy = await loadBusy(sb, clinic.id, from, to, args.excludeAppointmentId);
  const applyRules = args.applyAdvanceRules ?? true;
  return generateSlots({
    timezone: clinic.timezone,
    now,
    hours: ctx.hours,
    minAdvanceMinutes: applyRules ? clinic.min_advance_minutes : 0,
    maxAdvanceDays: clinic.max_advance_days,
    stepMinutes: clinic.slot_step_minutes,
    durationMinutes: service.duration_minutes,
    professionalIds,
    busy,
    ...(args.fromDate ? { fromDate: args.fromDate } : {}),
    ...(args.days !== undefined ? { days: args.days } : {}),
  });
}

export type ReserveResult =
  | { ok: true; appointment: AppointmentRow }
  | { ok: false; reason: "unavailable" | "conflict" | "blocked" | "closed" | "past" | "invalid"; message: string };

/**
 * Creates (or moves, when rescheduleId is set) an appointment after re-validating availability.
 * Agent bookings must match a generated slot exactly; manual bookings must fit opening hours
 * without conflicts. The database exclusion constraint is the last line of defence against races.
 */
export async function reserveAppointment(
  sb: DB,
  ctx: ClinicContext,
  args: {
    patientId: string;
    serviceId: string;
    professionalId: string;
    startsAt: string;
    source: "agent" | "manual";
    notes?: string;
    rescheduleId?: string;
  },
): Promise<ReserveResult> {
  const service = ctx.services.find((s) => s.id === args.serviceId);
  const professional = ctx.professionals.find((p) => p.id === args.professionalId);
  if (!service || !service.active) return { ok: false, reason: "invalid", message: "Serviço inválido ou inativo." };
  if (!professional || !professional.active) return { ok: false, reason: "invalid", message: "Profissional inválido ou inativo." };
  const start = new Date(args.startsAt);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "invalid", message: "Data e hora inválidas." };
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const tz = ctx.clinic.timezone;

  if (args.source === "agent") {
    const slots = await computeSlots(sb, ctx, {
      serviceId: service.id,
      professionalIds: [professional.id],
      fromDate: businessDate(start, tz),
      days: 1,
      ...(args.rescheduleId ? { excludeAppointmentId: args.rescheduleId } : {}),
    });
    if (!slots.some((s) => s.start === start.toISOString())) {
      return { ok: false, reason: "unavailable", message: "Esse horário não está mais disponível." };
    }
  } else {
    const busy = await loadBusy(
      sb,
      ctx.clinic.id,
      new Date(start.getTime() - 86_400_000),
      new Date(end.getTime() + 86_400_000),
      args.rescheduleId,
    );
    const fit = checkInterval({ timezone: tz, now: new Date(), hours: ctx.hours, busy, professionalId: professional.id, start, end });
    if (!fit.ok) {
      return { ok: false, reason: fit.reason === "busy" ? "conflict" : fit.reason, message: FIT_MESSAGES[fit.reason] };
    }
  }

  const payload = {
    professional_id: professional.id,
    service_id: service.id,
    patient_id: args.patientId,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    ...(args.notes !== undefined ? { notes: args.notes } : {}),
  };
  const query = args.rescheduleId
    ? sb.from("appointments").update({ ...payload, status: "scheduled" }).eq("id", args.rescheduleId).select("*").single()
    : sb
        .from("appointments")
        .insert({ ...payload, clinic_id: ctx.clinic.id, source: args.source, status: "scheduled" })
        .select("*")
        .single();
  const { data, error } = await query;
  if (error) {
    if (error.code === "23P01") return { ok: false, reason: "conflict", message: "Esse horário acabou de ser reservado por outra pessoa." };
    if (error.code === "P0001") return { ok: false, reason: "blocked", message: "Há um bloqueio de agenda nesse horário." };
    return { ok: false, reason: "invalid", message: error.message };
  }
  return { ok: true, appointment: data };
}

export async function upcomingAppointmentsFor(sb: DB, clinicId: string, patientId: string) {
  const { data, error } = await sb
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .in("status", ["scheduled", "confirmed"])
    .gt("starts_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw new Error(error.message);
  return data;
}
