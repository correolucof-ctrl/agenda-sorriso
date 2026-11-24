import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SelectField } from "@/components/app/AppointmentDialog";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Spinner } from "@/components/app/States";
import { useClinic, useHours, useProfessionals, useServices, type BusinessHours, type Clinic, type Professional, type Service } from "@/hooks/use-clinic";
import { getAvailableSlots } from "@/lib/booking.functions";
import { WhatsAppTestMode } from "@/components/app/WhatsAppTestMode";
import { ClinicAccount } from "@/components/app/ClinicAccount";
import { clinicRegistrationOptions } from "@/lib/clinic-registration-query";
import { getGoogleCalendarStatus, startGoogleCalendarConnection, disconnectGoogleCalendar } from "@/lib/google-calendar.functions";
import { addDays, businessDate, formatDateLong, parseClock, WEEKDAYS } from "@/lib/time";
import { errorMessage, PRO_COLOR_KEYS, proColor } from "@/lib/ui-maps";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicRegistrationOptions()),
  head: () => ({
    meta: [
      { title: "Configurações | Agenda Sorriso" },
      { name: "description", content: "Dados da clínica, horários, profissionais, serviços, regras e integrações." },
      { property: "og:title", content: "Configurações | Agenda Sorriso" },
      { property: "og:description", content: "Dados da clínica, horários, profissionais, serviços, regras e integrações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const clinic = useClinic();
  if (clinic.error) return <ErrorState error={clinic.error} onRetry={() => clinic.refetch()} />;
  if (!clinic.data) return <LoadingRows rows={6} />;
  const c = clinic.data;
  return (
    <div>
      <PageHeader title="Configurações" description="Tudo o que você alterar aqui muda imediatamente os horários que o agente oferece." />
      <Tabs defaultValue="clinica">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="clinica">Clínica e regras</TabsTrigger>
          <TabsTrigger value="conta">Conta e contratação</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
          <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="disponibilidade">Disponibilidade</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          {c.is_demo && <TabsTrigger value="demo">Dados de demonstração</TabsTrigger>}
        </TabsList>
        <TabsContent value="clinica"><ClinicForm clinic={c} /></TabsContent>
        <TabsContent value="conta"><ClinicAccount /></TabsContent>
        <TabsContent value="horarios"><HoursForm clinic={c} /></TabsContent>
        <TabsContent value="profissionais"><ProfessionalsTab clinic={c} /></TabsContent>
        <TabsContent value="servicos"><ServicesTab clinic={c} /></TabsContent>
        <TabsContent value="disponibilidade"><AvailabilityPreview clinic={c} /></TabsContent>
        <TabsContent value="integracoes"><Integrations /></TabsContent>
        {c.is_demo && <TabsContent value="demo"><DemoReset /></TabsContent>}
      </Tabs>
    </div>
  );
}

function NumberField({ id, label, hint, value, onChange, min, max, error }: { id: string; label: string; hint?: string; value: number; onChange: (v: number) => void; min: number; max: number; error?: string | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={Number.isNaN(value) ? "" : value} onChange={(e) => onChange(e.target.valueAsNumber)} aria-invalid={!!error} />
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ClinicForm({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(clinic);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(clinic), [clinic]);
  const set = <K extends keyof Clinic>(k: K, v: Clinic[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next["name"] = "Informe o nome da clínica";
    if (form.address.trim().length < 8) next["address"] = "Informe um endereço fictício";
    const range = (k: string, v: number, min: number, max: number) => {
      if (!Number.isFinite(v) || v < min || v > max) next[k] = `Use um valor entre ${min} e ${max}`;
    };
    range("min_advance_minutes", form.min_advance_minutes, 0, 10080);
    range("max_advance_days", form.max_advance_days, 1, 180);
    range("slot_step_minutes", form.slot_step_minutes, 5, 120);
    range("cancel_min_hours", form.cancel_min_hours, 0, 168);
    range("reminder_hours_before", form.reminder_hours_before, 1, 168);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase
      .from("clinics")
      .update({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        min_advance_minutes: form.min_advance_minutes,
        max_advance_days: form.max_advance_days,
        slot_step_minutes: form.slot_step_minutes,
        cancel_min_hours: form.cancel_min_hours,
        reminder_hours_before: form.reminder_hours_before,
      })
      .eq("id", clinic.id);
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Configurações salvas.");
    qc.invalidateQueries();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Dados da clínica</CardTitle>
          <CardDescription>Use apenas informações fictícias nesta demonstração.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cl-name">Nome</Label>
            <Input id="cl-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors["name"]} />
            {errors["name"] ? <p className="text-sm text-destructive">{errors["name"]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-address">Endereço fictício</Label>
            <Input id="cl-address" value={form.address} onChange={(e) => set("address", e.target.value)} aria-invalid={!!errors["address"]} />
            {errors["address"] ? <p className="text-sm text-destructive">{errors["address"]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-phone">Telefone fictício</Label>
            <Input id="cl-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Fuso horário: {clinic.timezone.replace("_", " ")}</p>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Regras de agendamento</CardTitle>
          <CardDescription>Aplicadas pelo agente e validadas no servidor.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField id="r-min" label="Antecedência mínima (minutos)" hint="Ex.: 120 = só a partir de 2 horas" value={form.min_advance_minutes} onChange={(v) => set("min_advance_minutes", v)} min={0} max={10080} error={errors["min_advance_minutes"]} />
          <NumberField id="r-max" label="Agenda aberta até (dias)" value={form.max_advance_days} onChange={(v) => set("max_advance_days", v)} min={1} max={180} error={errors["max_advance_days"]} />
          <NumberField id="r-step" label="Intervalo entre horários (min)" hint="De quanto em quanto tempo começam as consultas" value={form.slot_step_minutes} onChange={(v) => set("slot_step_minutes", v)} min={5} max={120} error={errors["slot_step_minutes"]} />
          <NumberField id="r-cancel" label="Cancelar/remarcar até (horas antes)" hint="Abaixo disso, a equipe assume" value={form.cancel_min_hours} onChange={(v) => set("cancel_min_hours", v)} min={0} max={168} error={errors["cancel_min_hours"]} />
          <NumberField id="r-rem" label="Lembrete (horas antes)" value={form.reminder_hours_before} onChange={(v) => set("reminder_hours_before", v)} min={1} max={168} error={errors["reminder_hours_before"]} />
        </CardContent>
      </Card>
      <div className="lg:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : <Save aria-hidden />} Salvar configurações
        </Button>
      </div>
    </form>
  );
}

type HoursDraft = { weekday: number; is_open: boolean; open_time: string; close_time: string; has_break: boolean; break_start: string; break_end: string };

function HoursForm({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const hours = useHours(clinic.id);
  const [rows, setRows] = useState<HoursDraft[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hours.data) return;
    setRows(
      [1, 2, 3, 4, 5, 6, 0].map((wd) => {
        const h: BusinessHours | undefined = hours.data.find((x) => x.weekday === wd);
        return {
          weekday: wd,
          is_open: h?.is_open ?? false,
          open_time: h?.open_time.slice(0, 5) ?? "08:00",
          close_time: h?.close_time.slice(0, 5) ?? "18:00",
          has_break: !!h?.break_start,
          break_start: h?.break_start?.slice(0, 5) ?? "12:00",
          break_end: h?.break_end?.slice(0, 5) ?? "13:00",
        };
      }),
    );
  }, [hours.data]);

  const update = (wd: number, patch: Partial<HoursDraft>) => setRows((rs) => rs.map((r) => (r.weekday === wd ? { ...r, ...patch } : r)));

  async function save() {
    const next: Record<number, string> = {};
    for (const r of rows) {
      if (!r.is_open) continue;
      if (parseClock(r.close_time) <= parseClock(r.open_time)) next[r.weekday] = "O fechamento precisa ser depois da abertura";
      else if (r.has_break && (parseClock(r.break_end) <= parseClock(r.break_start) || parseClock(r.break_start) <= parseClock(r.open_time) || parseClock(r.break_end) >= parseClock(r.close_time)))
        next[r.weekday] = "O intervalo precisa ficar dentro do horário de funcionamento";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase.from("business_hours").upsert(
      rows.map((r) => ({
        clinic_id: clinic.id,
        weekday: r.weekday,
        is_open: r.is_open,
        open_time: r.open_time,
        close_time: r.close_time,
        break_start: r.is_open && r.has_break ? r.break_start : null,
        break_end: r.is_open && r.has_break ? r.break_end : null,
      })),
      { onConflict: "clinic_id,weekday" },
    );
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Horários salvos. A disponibilidade já foi atualizada.");
    qc.invalidateQueries();
  }

  if (hours.error) return <ErrorState error={hours.error} onRetry={() => hours.refetch()} />;
  if (hours.isLoading) return <LoadingRows rows={7} />;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Horário de funcionamento</CardTitle>
        <CardDescription>O agente só oferece horários dentro destes períodos, fora do intervalo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.weekday} className={cn("rounded-lg border p-3", !r.is_open && "bg-muted/60")}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex w-44 items-center gap-2">
                <Switch id={`h-open-${r.weekday}`} checked={r.is_open} onCheckedChange={(v) => update(r.weekday, { is_open: v })} />
                <Label htmlFor={`h-open-${r.weekday}`} className="font-medium">{WEEKDAYS[r.weekday]}</Label>
              </div>
              {r.is_open ? (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`h-o-${r.weekday}`} className="sr-only">Abertura</Label>
                    <Input id={`h-o-${r.weekday}`} type="time" className="w-28" value={r.open_time} onChange={(e) => update(r.weekday, { open_time: e.target.value })} />
                    <span className="text-sm text-muted-foreground">às</span>
                    <Label htmlFor={`h-c-${r.weekday}`} className="sr-only">Fechamento</Label>
                    <Input id={`h-c-${r.weekday}`} type="time" className="w-28" value={r.close_time} onChange={(e) => update(r.weekday, { close_time: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id={`h-b-${r.weekday}`} checked={r.has_break} onCheckedChange={(v) => update(r.weekday, { has_break: v })} />
                    <Label htmlFor={`h-b-${r.weekday}`} className="text-sm">Intervalo</Label>
                    {r.has_break ? (
                      <>
                        <Input aria-label="Início do intervalo" type="time" className="w-28" value={r.break_start} onChange={(e) => update(r.weekday, { break_start: e.target.value })} />
                        <span className="text-sm text-muted-foreground">às</span>
                        <Input aria-label="Fim do intervalo" type="time" className="w-28" value={r.break_end} onChange={(e) => update(r.weekday, { break_end: e.target.value })} />
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
            {errors[r.weekday] ? <p className="mt-2 text-sm text-destructive">{errors[r.weekday]}</p> : null}
          </div>
        ))}
        <div className="pt-2">
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save aria-hidden />} Salvar horários
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfessionalsTab({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const pros = useProfessionals(clinic.id);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Clínica geral");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return setError("Informe o nome do profissional");
    setError("");
    setBusy("add");
    const color = PRO_COLOR_KEYS[(pros.data?.length ?? 0) % PRO_COLOR_KEYS.length]!;
    const { error: err } = await supabase.from("professionals").insert({ clinic_id: clinic.id, name: name.trim(), role_title: role.trim() || "Cirurgiã(o)-dentista", color });
    setBusy(null);
    if (err) return void toast.error(errorMessage(err));
    setName("");
    toast.success("Profissional adicionado.");
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  async function patch(p: Professional, values: Partial<Professional>) {
    setBusy(p.id);
    const { error: err } = await supabase.from("professionals").update(values).eq("id", p.id);
    setBusy(null);
    if (err) return void toast.error(errorMessage(err));
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  if (pros.error) return <ErrorState error={pros.error} onRetry={() => pros.refetch()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Profissionais</CardTitle>
          <CardDescription>Profissionais inativos não recebem novos agendamentos.</CardDescription>
        </CardHeader>
        <CardContent>
          {pros.isLoading ? <LoadingRows rows={3} /> : (pros.data ?? []).length === 0 ? <EmptyState title="Nenhum profissional" /> : (
            <ul className="divide-y">
              {(pros.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className={cn("size-3 rounded-full", proColor(p.color).solid)} aria-hidden />
                  <EditableText label="Nome" value={p.name} onSave={(v) => patch(p, { name: v })} />
                  <EditableText label="Especialidade" value={p.role_title} onSave={(v) => patch(p, { role_title: v })} muted />
                  <div className="ml-auto flex items-center gap-2">
                    {busy === p.id ? <Spinner /> : null}
                    <Label htmlFor={`pa-${p.id}`} className="text-sm">{p.active ? "Ativo" : "Inativo"}</Label>
                    <Switch id={`pa-${p.id}`} checked={p.active} onCheckedChange={(v) => patch(p, { active: v })} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit shadow-card">
        <CardHeader><CardTitle className="text-base">Adicionar profissional</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="np-name">Nome</Label>
              <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dr. Nome Fictício" aria-invalid={!!error} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-role">Especialidade</Label>
              <Input id="np-role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy === "add"}>{busy === "add" ? <Spinner /> : <Plus aria-hidden />} Adicionar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EditableText({ label, value, onSave, muted }: { label: string; value: string; onSave: (v: string) => void; muted?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim();
        if (t.length >= 2 && t !== value) onSave(t);
        else setV(value);
      }}
      className={cn("h-8 w-48 border-transparent bg-transparent px-2 shadow-none hover:border-input focus:border-input", muted && "text-muted-foreground")}
    />
  );
}

function ServicesTab({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const services = useServices(clinic.id);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return setError("Informe o nome do serviço");
    if (!Number.isFinite(duration) || duration < 10 || duration > 480) return setError("Duração entre 10 e 480 minutos");
    setError("");
    setBusy("add");
    const { error: err } = await supabase.from("services").insert({ clinic_id: clinic.id, name: name.trim(), duration_minutes: duration });
    setBusy(null);
    if (err) return void toast.error(errorMessage(err));
    setName("");
    toast.success("Serviço adicionado.");
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  async function patch(s: Service, values: Partial<Service>) {
    if (values.duration_minutes !== undefined && (!Number.isFinite(values.duration_minutes) || values.duration_minutes < 10 || values.duration_minutes > 480)) {
      toast.error("Duração entre 10 e 480 minutos");
      return;
    }
    setBusy(s.id);
    const { error: err } = await supabase.from("services").update(values).eq("id", s.id);
    setBusy(null);
    if (err) return void toast.error(errorMessage(err));
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  if (services.error) return <ErrorState error={services.error} onRetry={() => services.refetch()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Serviços e duração</CardTitle>
          <CardDescription>A duração define o tamanho de cada consulta na agenda.</CardDescription>
        </CardHeader>
        <CardContent>
          {services.isLoading ? <LoadingRows rows={3} /> : (services.data ?? []).length === 0 ? <EmptyState title="Nenhum serviço" /> : (
            <ul className="divide-y">
              {(services.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <EditableText label="Nome do serviço" value={s.name} onSave={(v) => patch(s, { name: v })} />
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Duração de ${s.name} em minutos`}
                      type="number"
                      min={10}
                      max={480}
                      step={5}
                      defaultValue={s.duration_minutes}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const v = e.currentTarget.valueAsNumber;
                        if (v !== s.duration_minutes) patch(s, { duration_minutes: v });
                      }}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {busy === s.id ? <Spinner /> : null}
                    <Label htmlFor={`sa-${s.id}`} className="text-sm">{s.active ? "Ativo" : "Inativo"}</Label>
                    <Switch id={`sa-${s.id}`} checked={s.active} onCheckedChange={(v) => patch(s, { active: v })} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit shadow-card">
        <CardHeader><CardTitle className="text-base">Adicionar serviço</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="ns-name">Nome</Label>
              <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aplicação de flúor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-dur">Duração (minutos)</Label>
              <Input id="ns-dur" type="number" min={10} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.valueAsNumber)} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy === "add"}>{busy === "add" ? <Spinner /> : <Plus aria-hidden />} Adicionar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AvailabilityPreview({ clinic }: { clinic: Clinic }) {
  const services = useServices(clinic.id);
  const pros = useProfessionals(clinic.id);
  const slotsFn = useServerFn(getAvailableSlots);
  const today = businessDate(new Date(), clinic.timezone);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(addDays(today, 1));
  useEffect(() => {
    if (!serviceId && services.data?.length) setServiceId(services.data.find((s) => s.active)?.id ?? "");
  }, [services.data, serviceId]);
  const slots = useQuery({
    queryKey: ["slots-preview", serviceId, date, clinic.updated_at],
    enabled: !!serviceId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: () => slotsFn({ data: { serviceId, date, days: 1, applyAdvanceRules: true } }),
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Prévia da disponibilidade</CardTitle>
        <CardDescription>Exatamente os horários que o agente ofereceria, calculados no servidor com as regras atuais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <SelectField id="av-service" label="Serviço" value={serviceId} onChange={setServiceId} options={(services.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: `${s.name} (${s.duration_minutes} min)` }))} />
          <div className="space-y-1.5">
            <Label htmlFor="av-date">Data</Label>
            <Input id="av-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <p className="text-sm font-medium capitalize">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateLong(date) : ""}</p>
        {slots.isLoading ? <LoadingRows rows={2} /> : slots.error ? <ErrorState error={slots.error} onRetry={() => slots.refetch()} /> : (slots.data?.slots ?? []).length === 0 ? (
          <EmptyState title="Nenhum horário disponível" description="A clínica está fechada, tudo está ocupado ou bloqueado, ou a data está fora das regras de antecedência." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(pros.data ?? []).filter((p) => p.active).map((p) => {
              const times = (slots.data?.slots ?? []).filter((s) => s.professionalId === p.id).map((s) => s.time);
              return (
                <div key={p.id} className="rounded-lg border p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2.5 rounded-full", proColor(p.color).solid)} aria-hidden /> {p.name}
                  </p>
                  {times.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {times.map((t) => <Badge key={t} variant="info">{t}</Badge>)}
                    </div>
                  ) : <p className="mt-2 text-sm text-muted-foreground">Sem horários livres</p>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const INTEGRATIONS: { name: string; now: string; needs: string[]; endpoint: string | null; phone?: string }[] = [
  {
    name: "WhatsApp Business Cloud API",
    now: "Receptor oficial pronto em modo de teste restrito; até vincular, as conversas acontecem só no simulador.",
    needs: ["Vincular a conexão do WhatsApp Business a este projeto", "Administrador adicionar os números de teste autorizados", "Publicar o app e escolher este projeto em \"Incoming messages\" na conexão", "Lembretes reais pelo WhatsApp continuam desativados"],
    endpoint: "/api/public/whatsapp/webhook",
  },
  {
    name: "Google Agenda",
    now: "A agenda interna do aplicativo é a fonte oficial de horários.",
    needs: ["Projeto no Google Cloud com a API Google Calendar ativa", "Autorização OAuth da conta da clínica", "Escolha de qual agenda sincronizar por profissional"],
    endpoint: null,
  },
  {
    name: "Transcrição de áudio",
    now: "Áudios do simulador usam transcrições de exemplo prontas. Áudios de números de teste do WhatsApp serão transcritos no servidor (até 10 MB).",
    needs: ["Depende do WhatsApp vinculado e de um número de teste autorizado", "Política de retenção dos áudios"],
    endpoint: null,
  },
];

function Integrations() {
  return (
    <div className="space-y-4">
    <WhatsAppTestMode />
    <GoogleCalendarConnection />
    <div className="grid gap-4 lg:grid-cols-3">
      {INTEGRATIONS.map((i) => (
        <Card key={i.name} className="shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{i.name}</CardTitle>
              <Badge variant="muted">Não conectado</Badge>
            </div>
            <CardDescription>{i.now}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">O que falta configurar</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {i.needs.map((n) => <li key={n}>{n}</li>)}
            </ul>
            {i.endpoint ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Endereço de recebimento: <code className="font-mono">{i.endpoint}</code>. Responde "não configurado" enquanto a conexão não estiver vinculada.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  );
}

function GoogleCalendarConnection() {
  const statusFn = useServerFn(getGoogleCalendarStatus);
  const startFn = useServerFn(startGoogleCalendarConnection);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const status = useQuery({ queryKey: ["google-calendar-status"], queryFn: () => statusFn() });
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try { const { url } = await startFn(); window.location.assign(url); }
    catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await disconnectFn(); await status.refetch(); toast.success("Google Agenda desconectado."); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Card className="shadow-card">
    <CardHeader>
      <CardTitle className="text-base">Google Agenda da clínica</CardTitle>
      <CardDescription>Sincroniza consultas da agenda interna com seu calendário. O nome e os dados do paciente não são enviados ao Google.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap items-center gap-3">
      <Badge variant={status.data?.connected ? "info" : "muted"}>{status.data?.connected ? "Conectado" : "Não conectado"}</Badge>
      <Button variant="outline" disabled={busy || status.isLoading} onClick={connect}>{busy ? <Spinner /> : null}{status.data?.connected ? "Reconectar" : "Conectar Google Agenda"}</Button>
      {status.data?.connected ? <Button variant="ghost" disabled={busy} onClick={disconnect}>Desconectar</Button> : null}
      {status.error ? <p className="text-sm text-destructive">Não foi possível consultar a conexão.</p> : null}
    </CardContent>
  </Card>;
}

function DemoReset() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    const { error } = await supabase.rpc("reset_demo_data");
    setBusy(false);
    setOpen(false);
    if (error) return void toast.error(errorMessage(error));
    await qc.invalidateQueries();
    toast.success("Dados de demonstração restaurados.");
  }
  return (
    <Card className="max-w-xl shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CircleAlert className="size-4 text-warning" aria-hidden /> Restaurar dados de demonstração</CardTitle>
        <CardDescription>Apaga consultas, conversas, pacientes e configurações desta conta e recria a clínica fictícia original. Outras contas não são afetadas.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => setOpen(true)} disabled={busy}>
          {busy ? <Spinner /> : <RotateCcw aria-hidden />} Restaurar agora
        </Button>
      </CardContent>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar a demonstração?</AlertDialogTitle>
            <AlertDialogDescription>Tudo o que você criou nesta conta será substituído pelos dados fictícios iniciais.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
