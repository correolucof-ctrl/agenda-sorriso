// Time-zone helpers. Instants are always stored in UTC; dates ("YYYY-MM-DD") and
// minutes-since-midnight are in the clinic's business time zone.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function zonedParts(instant: Date, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

const pad = (n: number) => String(n).padStart(2, "0");

export function businessDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

function splitDate(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

/** Converts a business-local date + minutes since midnight to the UTC instant. */
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = splitDate(date);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const off = offsetMs(new Date(guess), timeZone);
  let result = guess - off;
  const off2 = offsetMs(new Date(result), timeZone);
  if (off2 !== off) result = guess - off2;
  return new Date(result);
}

/** "08:00" or "08:00:00" -> 480 */
export function parseClock(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function clockLabel(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export const WEEKDAYS_SHORT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function formatTime(instant: Date | string, timeZone: string): string {
  return clockLabel(localMinutes(new Date(instant), timeZone));
}

export function formatDateShort(date: string): string {
  const [, m, d] = splitDate(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${pad(d)}/${pad(m)}`;
}

export function formatDateLong(date: string): string {
  const [, m, d] = splitDate(date);
  return `${WEEKDAYS[weekdayOf(date)]?.toLowerCase()}, ${d} de ${MONTHS[m - 1]}`;
}

export function formatSlotLabel(instant: Date | string, timeZone: string): string {
  const i = new Date(instant);
  return `${formatDateShort(businessDate(i, timeZone))} às ${formatTime(i, timeZone)}`;
}

export function formatDateTime(instant: Date | string, timeZone: string): string {
  const i = new Date(instant);
  const [, m, d] = splitDate(businessDate(i, timeZone));
  return `${pad(d)}/${pad(m)} ${formatTime(i, timeZone)}`;
}
