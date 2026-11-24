// The attendance agent: a deterministic state machine that owns every scheduling decision.
// AI (optional) only rewords free-form replies; it never chooses times or books anything.
import type { Json } from "@/integrations/supabase/types";
import {
  classifyIntent,
  CLINICAL_REPLY,
  detectFaqTopic,
  INTENT_LABELS,
  isNo,
  isYes,
  matchProfessional,
  matchService,
  parseChoice,
  parseDatePreference,
  parsePeriod,
  parseTime,
  URGENCY_REPLY,
  wantsOtherOptions,
  type Intent,
  type Period,
} from "@/lib/agent-core";
import type { Slot } from "@/lib/scheduling";
import { businessDate, clockLabel, formatDateLong, formatSlotLabel, formatTime, parseClock, WEEKDAYS_SHORT } from "@/lib/time";
import { polishReply } from "./ai.server";
import {
  computeSlots,
  loadClinicContext,
  reserveAppointment,
  upcomingAppointmentsFor,
  type AppointmentRow,
  type ClinicContext,
  type DB,
} from "./booking.server";

export type OfferSlot = { professionalId: string; professionalName: string; start: string; label: string };

export type AgentState = {
  step?: "idle" | "choose_service" | "choose_slot" | "confirm_booking" | "choose_appointment" | "confirm_cancel" | "confirm_reschedule";
  flow?: "agendar" | "remarcar" | "cancelar";
  serviceId?: string;
  preferredProfessionalId?: string;
  /** Set when the patient explicitly named a professional: only that agenda is used. */
  requiredProfessionalId?: string;
  pref?: { date?: string; period?: Period };
  offered?: OfferSlot[];
  skip?: number;
  chosen?: OfferSlot;
  appointmentId?: string;
  candidates?: { id: string; label: string }[];
  misses?: number;
  lastAction?: string;
  lastBooked?: LastBooked;
};

type LastBooked = { start: string; serviceId: string; professionalId: string; label: string };

type ReplyOption = { label: string; value: string };
type Reply = { content: string; options?: ReplyOption[]; ai?: boolean };
type Status = "bot" | "pending_human" | "human" | "closed";
type Action = { type: "booked" | "rescheduled" | "cancelled" | "confirmed" | "handoff"; appointmentId?: string; reason?: string };
type Outcome = { replies: Reply[]; state: AgentState; status?: Status; urgent?: boolean; action?: Action; byStep?: boolean };

interface Turn {
  sb: DB;
  ctx: ClinicContext;
  patientId: string;
  firstName: string;
  text: string;
  intent: Intent;
  state: AgentState;
  today: string;
}

const MAX_OPTIONS = 4;
const MAX_MISSES = 2;

const MAIN_MENU: ReplyOption[] = [
  { label: "Agendar consulta", value: "Quero agendar uma consulta" },
  { label: "Remarcar", value: "Preciso remarcar minha consulta" },
  { label: "Cancelar", value: "Quero cancelar minha consulta" },
  { label: "Endereço e horários", value: "Qual o endereço e o horário de funcionamento?" },
];

function hoursSummary(ctx: ClinicContext) {
  return [1, 2, 3, 4, 5, 6, 0]
    .map((wd) => {
      const h = ctx.hours.find((x) => x.weekday === wd);
      const day = WEEKDAYS_SHORT[wd];
      if (!h || !h.is_open) return `${day}: fechado`;
      const pause = h.break_start && h.break_end ? ` (intervalo ${h.break_start.slice(0, 5)}–${h.break_end.slice(0, 5)})` : "";
      return `${day}: ${h.open_time.slice(0, 5)}–${h.close_time.slice(0, 5)}${pause}`;
    })
    .join("\n");
}

function activeServices(ctx: ClinicContext) {
  return ctx.services.filter((s) => s.active);
}

function clinicFacts(ctx: ClinicContext) {
  return [
    `Nome: ${ctx.clinic.name}${ctx.clinic.is_demo ? " (clínica fictícia de demonstração)" : ""}`,
    `Endereço: ${ctx.clinic.address}`,
    `Telefone: ${ctx.clinic.phone}`,
    `Horários:\n${hoursSummary(ctx)}`,
    `Serviços: ${activeServices(ctx).map((s) => `${s.name} (${s.duration_minutes} min)`).join(", ")}`,
    "Preços e convênios: informados somente pela equipe.",
  ].join("\n");
}

function handoff(state: AgentState, content: string, reason: string, urgent = false): Outcome {
  return {
    replies: [{ content }],
    state: { step: "idle", misses: 0, lastAction: `Transferido: ${reason}`, ...(state.lastBooked ? { lastBooked: state.lastBooked } : {}) },
    status: "pending_human",
    urgent,
    action: { type: "handoff", reason },
  };
}

function profName(ctx: ClinicContext, id: string) {
  return ctx.professionals.find((p) => p.id === id)?.name ?? "profissional";
}

function serviceName(ctx: ClinicContext, id: string) {
  return ctx.services.find((s) => s.id === id)?.name ?? "consulta";
}

function appointmentLabel(ctx: ClinicContext, a: AppointmentRow, lower = false) {
  const svc = serviceName(ctx, a.service_id);
  return `${lower ? svc.toLowerCase() : svc} em ${formatSlotLabel(a.starts_at, ctx.clinic.timezone)} com ${profName(ctx, a.professional_id)}`;
}

/** Spreads options: at most 2 per day, at least 60 minutes apart, preferring a given professional. */
function pickOptions(ctx: ClinicContext, slots: Slot[], preferredProfessionalId?: string, maxPerDay = 2): OfferSlot[] {
  const byStart = new Map<string, Slot[]>();
  for (const s of slots) {
    const list = byStart.get(s.start) ?? [];
    list.push(s);
    byStart.set(s.start, list);
  }
  const starts = [...byStart.keys()].sort();
  const picked: OfferSlot[] = [];
  const perDay = new Map<string, number[]>();
  for (const start of starts) {
    const candidates = byStart.get(start) ?? [];
    const slot = candidates.find((c) => c.professionalId === preferredProfessionalId) ?? candidates[0];
    if (!slot) continue;
    if (preferredProfessionalId && slot.professionalId !== preferredProfessionalId && candidates.length && starts.length > 8) {
      // keep continuity with the same professional when they still have options
      const preferredHasMore = slots.some((s) => s.professionalId === preferredProfessionalId);
      if (preferredHasMore) continue;
    }
    const minutes = parseClock(slot.time);
    const used = perDay.get(slot.date) ?? [];
    if (used.length >= maxPerDay || used.some((m) => Math.abs(m - minutes) < 60)) continue;
    used.push(minutes);
    perDay.set(slot.date, used);
    picked.push({
      professionalId: slot.professionalId,
      professionalName: profName(ctx, slot.professionalId),
      start: slot.start,
      label: `${formatSlotLabel(slot.start, ctx.clinic.timezone)} com ${profName(ctx, slot.professionalId)}`,
    });
  }
  return picked;
}

function describePref(pref: AgentState["pref"]) {
  const parts: string[] = [];
  if (pref?.date) parts.push(`em ${formatDateLong(pref.date)}`);
  if (pref?.period) parts.push(pref.period === "manha" ? "pela manhã" : "à tarde");
  return parts.join(" ");
}

async function offerSlots(
  t: Turn,
  args: {
    flow: "agendar" | "remarcar";
    serviceId: string;
    pref?: AgentState["pref"];
    skip?: number;
    preferredProfessionalId?: string;
    requiredProfessionalId?: string;
    appointmentId?: string;
    intro?: string;
  },
): Promise<Outcome> {
  const { ctx } = t;
  const service = ctx.services.find((s) => s.id === args.serviceId);
  if (!service) return handoff(t.state, "Não encontrei esse serviço no cadastro. Vou transferir para a equipe.", "Serviço não encontrado");
  const pref = args.pref ?? {};
  const baseArgs = {
    serviceId: service.id,
    ...(args.appointmentId ? { excludeAppointmentId: args.appointmentId } : {}),
    ...(args.requiredProfessionalId ? { professionalIds: [args.requiredProfessionalId] } : {}),
  };
  const filterPeriod = (list: Slot[]) =>
    pref.period ? list.filter((s) => (pref.period === "manha" ? s.time < "12:00" : s.time >= "12:00")) : list;

  let slots = filterPeriod(await computeSlots(t.sb, ctx, { ...baseArgs, ...(pref.date ? { fromDate: pref.date, days: 1 } : {}) }));
  let note = "";
  if (!slots.length && (pref.date || pref.period)) {
    note = `Não encontrei horários livres ${describePref(pref)}. Estas são as próximas opções. `;
    slots = await computeSlots(t.sb, ctx, baseArgs);
  }
  if (args.appointmentId) {
    const { data: current } = await t.sb.from("appointments").select("professional_id, starts_at").eq("id", args.appointmentId).maybeSingle();
    if (current) {
      const curStart = new Date(current.starts_at).toISOString();
      slots = slots.filter((sl) => !(sl.professionalId === current.professional_id && sl.start === curStart));
    }
  }
  const all = pickOptions(ctx, slots, args.requiredProfessionalId ?? args.preferredProfessionalId, pref.date && !note ? MAX_OPTIONS : 2);
  let skip = args.skip ?? 0;
  if (skip >= all.length) skip = 0;
  const offered = all.slice(skip, skip + MAX_OPTIONS);
  if (!offered.length) {
    return handoff(
      t.state,
      `Não encontrei horários disponíveis para ${service.name.toLowerCase()} nos próximos ${ctx.clinic.max_advance_days} dias. Vou transferir sua conversa para a equipe, que vai verificar outras possibilidades.`,
      "Sem disponibilidade na agenda",
    );
  }
  const list = offered.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  const content = `${args.intro ?? ""}${note}Para ${service.name.toLowerCase()} (${service.duration_minutes} min), tenho estes horários disponíveis:\n${list}\n\nResponda com o número da opção. Se preferir outro dia ou período, é só dizer, por exemplo: "amanhã à tarde".`;
  return {
    replies: [
      {
        content,
        options: [
          ...offered.map((o, i) => ({ label: `${i + 1}. ${o.label}`, value: String(i + 1) })),
          { label: "Outros horários", value: "Tem outros horários?" },
        ],
      },
    ],
    state: {
      step: "choose_slot",
      flow: args.flow,
      serviceId: service.id,
      pref,
      skip,
      offered,
      misses: 0,
      lastAction: `Ofereceu ${offered.length} horários`,
      ...(args.preferredProfessionalId ? { preferredProfessionalId: args.preferredProfessionalId } : {}),
      ...(args.requiredProfessionalId ? { requiredProfessionalId: args.requiredProfessionalId } : {}),
      ...(args.appointmentId ? { appointmentId: args.appointmentId } : {}),
      ...(t.state.lastBooked ? { lastBooked: t.state.lastBooked } : {}),
    },
  };
}

function confirmPrompt(t: Turn, chosen: OfferSlot): Outcome {
  const { ctx, state } = t;
  const tz = ctx.clinic.timezone;
  const svc = serviceName(ctx, state.serviceId ?? "");
  const date = formatDateLong(businessDate(new Date(chosen.start), tz));
  const time = formatTime(chosen.start, tz);
  const verb = state.flow === "remarcar" ? "Confirma a remarcação para" : `Confirma ${svc.toLowerCase()} em`;
  return {
    replies: [
      {
        content: `${verb} ${date} às ${time} com ${chosen.professionalName}? Responda SIM para confirmar ou NÃO para ver outras opções.`,
        options: [
          { label: "Sim, confirmar", value: "Sim" },
          { label: "Não, ver outras", value: "Não" },
        ],
      },
    ],
    state: { ...state, step: state.flow === "remarcar" ? "confirm_reschedule" : "confirm_booking", chosen, misses: 0, lastAction: "Aguardando confirmação" },
  };
}

async function finalizeBooking(t: Turn): Promise<Outcome> {
  const { ctx, state } = t;
  const chosen = state.chosen;
  if (!chosen || !state.serviceId) return { replies: [{ content: "Vamos recomeçar. Qual serviço você deseja agendar?" }], state: { step: "idle" } };
  const reschedule = state.flow === "remarcar" && state.appointmentId;
  const result = await reserveAppointment(t.sb, ctx, {
    patientId: t.patientId,
    serviceId: state.serviceId,
    professionalId: chosen.professionalId,
    startsAt: chosen.start,
    source: "agent",
    ...(reschedule ? { rescheduleId: state.appointmentId } : {}),
  });
  const tz = ctx.clinic.timezone;
  if (!result.ok) {
    const again = await offerSlots(t, {
      flow: state.flow === "remarcar" ? "remarcar" : "agendar",
      serviceId: state.serviceId,
      ...(state.preferredProfessionalId ? { preferredProfessionalId: state.preferredProfessionalId } : {}),
      ...(state.appointmentId ? { appointmentId: state.appointmentId } : {}),
      intro: `Desculpe, o horário de ${formatSlotLabel(chosen.start, tz)} ficou indisponível e não foi reservado. `,
    });
    again.state.lastAction = `Reserva recusada: ${result.message}`;
    return again;
  }
  const a = result.appointment;
  const date = formatDateLong(businessDate(new Date(a.starts_at), tz));
  const time = formatTime(a.starts_at, tz);
  const svc = serviceName(ctx, a.service_id);
  const lead = reschedule ? `Pronto, ${t.firstName}. Sua consulta foi remarcada para` : `Pronto, ${t.firstName}. Sua consulta de ${svc.toLowerCase()} está agendada para`;
  return {
    replies: [
      {
        content: `${lead} ${date} às ${time} com ${chosen.professionalName}.\nEndereço: ${ctx.clinic.address}.\nVocê vai receber um lembrete ${ctx.clinic.reminder_hours_before} horas antes. Se precisar remarcar ou cancelar, é só escrever aqui.`,
      },
    ],
    state: {
      step: "idle",
      misses: 0,
      lastAction: reschedule ? "Consulta remarcada" : "Consulta agendada",
      lastBooked: { start: a.starts_at, serviceId: a.service_id, professionalId: a.professional_id, label: `${date} às ${time} com ${chosen.professionalName}` },
    },
    action: { type: reschedule ? "rescheduled" : "booked", appointmentId: a.id },
  };
}

function hoursUntil(iso: string) {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

async function startCancel(t: Turn, appt: AppointmentRow): Promise<Outcome> {
  const { ctx } = t;
  if (hoursUntil(appt.starts_at) < ctx.clinic.cancel_min_hours) {
    return handoff(
      t.state,
      `Sua consulta de ${appointmentLabel(ctx, appt, true)} começa em menos de ${ctx.clinic.cancel_min_hours} horas. Pela regra da clínica, nesse caso o cancelamento é feito pela equipe. Vou transferir sua conversa agora.`,
      `Cancelamento com menos de ${ctx.clinic.cancel_min_hours} h de antecedência`,
    );
  }
  return {
    replies: [
      {
        content: `Encontrei sua consulta de ${appointmentLabel(ctx, appt, true)}. Confirma o cancelamento? Responda SIM ou NÃO.`,
        options: [
          { label: "Sim, cancelar", value: "Sim" },
          { label: "Não, manter", value: "Não" },
        ],
      },
    ],
    state: { step: "confirm_cancel", flow: "cancelar", appointmentId: appt.id, misses: 0, lastAction: "Aguardando confirmação do cancelamento" },
  };
}

async function startReschedule(t: Turn, appt: AppointmentRow): Promise<Outcome> {
  const { ctx } = t;
  if (hoursUntil(appt.starts_at) < ctx.clinic.cancel_min_hours) {
    return handoff(
      t.state,
      `Sua consulta de ${appointmentLabel(ctx, appt, true)} começa em menos de ${ctx.clinic.cancel_min_hours} horas. Pela regra da clínica, nesse caso a remarcação é feita pela equipe. Vou transferir sua conversa agora.`,
      `Remarcação com menos de ${ctx.clinic.cancel_min_hours} h de antecedência`,
    );
  }
  return offerSlots(t, {
    flow: "remarcar",
    serviceId: appt.service_id,
    preferredProfessionalId: appt.professional_id,
    appointmentId: appt.id,
    pref: {
      ...(parseDatePreference(t.text, t.today) ? { date: parseDatePreference(t.text, t.today)! } : {}),
      ...(parsePeriod(t.text) ? { period: parsePeriod(t.text)! } : {}),
    },
    intro: `Encontrei sua consulta de ${appointmentLabel(ctx, appt, true)}. `,
  });
}

async function findAppointmentFlow(t: Turn, flow: "remarcar" | "cancelar"): Promise<Outcome> {
  const list = await upcomingAppointmentsFor(t.sb, t.ctx.clinic.id, t.patientId);
  if (!list.length) {
    return {
      replies: [
        {
          content: `Não encontrei consultas futuras no seu cadastro, ${t.firstName}. Quer que eu procure um horário para agendar?`,
          options: [{ label: "Agendar consulta", value: "Quero agendar uma consulta" }],
        },
      ],
      state: { step: "idle", misses: 0, lastAction: "Nenhuma consulta futura encontrada" },
    };
  }
  if (list.length === 1) return flow === "cancelar" ? startCancel(t, list[0]!) : startReschedule(t, list[0]!);
  const candidates = list.slice(0, 5).map((a) => ({ id: a.id, label: appointmentLabel(t.ctx, a) }));
  return {
    replies: [
      {
        content: `Encontrei mais de uma consulta. Qual delas você quer ${flow === "cancelar" ? "cancelar" : "remarcar"}?\n${candidates.map((c, i) => `${i + 1}. ${c.label}`).join("\n")}`,
        options: candidates.map((c, i) => ({ label: `${i + 1}. ${c.label}`, value: String(i + 1) })),
      },
    ],
    state: { step: "choose_appointment", flow, candidates, misses: 0, lastAction: "Escolhendo consulta" },
  };
}

async function askService(t: Turn, prefix = ""): Promise<Outcome> {
  const services = activeServices(t.ctx);
  return {
    replies: [
      {
        content: `${prefix}Qual serviço você deseja agendar?\n${services.map((s, i) => `${i + 1}. ${s.name} (${s.duration_minutes} min)`).join("\n")}`,
        options: services.map((s, i) => ({ label: s.name, value: String(i + 1) })),
      },
    ],
    state: {
      step: "choose_service",
      flow: "agendar",
      misses: 0,
      lastAction: "Perguntou o serviço",
      pref: {
        ...(parseDatePreference(t.text, t.today) ? { date: parseDatePreference(t.text, t.today)! } : {}),
        ...(parsePeriod(t.text) ? { period: parsePeriod(t.text)! } : {}),
      },
      ...(t.state.lastBooked ? { lastBooked: t.state.lastBooked } : {}),
    },
  };
}

function textPref(t: Turn): AgentState["pref"] {
  const date = parseDatePreference(t.text, t.today);
  const period = parsePeriod(t.text);
  return { ...(date ? { date } : {}), ...(period ? { period } : {}) };
}

async function handleExplicitTime(t: Turn, minutes: number): Promise<Outcome | null> {
  const { ctx, state } = t;
  if (!state.serviceId) return null;
  const tz = ctx.clinic.timezone;
  const date = parseDatePreference(t.text, t.today);
  const label = clockLabel(minutes);
  const offered = state.offered ?? [];
  const fromOffer = offered.find(
    (o) => formatTime(o.start, tz) === label && (!date || businessDate(new Date(o.start), tz) === date),
  );
  if (fromOffer) return confirmPrompt(t, fromOffer);
  const targetDate = date ?? (offered[0] ? businessDate(new Date(offered[0].start), tz) : t.today);
  const slots = await computeSlots(t.sb, ctx, {
    serviceId: state.serviceId,
    fromDate: targetDate,
    days: 1,
    ...(state.appointmentId ? { excludeAppointmentId: state.appointmentId } : {}),
    ...(state.requiredProfessionalId ? { professionalIds: [state.requiredProfessionalId] } : {}),
  });
  const matching = slots.filter((s) => s.time === label);
  const match = matching.find((s) => s.professionalId === state.preferredProfessionalId) ?? matching[0];
  if (match) {
    return confirmPrompt(t, {
      professionalId: match.professionalId,
      professionalName: profName(ctx, match.professionalId),
      start: match.start,
      label: `${formatSlotLabel(match.start, tz)} com ${profName(ctx, match.professionalId)}`,
    });
  }
  const out = await offerSlots(t, {
    flow: state.flow === "remarcar" ? "remarcar" : "agendar",
    serviceId: state.serviceId,
    pref: { date: targetDate },
    ...(state.preferredProfessionalId ? { preferredProfessionalId: state.preferredProfessionalId } : {}),
    ...(state.requiredProfessionalId ? { requiredProfessionalId: state.requiredProfessionalId } : {}),
    ...(state.appointmentId ? { appointmentId: state.appointmentId } : {}),
    intro: `O horário de ${formatDateLong(targetDate)} às ${label}${state.requiredProfessionalId ? ` com ${profName(ctx, state.requiredProfessionalId)}` : ""} não está disponível. `,
  });
  out.state.lastAction = `Horário solicitado indisponível (${label})`;
  return out;
}

async function stepHandler(t: Turn): Promise<Outcome | null> {
  const { state, text, ctx } = t;
  switch (state.step) {
    case "choose_service": {
      const services = activeServices(ctx);
      const n = parseChoice(text, services.length);
      const svc = n ? services[n - 1] : matchService(text, services);
      if (!svc) return null;
      const pref = { ...(state.pref ?? {}), ...textPref(t) };
      const named = matchProfessional(text, ctx.professionals.filter((p) => p.active));
      const required = named?.id ?? state.requiredProfessionalId;
      return offerSlots(t, { flow: "agendar", serviceId: svc.id, pref, ...(required ? { requiredProfessionalId: required } : {}) });
    }
    case "choose_slot": {
      const offered = state.offered ?? [];
      const n = parseChoice(text, offered.length);
      if (n) return confirmPrompt(t, offered[n - 1]!);
      const time = parseTime(text);
      if (time !== null) {
        const r = await handleExplicitTime(t, time);
        if (r) return r;
      }
      const pref = textPref(t);
      const other = wantsOtherOptions(text) || isNo(text);
      if (pref?.date || pref?.period || other) {
        return offerSlots(t, {
          flow: state.flow === "remarcar" ? "remarcar" : "agendar",
          serviceId: state.serviceId ?? "",
          pref: pref?.date || pref?.period ? pref : (state.pref ?? {}),
          skip: pref?.date || pref?.period ? 0 : (state.skip ?? 0) + offered.length,
          ...(state.preferredProfessionalId ? { preferredProfessionalId: state.preferredProfessionalId } : {}),
          ...(state.requiredProfessionalId ? { requiredProfessionalId: state.requiredProfessionalId } : {}),
          ...(state.appointmentId ? { appointmentId: state.appointmentId } : {}),
        });
      }
      return null;
    }
    case "confirm_booking":
    case "confirm_reschedule": {
      if (isYes(text)) return finalizeBooking(t);
      if (isNo(text) || t.intent === "cancelar") {
        return offerSlots(t, {
          flow: state.flow === "remarcar" ? "remarcar" : "agendar",
          serviceId: state.serviceId ?? "",
          pref: state.pref ?? {},
          skip: (state.skip ?? 0) + (state.offered?.length ?? 0),
          ...(state.preferredProfessionalId ? { preferredProfessionalId: state.preferredProfessionalId } : {}),
          ...(state.appointmentId ? { appointmentId: state.appointmentId } : {}),
          intro: "Sem problemas. ",
        });
      }
      return null;
    }
    case "confirm_cancel": {
      if (isYes(text) && state.appointmentId) {
        const { data, error } = await t.sb
          .from("appointments")
          .update({ status: "cancelled" })
          .eq("id", state.appointmentId)
          .in("status", ["scheduled", "confirmed"])
          .select("*")
          .maybeSingle();
        if (error || !data) return handoff(state, "Não consegui concluir o cancelamento. Vou transferir para a equipe.", "Falha ao cancelar");
        return {
          replies: [
            {
              content: `Sua consulta de ${appointmentLabel(ctx, data, true)} foi cancelada e o lembrete foi desativado. Quer que eu procure um novo horário?`,
              options: [{ label: "Agendar novo horário", value: "Quero agendar uma consulta" }],
            },
          ],
          state: { step: "idle", misses: 0, lastAction: "Consulta cancelada" },
          action: { type: "cancelled", appointmentId: data.id },
        };
      }
      if (isNo(text)) {
        return {
          replies: [{ content: "Tudo certo, sua consulta continua marcada. Posso ajudar com mais alguma coisa?", options: MAIN_MENU }],
          state: { step: "idle", misses: 0, lastAction: "Cancelamento desistido" },
        };
      }
      return null;
    }
    case "choose_appointment": {
      const candidates = state.candidates ?? [];
      const n = parseChoice(text, candidates.length);
      if (!n) return null;
      const { data } = await t.sb.from("appointments").select("*").eq("id", candidates[n - 1]!.id).maybeSingle();
      if (!data) return null;
      return state.flow === "cancelar" ? startCancel(t, data) : startReschedule(t, data);
    }
    default:
      return null;
  }
}

function repromptStep(t: Turn): Reply {
  const s = t.state;
  switch (s.step) {
    case "choose_service":
      return { content: "Não identifiquei o serviço. Responda com o número da lista ou o nome do serviço, por exemplo: limpeza." };
    case "choose_slot":
      return {
        content: "Não entendi qual horário você prefere. Responda com o número da opção ou diga outro dia ou período, por exemplo: \"sexta de manhã\".",
        options: (s.offered ?? []).map((o, i) => ({ label: `${i + 1}. ${o.label}`, value: String(i + 1) })),
      };
    case "confirm_booking":
    case "confirm_reschedule":
    case "confirm_cancel":
      return { content: "Para continuar, responda SIM para confirmar ou NÃO.", options: [{ label: "Sim", value: "Sim" }, { label: "Não", value: "Não" }] };
    case "choose_appointment":
      return { content: "Responda com o número da consulta da lista." };
    default:
      return {
        content: "Desculpe, não entendi bem. Posso agendar, remarcar ou cancelar consultas e tirar dúvidas sobre a clínica. Como posso ajudar?",
        options: MAIN_MENU,
        ai: true,
      };
  }
}

async function decide(t: Turn): Promise<Outcome> {
  const { intent, ctx, firstName } = t;

  if (intent === "urgencia") return handoff(t.state, URGENCY_REPLY, "Possível urgência relatada", true);
  if (intent === "humano") {
    return handoff(
      t.state,
      "Claro. Vou transferir sua conversa para a nossa equipe, que vai responder assim que possível. Se for uma urgência, procure um serviço de urgência.",
      "Paciente pediu atendente",
    );
  }

  const stepOutcome = await stepHandler(t);
  if (stepOutcome) return { ...stepOutcome, byStep: true };

  switch (intent) {
    case "agendar": {
      const svc = matchService(t.text, activeServices(ctx));
      const named = matchProfessional(t.text, ctx.professionals.filter((p) => p.active));
      if (svc) {
        const time = parseTime(t.text);
        if (time !== null) {
          const r = await handleExplicitTime(
            { ...t, state: { ...t.state, step: "choose_slot", flow: "agendar", serviceId: svc.id, offered: [], ...(named ? { requiredProfessionalId: named.id } : {}) } },
            time,
          );
          if (r) return r;
        }
        return offerSlots(t, { flow: "agendar", serviceId: svc.id, pref: textPref(t), ...(named ? { requiredProfessionalId: named.id } : {}) });
      }
      return askService(t, `Claro, ${firstName}. `);
    }
    case "remarcar":
      return findAppointmentFlow(t, "remarcar");
    case "cancelar":
      return findAppointmentFlow(t, "cancelar");
    case "confirmar_presenca": {
      const list = await upcomingAppointmentsFor(t.sb, ctx.clinic.id, t.patientId);
      const next = list.find((a) => a.status === "scheduled");
      if (!next) {
        return {
          replies: [{ content: "Não encontrei consultas pendentes de confirmação no seu cadastro. Posso ajudar com mais alguma coisa?", options: MAIN_MENU }],
          state: { step: "idle", misses: 0, lastAction: "Nada para confirmar" },
        };
      }
      await t.sb.from("appointments").update({ status: "confirmed" }).eq("id", next.id);
      return {
        replies: [{ content: `Presença confirmada, ${firstName}: ${appointmentLabel(ctx, next)}. Até lá.` }],
        state: { step: "idle", misses: 0, lastAction: "Presença confirmada" },
        action: { type: "confirmed", appointmentId: next.id },
      };
    }
    case "duvida": {
      const topic = detectFaqTopic(t.text);
      const svcList = activeServices(ctx).map((s) => `${s.name} (${s.duration_minutes} min)`).join(", ");
      let content: string | null = null;
      let ai = true;
      switch (topic) {
        case "clinica":
          content = CLINICAL_REPLY;
          ai = false;
          break;
        case "endereco":
          content = `Nosso endereço é ${ctx.clinic.address}. Telefone: ${ctx.clinic.phone}.`;
          break;
        case "horario_funcionamento":
          content = `Nosso horário de atendimento:\n${hoursSummary(ctx)}`;
          ai = false;
          break;
        case "servicos":
          content = `Atendemos: ${svcList}. Quer agendar algum deles?`;
          break;
        case "preco":
          content = "Os valores dependem da avaliação e são informados pela equipe da clínica. Posso agendar uma avaliação para você?";
          break;
        case "convenio":
        case "pagamento":
          content = "Essa informação é confirmada diretamente pela equipe da clínica no atendimento. Posso agendar uma avaliação enquanto isso?";
          break;
        default:
          content = null;
      }
      if (/endere/.test(t.text.toLowerCase()) && /hor[aá]rio/.test(t.text.toLowerCase())) {
        content = `Nosso endereço é ${ctx.clinic.address}.\nHorário de atendimento:\n${hoursSummary(ctx)}`;
        ai = false;
      }
      if (content) {
        return {
          replies: [{ content, ai, options: topic === "clinica" || topic === "preco" ? [{ label: "Agendar avaliação", value: "Quero agendar uma avaliação" }] : MAIN_MENU }],
          state: { ...t.state, misses: 0, lastAction: `Respondeu dúvida: ${topic ?? "geral"}` },
        };
      }
      break;
    }
    case "saudacao":
      return {
        replies: [
          {
            content: `Olá, ${firstName}. Sou o assistente virtual da ${ctx.clinic.name}. Posso agendar, remarcar ou cancelar consultas e tirar dúvidas sobre a clínica. Como posso ajudar?`,
            options: MAIN_MENU,
            ai: true,
          },
        ],
        state: { ...t.state, misses: 0, lastAction: "Saudação" },
      };
    case "agradecimento":
      return {
        replies: [{ content: `Por nada, ${firstName}. Se precisar de algo, é só escrever.`, ai: true }],
        state: { ...t.state, step: "idle", misses: 0, lastAction: "Encerrou com agradecimento" },
      };
    default:
      break;
  }

  // Low confidence: re-prompt once, then hand off.
  const misses = (t.state.misses ?? 0) + 1;
  if (misses >= MAX_MISSES) {
    return handoff(
      t.state,
      "Não consegui entender sua mensagem com segurança. Para você não ficar sem resposta, vou transferir a conversa para a nossa equipe.",
      "Baixa confiança na interpretação",
    );
  }
  return { replies: [repromptStep(t)], state: { ...t.state, misses, lastAction: "Mensagem não compreendida" } };
}

export type ProcessResult = {
  intent: Intent;
  intentLabel: string;
  status: Status;
  step: string;
  lastAction: string | null;
  action: Action | null;
  aiUsed: boolean;
  lastBooked: LastBooked | null;
  /** Agent replies exactly as stored, for delivery on a real channel. Empty when staff owns the conversation. */
  replies: Array<{ content: string; options: ReplyOption[] }>;
};

export async function processPatientMessage(
  sb: DB,
  input: { conversationId: string; text: string; kind: "text" | "audio"; audioLabel?: string; useAi: boolean },
): Promise<ProcessResult> {
  const { data: conv, error } = await sb.from("conversations").select("*").eq("id", input.conversationId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) throw new Error("Conversa não encontrada.");
  const ctx = await loadClinicContext(sb, conv.clinic_id);
  const intent = classifyIntent(input.text);
  const now = new Date().toISOString();

  const ins = await sb
    .from("messages")
    .insert({
      clinic_id: conv.clinic_id,
      conversation_id: conv.id,
      sender: "patient",
      kind: input.kind,
      content: input.text,
      audio_label: input.audioLabel ?? null,
      intent,
    })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);

  if (conv.status === "pending_human" || conv.status === "human") {
    await sb.from("messages").insert({
      clinic_id: conv.clinic_id,
      conversation_id: conv.id,
      sender: "system",
      content: "Mensagem recebida. A conversa está com a equipe; o agente automático não responde até ser devolvida a ele.",
    });
    await sb.from("conversations").update({ last_message_preview: input.text.slice(0, 140), last_message_at: now }).eq("id", conv.id);
    return { intent, intentLabel: INTENT_LABELS[intent], status: conv.status, step: "handoff", lastAction: "Aguardando equipe", action: null, aiUsed: false, lastBooked: null, replies: [] };
  }

  const state: AgentState = conv.status === "closed" ? {} : ((conv.state ?? {}) as AgentState);
  const patientId = conv.patient_id;
  let firstName = conv.contact_name.split(" ")[0] ?? "";
  if (patientId) {
    const { data: p } = await sb.from("patients").select("name").eq("id", patientId).maybeSingle();
    if (p) firstName = p.name.split(" ")[0] ?? firstName;
  }

  let outcome: Outcome;
  if (!patientId) {
    outcome = handoff(state, "Não encontrei seu cadastro. Vou transferir para a equipe concluir o atendimento.", "Contato sem cadastro");
  } else {
    outcome = await decide({ sb, ctx, patientId, firstName, text: input.text, intent, state, today: businessDate(new Date(), ctx.clinic.timezone) });
  }

  const weak: Intent[] = ["desconhecido", "confirmar_presenca", "saudacao", "agradecimento", "duvida"];
  const stepReply = !!outcome.byStep && weak.includes(intent);
  if (stepReply) await sb.from("messages").update({ intent: null }).eq("id", ins.data.id);

  let aiUsed = false;
  const facts = clinicFacts(ctx);
  const rows = [] as Array<{ clinic_id: string; conversation_id: string; sender: "agent"; content: string; ai_written: boolean; options: Json | null }>;
  for (const r of outcome.replies) {
    let content = r.content;
    let aiWritten = false;
    if (r.ai && input.useAi) {
      const polished = await polishReply({ patientText: input.text, draft: r.content, facts });
      if (polished) {
        content = polished;
        aiWritten = true;
        aiUsed = true;
      }
    }
    rows.push({
      clinic_id: conv.clinic_id,
      conversation_id: conv.id,
      sender: "agent",
      content,
      ai_written: aiWritten,
      options: (r.options ?? null) as Json | null,
    });
  }
  for (const row of rows) {
    const res = await sb.from("messages").insert(row);
    if (res.error) throw new Error(res.error.message);
  }
  const status: Status = outcome.status ?? "bot";
  if (outcome.action?.type === "handoff") {
    await sb.from("messages").insert({
      clinic_id: conv.clinic_id,
      conversation_id: conv.id,
      sender: "system",
      content: `Conversa transferida para a equipe. Motivo: ${outcome.action.reason ?? "não informado"}.`,
    });
  }
  const last = rows[rows.length - 1]?.content ?? input.text;
  const upd = await sb
    .from("conversations")
    .update({
      state: outcome.state as unknown as Json,
      status,
      last_intent: (intent === "desconhecido" || stepReply) && conv.last_intent ? conv.last_intent : intent,
      is_urgent: conv.is_urgent || !!outcome.urgent,
      last_message_preview: last.slice(0, 140),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conv.id);
  if (upd.error) throw new Error(upd.error.message);

  return {
    intent,
    intentLabel: stepReply ? "Resposta à etapa atual" : INTENT_LABELS[intent],
    status,
    step: outcome.state.step ?? "idle",
    lastAction: outcome.state.lastAction ?? null,
    action: outcome.action ?? null,
    aiUsed,
    lastBooked: outcome.state.lastBooked ?? null,
    replies: rows.map((r, i) => ({ content: r.content, options: outcome.replies[i]?.options ?? [] })),
  };
}
