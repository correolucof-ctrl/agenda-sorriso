import { describe, expect, it } from "vitest";
import { checkInterval, generateSlots, type HoursRow } from "@/lib/scheduling";
import { zonedToUtc } from "@/lib/time";

const TZ = "America/Sao_Paulo";
// Thursday 2026-11-26
const hours: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  is_open: weekday >= 1 && weekday <= 5,
  open_time: "08:00",
  close_time: "12:00",
  break_start: "10:00",
  break_end: "10:30",
}));
const base = {
  timezone: TZ,
  hours,
  minAdvanceMinutes: 0,
  maxAdvanceDays: 30,
  stepMinutes: 30,
  durationMinutes: 60,
  professionalIds: ["p1"],
};

describe("disponibilidade", () => {
  it("gera horários só dentro do funcionamento, respeitando intervalo", () => {
    const now = zonedToUtc("2026-11-26", 6 * 60, TZ);
    const slots = generateSlots({ ...base, now, busy: [], fromDate: "2026-11-26", days: 1 });
    expect(slots.map((s) => s.time)).toEqual(["08:00", "08:30", "09:00", "10:30", "11:00"]);
  });

  it("não oferece horário já ocupado pelo mesmo profissional", () => {
    const now = zonedToUtc("2026-11-26", 6 * 60, TZ);
    const busy = [{ professionalId: "p1", start: zonedToUtc("2026-11-26", 9 * 60, TZ), end: zonedToUtc("2026-11-26", 10 * 60, TZ), kind: "appointment" as const }];
    const slots = generateSlots({ ...base, now, busy, fromDate: "2026-11-26", days: 1 });
    expect(slots.map((s) => s.time)).toEqual(["08:00", "10:30", "11:00"]);
  });

  it("bloqueio da clínica inteira remove horários de todos os profissionais", () => {
    const now = zonedToUtc("2026-11-26", 6 * 60, TZ);
    const busy = [{ professionalId: null, start: zonedToUtc("2026-11-26", 8 * 60, TZ), end: zonedToUtc("2026-11-26", 12 * 60, TZ), kind: "block" as const }];
    const slots = generateSlots({ ...base, professionalIds: ["p1", "p2"], now, busy, fromDate: "2026-11-26", days: 1 });
    expect(slots).toHaveLength(0);
  });

  it("respeita a antecedência mínima", () => {
    const now = zonedToUtc("2026-11-26", 7 * 60, TZ);
    const slots = generateSlots({ ...base, minAdvanceMinutes: 120, now, busy: [], fromDate: "2026-11-26", days: 1 });
    expect(slots[0]?.time).toBe("09:00");
  });

  it("dia fechado não tem horários e mudar o horário muda a disponibilidade", () => {
    const now = zonedToUtc("2026-11-26", 6 * 60, TZ);
    const saturday = generateSlots({ ...base, now, busy: [], fromDate: "2026-11-28", days: 1 });
    expect(saturday).toHaveLength(0);
    const opened = hours.map((h) => (h.weekday === 6 ? { ...h, is_open: true, break_start: null, break_end: null } : h));
    const after = generateSlots({ ...base, hours: opened, now, busy: [], fromDate: "2026-11-28", days: 1 });
    expect(after.map((s) => s.time)).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("converte horário local de São Paulo para UTC (UTC-3)", () => {
    expect(zonedToUtc("2026-11-26", 9 * 60, TZ).toISOString()).toBe("2026-11-26T12:00:00.000Z");
  });

  it("rejeita consulta manual em conflito", () => {
    const now = zonedToUtc("2026-11-26", 6 * 60, TZ);
    const start = zonedToUtc("2026-11-26", 9 * 60, TZ);
    const end = zonedToUtc("2026-11-26", 9 * 60 + 30, TZ);
    const busy = [{ professionalId: "p1", start, end, kind: "appointment" as const }];
    expect(checkInterval({ timezone: TZ, now, hours, busy, professionalId: "p1", start, end })).toEqual({ ok: false, reason: "busy" });
    expect(checkInterval({ timezone: TZ, now, hours, busy, professionalId: "p2", start, end })).toEqual({ ok: true });
  });
});
