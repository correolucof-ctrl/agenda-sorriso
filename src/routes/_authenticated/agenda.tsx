import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentDialog, SelectField, type AppointmentDraft } from "@/components/app/AppointmentDialog";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Spinner } from "@/components/app/States";
import {
  useAppointments,
  useBlocks,
  useClinic,
  useHours,
  usePatients,
  useProfessionals,
  useServices,
  type Appointment,
  type Clinic,
  type Professional,
  type ScheduleBlock,
} from "@/hooks/use-clinic";
import { openWindows } from "@/lib/scheduling";
import { addDays, businessDate, clockLabel, formatDateLong, formatDateShort, formatTime, localMinutes, parseClock, startOfWeek, weekdayOf, zonedToUtc } from "@/lib/time";
import { errorMessage, proColor } from "@/lib/ui-maps";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda | Agenda Sorriso" },
      { name: "description", content: "Agenda semanal e diária por profissional, com bloqueios e consultas." },
      { property: "og:title", content: "Agenda | Agenda Sorriso" },
      { property: "og:description", content: "Agenda semanal e diária por profissional, com bloqueios e consultas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

const PX_PER_MIN = 1.15;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Side-by-side lanes only for appointments that overlap in time (week view). */
function overlapLanes(items: Appointment[]) {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: Appointment[] = [];
  let clusterEnd = 0;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const a of cluster) result.set(a.id, { lane: result.get(a.id)!.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const a of sorted) {
    const s = new Date(a.starts_at).getTime();
    const e = new Date(a.ends_at).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    result.set(a.id, { lane, lanes: 0 });
    cluster.push(a);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return result;
}

function AgendaPage() {
  const clinic = useClinic();
  const c = clinic.data;
  const tz = c?.timezone ?? "America/Sao_Paulo";
  const today = businessDate(new Date(), tz);
  const [view, setView] = useState<"semana" | "dia">("semana");
  const [anchor, setAnchor] = useState(today);
  const [proFilter, setProFilter] = useState("all");
  const [dialog, setDialog] = useState<{ appointment: Appointment | null; draft: AppointmentDraft | null } | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  const hours = useHours(c?.id);
  const pros = useProfessionals(c?.id);
  const services = useServices(c?.id);
  const patients = usePatients(c?.id);

  const days = useMemo(() => {
    if (view === "dia") return [anchor];
    const monday = startOfWeek(anchor);
    const list = Array.from({ length: 7 }).map((_, i) => addDays(monday, i));
    return list.filter((d) => weekdayOf(d) !== 0 || hours.data?.find((h) => h.weekday === 0)?.is_open);
  }, [view, anchor, hours.data]);

  const fromIso = zonedToUtc(days[0] ?? anchor, 0, tz).toISOString();
  const toIso = zonedToUtc(addDays(days[days.length - 1] ?? anchor, 1), 0, tz).toISOString();
  const appts = useAppointments(c?.id, fromIso, toIso);
  const blocks = useBlocks(c?.id, fromIso, toIso);

  const visiblePros = (pros.data ?? []).filter((p) => p.active && (proFilter === "all" || p.id === proFilter));
  const [startMin, endMin] = useMemo(() => {
    const open = (hours.data ?? []).filter((h) => h.is_open);
    if (!open.length) return [8 * 60, 18 * 60];
    return [Math.min(...open.map((h) => parseClock(h.open_time))), Math.max(...open.map((h) => parseClock(h.close_time)))];
  }, [hours.data]);

  if (clinic.error) return <ErrorState error={clinic.error} onRetry={() => clinic.refetch()} />;
  const loading = !c || hours.isLoading || pros.isLoading || appts.isLoading || blocks.isLoading;

  const shift = (dir: number) => setAnchor(addDays(anchor, dir * (view === "dia" ? 1 : 7)));
  const rangeLabel = view === "dia" ? formatDateLong(anchor) : `${formatDateShort(days[0] ?? anchor)} a ${formatDateShort(days[days.length - 1] ?? anchor)}`;
  const visibleAppts = (appts.data ?? []).filter((a) => a.status !== "cancelled" && (proFilter === "all" || a.professional_id === proFilter));
  const cancelled = (appts.data ?? []).filter((a) => a.status === "cancelled");

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Clique em um horário vazio para criar uma consulta ou em uma consulta para editar."
        actions={
          <>
            <Button variant="outline" onClick={() => setBlockOpen(true)} disabled={!c}>
              <Ban aria-hidden /> Novo bloqueio
            </Button>
            <Button onClick={() => setDialog({ appointment: null, draft: { date: view === "dia" ? anchor : today, time: "09:00" } })} disabled={!c}>
              <Plus aria-hidden /> Nova consulta
            </Button>
          </>
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3 shadow-card">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Período anterior">
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Próximo período">
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <p className="font-display font-semibold">{cap(rangeLabel)}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por profissional"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={proFilter}
            onChange={(e) => setProFilter(e.target.value)}
          >
            <option value="all">Todos os profissionais</option>
            {(pros.data ?? []).filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Tabs value={view} onValueChange={(v) => setView(v as "semana" | "dia")}>
            <TabsList>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="dia">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {(pros.data ?? []).filter((p) => p.active).map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", proColor(p.color).solid)} aria-hidden /> {p.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-dashed border-muted-foreground bg-muted" aria-hidden /> Bloqueio / fechado
        </span>
      </div>

      {loading ? (
        <LoadingRows rows={6} />
      ) : appts.error || blocks.error ? (
        <ErrorState error={appts.error ?? blocks.error} onRetry={() => { appts.refetch(); blocks.refetch(); }} />
      ) : visiblePros.length === 0 ? (
        <EmptyState title="Nenhum profissional ativo" description="Cadastre ou ative profissionais em Configurações." />
      ) : (
        <Card className="overflow-x-auto shadow-card">
          <Grid
            clinic={c!}
            hours={hours.data ?? []}
            days={days}
            view={view}
            professionals={visiblePros}
            appointments={visibleAppts}
            blocks={blocks.data ?? []}
            startMin={startMin}
            endMin={endMin}
            patientName={(id) => patients.data?.find((p) => p.id === id)?.name ?? "Paciente"}
            serviceName={(id) => services.data?.find((s) => s.id === id)?.name ?? "Consulta"}
            onEmptyClick={(date, minutes, professionalId) =>
              setDialog({ appointment: null, draft: { date, time: clockLabel(minutes), ...(professionalId ? { professionalId } : {}) } })
            }
            onAppointmentClick={(a) => setDialog({ appointment: a, draft: null })}
          />
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BlocksList clinic={c} blocks={blocks.data ?? []} professionals={pros.data ?? []} />
        <Card className="p-4 shadow-card">
          <h2 className="font-display font-semibold">Canceladas neste período</h2>
          {cancelled.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma consulta cancelada.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {cancelled.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">
                    {patients.data?.find((p) => p.id === a.patient_id)?.name} · {formatDateShort(businessDate(new Date(a.starts_at), tz))} {formatTime(a.starts_at, tz)}
                  </span>
                  <Badge variant="danger">Cancelada</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {c && dialog ? (
        <AppointmentDialog
          open={!!dialog}
          onOpenChange={(v) => !v && setDialog(null)}
          clinic={c}
          appointment={dialog.appointment}
          draft={dialog.draft}
          patients={patients.data ?? []}
          services={services.data ?? []}
          professionals={pros.data ?? []}
        />
      ) : null}
      {c ? <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} clinic={c} professionals={pros.data ?? []} defaultDate={view === "dia" ? anchor : today} /> : null}
    </div>
  );
}

function Grid(props: {
  clinic: Clinic;
  hours: Parameters<typeof openWindows>[1];
  days: string[];
  view: "semana" | "dia";
  professionals: Professional[];
  appointments: Appointment[];
  blocks: ScheduleBlock[];
  startMin: number;
  endMin: number;
  patientName: (id: string) => string;
  serviceName: (id: string) => string;
  onEmptyClick: (date: string, minutes: number, professionalId?: string) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const { clinic, days, view, professionals, startMin, endMin } = props;
  const tz = clinic.timezone;
  const height = (endMin - startMin) * PX_PER_MIN;
  const rows: number[] = [];
  for (let m = startMin; m < endMin; m += 30) rows.push(m);
  const columns =
    view === "dia"
      ? professionals.map((p) => ({ key: p.id, date: days[0]!, pros: [p], title: p.name, sub: p.role_title }))
      : days.map((d) => ({ key: d, date: d, pros: professionals, title: formatDateShort(d), sub: "" }));
  const step = clinic.slot_step_minutes;
  const today = businessDate(new Date(), tz);

  function handleClick(e: MouseEvent<HTMLDivElement>, date: string, pros: Professional[]) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const minutes = startMin + Math.floor(y / PX_PER_MIN / step) * step;
    const lane = Math.min(pros.length - 1, Math.max(0, Math.floor((x / rect.width) * pros.length)));
    props.onEmptyClick(date, minutes, pros[lane]?.id);
  }

  return (
    <div className="min-w-[760px]">
      <div className="sticky top-0 z-10 grid border-b bg-card" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div />
        {columns.map((col) => (
          <div key={col.key} className={cn("border-l px-2 py-2.5 text-center", col.date === today && view === "semana" && "bg-primary-soft")}>
            <p className="text-sm font-semibold">{cap(col.title)}</p>
            {col.sub ? <p className="text-xs text-muted-foreground">{col.sub}</p> : null}
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height }}>
          {rows.map((m) => (
            <span key={m} className={cn("absolute right-2 text-[11px] text-muted-foreground", m === startMin ? "translate-y-0.5" : "-translate-y-1/2")} style={{ top: (m - startMin) * PX_PER_MIN }}>
              {m % 60 === 0 ? clockLabel(m) : ""}
            </span>
          ))}
        </div>
        {columns.map((col) => {
          const windows = openWindows(col.date, props.hours);
          const closed: Array<[number, number]> = [];
          let cursor = startMin;
          for (const [ws, we] of windows) {
            if (ws > cursor) closed.push([cursor, ws]);
            cursor = Math.max(cursor, we);
          }
          if (cursor < endMin) closed.push([cursor, endMin]);
          const laneOf = (pid: string) => Math.max(0, col.pros.findIndex((p) => p.id === pid));
          const laneW = 100 / col.pros.length;
          const dayAppts = props.appointments.filter((a) => businessDate(new Date(a.starts_at), tz) === col.date && col.pros.some((p) => p.id === a.professional_id));
          const lanes = overlapLanes(dayAppts);
          return (
            <div
              key={col.key}
              className="relative cursor-pointer border-l"
              style={{ height }}
              onClick={(e) => handleClick(e, col.date, col.pros)}
              role="grid"
              aria-label={`Horários de ${col.title}`}
            >
              {rows.map((m) => (
                <div key={m} className={cn("absolute inset-x-0 border-t", m % 60 === 0 ? "border-border" : "border-border/50 border-dashed")} style={{ top: (m - startMin) * PX_PER_MIN }} />
              ))}
              {closed.map(([s, e]) => (
                <div key={`c${s}`} className="absolute inset-x-0 bg-muted/80" style={{ top: (s - startMin) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }} aria-hidden />
              ))}
              {props.blocks
                .filter((b) => businessDate(new Date(b.starts_at), tz) === col.date || businessDate(new Date(b.ends_at), tz) === col.date)
                .filter((b) => !b.professional_id || col.pros.some((p) => p.id === b.professional_id))
                .map((b) => {
                  const s = Math.max(startMin, businessDate(new Date(b.starts_at), tz) === col.date ? localMinutes(new Date(b.starts_at), tz) : startMin);
                  const e = Math.min(endMin, businessDate(new Date(b.ends_at), tz) === col.date ? localMinutes(new Date(b.ends_at), tz) : endMin);
                  if (e <= s) return null;
                  const whole = true;
                  const who = b.professional_id ? col.pros.find((p) => p.id === b.professional_id)?.name : null;
                  return (
                    <div
                      key={b.id}
                      className="absolute overflow-hidden rounded-md border border-dashed border-muted-foreground/60 bg-muted px-1.5 py-1 text-[11px] text-muted-foreground"
                      style={{ top: (s - startMin) * PX_PER_MIN, height: (e - s) * PX_PER_MIN, left: whole ? "2%" : `${laneOf(b.professional_id!) * laneW + 1}%`, width: whole ? "96%" : `${laneW - 2}%` }}
                      title={`Bloqueio: ${b.reason || "sem motivo"}`}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <span className="font-semibold">Bloqueio{who && col.pros.length > 1 ? ` · ${who}` : ""}</span> {b.reason}
                    </div>
                  );
                })}
              {dayAppts.map((a) => {
                  const s = localMinutes(new Date(a.starts_at), tz);
                  const e = localMinutes(new Date(a.ends_at), tz);
                  const pro = col.pros.find((p) => p.id === a.professional_id);
                  const color = proColor(pro?.color);
                  const pos = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                  const w = 100 / Math.max(1, pos.lanes);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        props.onAppointmentClick(a);
                      }}
                      className={cn(
                        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-card transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        color.soft,
                        color.border,
                        a.status === "completed" && "opacity-60",
                      )}
                      style={{ top: (s - startMin) * PX_PER_MIN + 1, height: Math.max(18, (e - s) * PX_PER_MIN - 2), left: `${pos.lane * w + 1}%`, width: `${w - 2}%` }}
                      aria-label={`${props.patientName(a.patient_id)}, ${props.serviceName(a.service_id)}, ${formatTime(a.starts_at, tz)} com ${pro?.name}`}
                    >
                      <span className="block truncate font-semibold text-foreground">
                        {formatTime(a.starts_at, tz)} {props.patientName(a.patient_id)}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {props.serviceName(a.service_id)}
                        {a.status === "confirmed" ? " · confirmada" : ""}
                        {a.source === "agent" ? " · agente" : ""}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlocksList({ clinic, blocks, professionals }: { clinic?: Clinic | undefined; blocks: ScheduleBlock[]; professionals: Professional[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const tz = clinic?.timezone ?? "America/Sao_Paulo";
  async function remove(id: string) {
    setBusy(id);
    const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
    setBusy(null);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Bloqueio removido. Os horários voltaram a ficar disponíveis.");
      qc.invalidateQueries({ queryKey: ["blocks"] });
    }
  }
  return (
    <Card className="p-4 shadow-card">
      <h2 className="font-display font-semibold">Bloqueios neste período</h2>
      {blocks.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum bloqueio. Use "Novo bloqueio" para fechar horários sem remover consultas.</p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{b.reason || "Bloqueio"}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDateShort(businessDate(new Date(b.starts_at), tz))} {formatTime(b.starts_at, tz)}–{formatTime(b.ends_at, tz)} ·{" "}
                  {b.professional_id ? professionals.find((p) => p.id === b.professional_id)?.name : "Clínica inteira"}
                </span>
              </span>
              <Button variant="ghost" size="icon" onClick={() => remove(b.id)} disabled={busy === b.id} aria-label="Remover bloqueio">
                {busy === b.id ? <Spinner /> : <Trash2 aria-hidden />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BlockDialog({ open, onOpenChange, clinic, professionals, defaultDate }: { open: boolean; onOpenChange: (v: boolean) => void; clinic: Clinic; professionals: Professional[]; defaultDate: string }) {
  const qc = useQueryClient();
  const [pro, setPro] = useState("all");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("14:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Informe a data");
    if (parseClock(end) <= parseClock(start)) return setError("O fim precisa ser depois do início");
    if (reason.trim().length < 3) return setError("Informe o motivo (mínimo 3 letras)");
    setError("");
    setBusy(true);
    const { error: err } = await supabase.from("schedule_blocks").insert({
      clinic_id: clinic.id,
      professional_id: pro === "all" ? null : pro,
      starts_at: zonedToUtc(date, parseClock(start), clinic.timezone).toISOString(),
      ends_at: zonedToUtc(date, parseClock(end), clinic.timezone).toISOString(),
      reason: reason.trim(),
    });
    setBusy(false);
    if (err) return void toast.error(errorMessage(err));
    toast.success("Bloqueio criado. O agente não oferecerá esses horários.");
    qc.invalidateQueries({ queryKey: ["blocks"] });
    onOpenChange(false);
    setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo bloqueio de agenda</DialogTitle>
          <DialogDescription>Consultas já marcadas continuam na agenda; apenas novos agendamentos ficam impedidos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <SelectField id="bl-pro" label="Aplica a" value={pro} onChange={setPro} options={[{ value: "all", label: "Clínica inteira" }, ...professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bl-date">Data</Label>
              <Input id="bl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-start">Início</Label>
              <Input id="bl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-end">Fim</Label>
              <Input id="bl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bl-reason">Motivo</Label>
            <Input id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reunião de equipe" maxLength={120} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Criar bloqueio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
