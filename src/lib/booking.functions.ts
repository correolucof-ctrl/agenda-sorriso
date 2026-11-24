import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeSlots, loadClinicContext, reserveAppointment } from "@/server/booking.server";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const getAvailableSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        serviceId: z.string().uuid(),
        professionalId: z.string().uuid().optional(),
        date: z.string().regex(dateRe),
        days: z.number().int().min(1).max(14).default(1),
        applyAdvanceRules: z.boolean().default(true),
        excludeAppointmentId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadClinicContext(context.supabase);
    const slots = await computeSlots(context.supabase, ctx, {
      serviceId: data.serviceId,
      fromDate: data.date,
      days: data.days,
      applyAdvanceRules: data.applyAdvanceRules,
      ...(data.professionalId ? { professionalIds: [data.professionalId] } : {}),
      ...(data.excludeAppointmentId ? { excludeAppointmentId: data.excludeAppointmentId } : {}),
    });
    return { slots };
  });

export const saveAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        patientId: z.string().uuid({ message: "Escolha o paciente" }),
        serviceId: z.string().uuid({ message: "Escolha o serviço" }),
        professionalId: z.string().uuid({ message: "Escolha o profissional" }),
        startsAt: z.string().datetime({ offset: true }),
        notes: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadClinicContext(context.supabase);
    const result = await reserveAppointment(context.supabase, ctx, {
      patientId: data.patientId,
      serviceId: data.serviceId,
      professionalId: data.professionalId,
      startsAt: data.startsAt,
      source: "manual",
      notes: data.notes,
      ...(data.id ? { rescheduleId: data.id } : {}),
    });
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, id: result.appointment.id };
  });
