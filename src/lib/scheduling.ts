// Deterministic availability rules shared by the server (authoritative) and the UI (previews).
import { addDays, businessDate, clockLabel, localMinutes, parseClock, weekdayOf, zonedToUtc } from "./time";

export type HoursRow = {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
  break_start: string | null;
  break_end: string | null;
};

export type BusyInterval = {
  /** null = applies to the whole clinic */
  professionalId: string | null;
  start: Date;
  end: Date;
  kind: "appointment" | "block";
};

export type Slot = {
  professionalId: string;
  start: string;
  end: string;
  date: string;
  time: string;
};

export function openWindows(date: string, hours: HoursRow[]): Array<[number, number]> {
  const row = hours.find((h) => h.weekday === weekdayOf(date));
  if (!row || !row.is_open) return [];
  const open = parseClock(row.open_time);
  const close = parseClock(row.close_time);
  if (close <= open) return [];
  if (row.break_start && row.break_end) {
    const bs = parseClock(row.break_start);
    const be = parseClock(row.break_end);
    if (be > bs) {
      if (bs > open && be < close) return [[open, bs], [be, close]];
      if (bs <= open && be > open && be < close) return [[be, close]];
      if (bs > open && bs < close && be >= close) return [[open, bs]];
      if (bs <= open && be >= close) return [];
    }
  }
  return [[open, close]];
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function conflictFor(
  busy: BusyInterval[],
  professionalId: string,
  start: Date,
  end: Date,
): BusyInterval | undefined {
  return busy.find(
    (b) =>
      (b.professionalId === null || b.professionalId === professionalId) &&
      overlaps(start.getTime(), end.getTime(), b.start.getTime(), b.end.getTime()),
  );
}

export interface AvailabilityInput {
  timezone: string;
  now: Date;
  hours: HoursRow[];
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  stepMinutes: number;
  durationMinutes: number;
  professionalIds: string[];
  busy: BusyInterval[];
  /** First business date to consider; defaults to today in the clinic time zone. */
  fromDate?: string;
  days?: number;
}

export function generateSlots(input: AvailabilityInput): Slot[] {
  const { timezone, now, hours, stepMinutes, durationMinutes, professionalIds, busy } = input;
  const earliest = now.getTime() + input.minAdvanceMinutes * 60_000;
  const latest = now.getTime() + input.maxAdvanceDays * 86_400_000;
  const first = input.fromDate ?? businessDate(now, timezone);
  const days = Math.max(0, Math.min(input.days ?? input.maxAdvanceDays + 1, input.maxAdvanceDays + 1));
  const step = Math.max(5, stepMinutes);
  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(first, i);
    for (const [ws, we] of openWindows(date, hours)) {
      for (let t = ws; t + durationMinutes <= we; t += step) {
        const start = zonedToUtc(date, t, timezone);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start.getTime() < earliest || start.getTime() > latest) continue;
        for (const pid of professionalIds) {
          if (conflictFor(busy, pid, start, end)) continue;
          slots.push({
            professionalId: pid,
            start: start.toISOString(),
            end: end.toISOString(),
            date,
            time: clockLabel(t),
          });
        }
      }
    }
  }
  return slots;
}

export type FitResult = { ok: true } | { ok: false; reason: "past" | "closed" | "blocked" | "busy" };

/** Validates a manually chosen interval (agenda): future, inside opening hours, no conflicts. */
export function checkInterval(args: {
  timezone: string;
  now: Date;
  hours: HoursRow[];
  busy: BusyInterval[];
  professionalId: string;
  start: Date;
  end: Date;
}): FitResult {
  const { timezone, now, hours, busy, professionalId, start, end } = args;
  if (start.getTime() <= now.getTime()) return { ok: false, reason: "past" };
  const date = businessDate(start, timezone);
  if (businessDate(new Date(end.getTime() - 1), timezone) !== date) return { ok: false, reason: "closed" };
  const s = localMinutes(start, timezone);
  const e = s + Math.round((end.getTime() - start.getTime()) / 60_000);
  const fits = openWindows(date, hours).some(([ws, we]) => s >= ws && e <= we);
  if (!fits) return { ok: false, reason: "closed" };
  const c = conflictFor(busy, professionalId, start, end);
  if (c) return { ok: false, reason: c.kind === "block" ? "blocked" : "busy" };
  return { ok: true };
}

export const FIT_MESSAGES: Record<Exclude<FitResult, { ok: true }>["reason"], string> = {
  past: "Esse horário já passou.",
  closed: "Fora do horário de funcionamento da clínica.",
  blocked: "Há um bloqueio de agenda nesse horário.",
  busy: "O profissional já tem uma consulta nesse horário.",
};
