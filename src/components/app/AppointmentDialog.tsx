import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/app/States";
import type { Appointment, Clinic, Patient, Professional, Service } from "@/hooks/use-clinic";
import { getAvailableSlots, saveAppointment } from "@/lib/booking.functions";
import { businessDate, formatTime, parseClock, zonedToUtc } from "@/lib/time";
import { APPOINTMENT_STATUS, errorMessage } from "@/lib/ui-maps";

export type AppointmentDraft = { date: string; time: string; professionalId?: string };

export function AppointmentDialog({
  open,
  onOpenChange,
  clinic,
  appointment,
  draft,
  patients,
  services,
  professionals,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinic: Clinic;
  appointment: Appointment | null;
  draft: AppointmentDraft | null;
  patients: Patient[];
  services: Service[];
  professionals: Professional[];
}) {
  const tz = clinic.timezone;
  const qc = useQueryClient();
  const saveFn = useServerFn(saveAppointment);
  const slotsFn = useServerFn(getAvailableSlots);
  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const activeServices = services.filter((s) => s.active || s.id === appointment?.service_id);
  const activePros = professionals.filter((p) => p.active || p.id === appointment?.professional_id);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (appointment) {
      setPatientId(appointment.patient_id);
      setServiceId(appointment.service_id);
      setProfessionalId(appointment.professional_id);
      setDate(businessDate(new Date(appointment.starts_at), tz));
      setTime(formatTime(appointment.starts_at, tz));
      setNotes(appointment.notes);
      setStatus(appointment.status);
    } else {
      setPatientId(patients[0]?.id ?? "");
      setServiceId(activeServices[0]?.id ?? "");
      setProfessionalId(draft?.professionalId ?? activePros[0]?.id ?? "");
      setDate(draft?.date ?? businessDate(new Date(), tz));
      setTime(draft?.time ?? "09:00");
      setNotes("");
      setStatus("scheduled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment?.id]);

  const slots = useQuery({
    queryKey: ["slots-manual", serviceId, professionalId, date, appointment?.id],
    enabled: open && !!serviceId && !!professionalId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: () =>
      slotsFn({
        data: {
          serviceId,
          professionalId,
          date,
          applyAdvanceRules: false,
          ...(appointment ? { excludeAppointmentId: appointment.id } : {}),
        },
      }),
  });
  const suggestions = useMemo(() => (slots.data?.slots ?? []).map((s) => s.time), [slots.data]);

  const unchangedSlot =
    appointment &&
    appointment.service_id === serviceId &&
    appointment.professional_id === professionalId &&
    appointment.patient_id === patientId &&
    businessDate(new Date(appointment.starts_at), tz) === date &&
    formatTime(appointment.starts_at, tz) === time;

  async function invalidate() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["appointments"] }), qc.invalidateQueries({ queryKey: ["reminders"] }), qc.invalidateQueries({ queryKey: ["slots-manual"] })]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!patientId) next["patient"] = "Escolha o paciente";
    if (!serviceId) next["service"] = "Escolha o serviço";
    if (!professionalId) next["professional"] = "Escolha o profissional";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next["date"] = "Informe a data";
    if (!/^\d{2}:\d{2}$/.test(time)) next["time"] = "Informe o horário";
    if (notes.length > 500) next["notes"] = "Máximo de 500 caracteres";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (unchangedSlot && appointment) {
        const { error } = await supabase.from("appointments").update({ notes, status: status as Appointment["status"] }).eq("id", appointment.id);
        if (error) throw error;
      } else {
        const startsAt = zonedToUtc(date, parseClock(time), tz).toISOString();
        const res = await saveFn({ data: { patientId, serviceId, professionalId, startsAt, notes, ...(appointment ? { id: appointment.id } : {}) } });
        if (!res.ok) {
          setErrors({ time: res.message });
          toast.error(`Horário indisponível: ${res.message}`);
          return;
        }
        if (status !== "scheduled") await supabase.from("appointments").update({ status: status as Appointment["status"] }).eq("id", res.id);
      }
      await invalidate();
      toast.success(appointment ? "Consulta atualizada." : "Consulta criada.");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    if (!appointment) return;
    setBusy(true);
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id);
    setBusy(false);
    setConfirmCancel(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    await invalidate();
    toast.success("Consulta cancelada e lembrete desativado.");
    onOpenChange(false);
  }

  const isCancelled = appointment?.status === "cancelled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{appointment ? "Editar consulta" : "Nova consulta"}</DialogTitle>
            <DialogDescription>
              {appointment ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  Origem: {appointment.source === "agent" ? "agente" : "manual"}
                  {APPOINTMENT_STATUS[appointment.status] ? <Badge variant={APPOINTMENT_STATUS[appointment.status]!.variant}>{APPOINTMENT_STATUS[appointment.status]!.label}</Badge> : null}
                </span>
              ) : (
                "O horário é validado no servidor: funcionamento, bloqueios e conflitos."
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <SelectField id="ap-patient" label="Paciente" value={patientId} onChange={setPatientId} error={errors["patient"]} disabled={isCancelled}
              options={patients.map((p) => ({ value: p.id, label: `${p.name} · ${p.phone}` }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="ap-service" label="Serviço" value={serviceId} onChange={setServiceId} error={errors["service"]} disabled={isCancelled}
                options={activeServices.map((s) => ({ value: s.id, label: `${s.name} (${s.duration_minutes} min)` }))} />
              <SelectField id="ap-pro" label="Profissional" value={professionalId} onChange={setProfessionalId} error={errors["professional"]} disabled={isCancelled}
                options={activePros.map((p) => ({ value: p.id, label: p.name }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-date">Data</Label>
                <Input id="ap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors["date"]} disabled={isCancelled} />
                {errors["date"] ? <p className="text-sm text-destructive">{errors["date"]}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-time">Horário</Label>
                <Input id="ap-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} aria-invalid={!!errors["time"]} disabled={isCancelled} />
                {errors["time"] ? <p className="text-sm text-destructive">{errors["time"]}</p> : null}
              </div>
            </div>
            {!isCancelled ? (
              <div>
                <p className="mb-1.5 text-sm font-medium">Horários livres para este profissional</p>
                {slots.isLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Consultando a agenda...</p>
                ) : slots.error ? (
                  <p className="text-sm text-destructive">{errorMessage(slots.error)}</p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum horário livre nesta data.</p>
                ) : (
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => setTime(s)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s === time ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-primary-soft"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {appointment && !isCancelled ? (
              <SelectField id="ap-status" label="Situação" value={status} onChange={setStatus}
                options={["scheduled", "confirmed", "completed", "no_show"].map((s) => ({ value: s, label: APPOINTMENT_STATUS[s]!.label }))} />
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ap-notes">Observações</Label>
              <Textarea id="ap-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} disabled={isCancelled} />
              {errors["notes"] ? <p className="text-sm text-destructive">{errors["notes"]}</p> : null}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {appointment && !isCancelled ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)} disabled={busy}>
                  Cancelar consulta
                </Button>
              ) : <span />}
              {!isCancelled ? (
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null} {appointment ? "Salvar alterações" : "Criar consulta"}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta consulta?</AlertDialogTitle>
            <AlertDialogDescription>O horário volta a ficar disponível e o lembrete é desativado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={cancelAppointment}>Cancelar consulta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SelectField({ id, label, value, onChange, options, error, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string | undefined; disabled?: boolean | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
        <SelectTrigger id={id} aria-invalid={!!error}>
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
