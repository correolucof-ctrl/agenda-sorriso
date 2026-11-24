import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarCheck2, CalendarX2, Mic, Plus, RefreshCcw, Repeat2, Send, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChatMessages } from "@/components/app/ChatMessages";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/app/States";
import { useClinic, useConversations, useMessages, usePatients, useProfessionals, useServices, useUpcomingAppointments } from "@/hooks/use-clinic";
import { sendSimulatedMessage, startSimulatedConversation } from "@/lib/agent.functions";
import { businessDate, formatTime } from "@/lib/time";
import { CONVERSATION_STATUS, errorMessage } from "@/lib/ui-maps";

export const Route = createFileRoute("/_authenticated/simulador")({
  head: () => ({
    meta: [
      { title: "Simulador do agente | Agenda Sorriso" },
      { name: "description", content: "Teste conversas simuladas de WhatsApp com o agente de atendimento." },
      { property: "og:title", content: "Simulador do agente | Agenda Sorriso" },
      { property: "og:description", content: "Teste conversas simuladas de WhatsApp com o agente de atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulatorPage,
});

const AUDIO_SAMPLES = [
  { label: "Áudio de exemplo · 0:12", title: "Pedido de limpeza à tarde", text: "Oi, bom dia. Eu queria marcar uma limpeza para essa semana, de preferência à tarde." },
  { label: "Áudio de exemplo · 0:08", title: "Pedido de remarcação", text: "Oi, tudo bem? Não vou conseguir ir na minha consulta, preciso remarcar para outro dia." },
  { label: "Áudio de exemplo · 0:07", title: "Dúvida sobre a clínica", text: "Boa noite. Qual é o endereço da clínica e qual o horário de funcionamento?" },
];

const STEP_LABELS: Record<string, string> = {
  idle: "Aguardando pedido",
  choose_service: "Escolhendo serviço",
  choose_slot: "Escolhendo horário",
  confirm_booking: "Aguardando confirmação",
  confirm_reschedule: "Confirmando remarcação",
  confirm_cancel: "Confirmando cancelamento",
  choose_appointment: "Escolhendo consulta",
  handoff: "Com a equipe",
};

type LastResult = Awaited<ReturnType<typeof sendSimulatedMessage>>;
type Payload = { text: string; kind: "text" | "audio"; audioLabel?: string };

function SimulatorPage() {
  const qc = useQueryClient();
  const clinic = useClinic();
  const c = clinic.data;
  const tz = c?.timezone ?? "America/Sao_Paulo";
  const patients = usePatients(c?.id);
  const services = useServices(c?.id);
  const pros = useProfessionals(c?.id);
  const upcoming = useUpcomingAppointments(c?.id);
  const conversations = useConversations(c?.id);
  const startFn = useServerFn(startSimulatedConversation);
  const sendFn = useServerFn(sendSimulatedMessage);

  const [patientId, setPatientId] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastResult | null>(null);
  const [lastBooked, setLastBooked] = useState<LastResult["lastBooked"]>(null);
  const [contactOpen, setContactOpen] = useState(false);

  const messages = useMessages(conversationId);
  const conversation = conversations.data?.find((x) => x.id === conversationId) ?? null;

  useEffect(() => {
    if (!patientId && patients.data?.length) setPatientId(patients.data[0]!.id);
  }, [patients.data, patientId]);

  const patient = patients.data?.find((p) => p.id === patientId) ?? null;

  const patientWithAppointment = useMemo(() => {
    const minMs = (c?.cancel_min_hours ?? 12) * 3_600_000;
    const appt = (upcoming.data ?? []).find((a) => new Date(a.starts_at).getTime() - Date.now() > minMs);
    return appt?.patient_id ?? null;
  }, [upcoming.data, c?.cancel_min_hours]);

  async function refreshAll(convId: string | null) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["messages", convId] }),
      qc.invalidateQueries({ queryKey: ["conversations"] }),
      qc.invalidateQueries({ queryKey: ["appointments"] }),
      qc.invalidateQueries({ queryKey: ["reminders"] }),
    ]);
  }

  async function newConversation(forPatient?: string) {
    const pid = forPatient ?? patientId;
    if (!pid) {
      toast.error("Escolha um paciente fictício");
      return null;
    }
    const res = await startFn({ data: { patientId: pid } });
    setConversationId(res.conversationId);
    setPatientId(pid);
    setLast(null);
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    return res.conversationId;
  }

  async function send(payload: Payload, convOverride?: string | null) {
    const content = payload.text.trim();
    if (!content) {
      toast.error("Digite uma mensagem para o agente");
      return;
    }
    setBusy(true);
    setPending(content);
    try {
      let convId = convOverride ?? conversationId;
      if (!convId) convId = await newConversation();
      if (!convId) return;
      const res = await sendFn({
        data: { conversationId: convId, text: content, kind: payload.kind, useAi, ...(payload.audioLabel ? { audioLabel: payload.audioLabel } : {}) },
      });
      await qc.invalidateQueries({ queryKey: ["messages", convId] });
      setPending(null);
      setLast(res);
      if (res.lastBooked) setLastBooked(res.lastBooked);
      if (res.action?.type === "booked") toast.success("Consulta criada na agenda.");
      if (res.action?.type === "rescheduled") toast.success("Consulta remarcada na agenda.");
      if (res.action?.type === "cancelled") toast.success("Consulta cancelada na agenda.");
      if (res.action?.type === "handoff") toast.warning(`Conversa transferida para a equipe: ${res.action.reason ?? ""}`);
      setText("");
      await refreshAll(convId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function scenario(kind: "normal" | "audio" | "remarcar" | "cancelar" | "urgencia" | "repetir") {
    if (busy) return;
    try {
      setBusy(true);
      let pid = patientId;
      if ((kind === "remarcar" || kind === "cancelar") && patientWithAppointment) pid = patientWithAppointment;
      if (kind === "repetir") {
        const other = patients.data?.find((p) => p.id !== patientId);
        if (other) pid = other.id;
      }
      const convId = await newConversation(pid);
      setBusy(false);
      if (!convId) return;
      if (kind === "normal") await send({ text: "Olá, gostaria de agendar uma avaliação", kind: "text" }, convId);
      if (kind === "audio") await send({ text: AUDIO_SAMPLES[0]!.text, kind: "audio", audioLabel: AUDIO_SAMPLES[0]!.label }, convId);
      if (kind === "remarcar") await send({ text: "Preciso remarcar minha consulta", kind: "text" }, convId);
      if (kind === "cancelar") await send({ text: "Quero cancelar minha consulta", kind: "text" }, convId);
      if (kind === "urgencia") await send({ text: "Estou com uma dor muito forte no dente e o rosto está inchado", kind: "text" }, convId);
      if (kind === "repetir" && lastBooked) {
        const svc = services.data?.find((s) => s.id === lastBooked.serviceId)?.name ?? "avaliação";
        const proName = pros.data?.find((p) => p.id === lastBooked.professionalId)?.name;
        const d = businessDate(new Date(lastBooked.start), tz);
        const [, m, day] = d.split("-");
        await send({ text: `Quero agendar ${svc.toLowerCase()}${proName ? ` com ${proName}` : ""} no dia ${day}/${m} às ${formatTime(lastBooked.start, tz)}`, kind: "text" }, convId);
      }
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send({ text, kind: "text" });
  }

  if (clinic.error) return <ErrorState error={clinic.error} onRetry={() => clinic.refetch()} />;
  const st = conversation ? CONVERSATION_STATUS[conversation.status] : null;

  return (
    <div>
      <PageHeader
        title="Simulador do agente"
        description="Converse como se fosse o paciente. O WhatsApp e a transcrição de áudio são simulados; a agenda e as reservas são reais nesta clínica de demonstração."
      />
      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Paciente fictício</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-patient">Quem está escrevendo</Label>
                <Select value={patientId} onValueChange={(v) => { setPatientId(v); setConversationId(null); setLast(null); }}>
                  <SelectTrigger id="sim-patient">
                    <SelectValue placeholder={patients.isLoading ? "Carregando..." : "Escolha"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(patients.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => newConversation()} disabled={busy || !patientId}>
                  <RefreshCcw aria-hidden /> Nova conversa
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setContactOpen(true)}>
                  <Plus aria-hidden /> Contato
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
                <Label htmlFor="sim-ai" className="text-sm">
                  Redação com IA
                  <span className="block text-xs font-normal text-muted-foreground">Só para respostas livres; horários nunca</span>
                </Label>
                <Switch id="sim-ai" checked={useAi} onCheckedChange={setUseAi} />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cenários rápidos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="soft" className="justify-start" onClick={() => scenario("normal")} disabled={busy}>
                <CalendarCheck2 aria-hidden /> Agendamento normal
              </Button>
              <Button variant="soft" className="justify-start" onClick={() => scenario("audio")} disabled={busy}>
                <Mic aria-hidden /> Áudio de exemplo
              </Button>
              <Button variant="soft" className="justify-start" onClick={() => scenario("remarcar")} disabled={busy}>
                <Repeat2 aria-hidden /> Remarcar
              </Button>
              <Button variant="soft" className="justify-start" onClick={() => scenario("cancelar")} disabled={busy}>
                <CalendarX2 aria-hidden /> Cancelamento
              </Button>
              <Button variant="soft" className="justify-start text-destructive" onClick={() => scenario("urgencia")} disabled={busy}>
                <AlertTriangle aria-hidden /> Dor intensa
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => scenario("repetir")} disabled={busy || !lastBooked} title={lastBooked ? undefined : "Agende um horário primeiro"}>
                <CalendarX2 aria-hidden /> Tentar o mesmo horário
              </Button>
              <p className="text-xs text-muted-foreground">
                {lastBooked ? `Último horário reservado: ${lastBooked.label}. Outro paciente tentará o mesmo.` : "Depois de agendar, teste outro paciente pedindo o mesmo horário."}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-[70vh] flex-col overflow-hidden shadow-float">
          <div className="flex items-center gap-3 border-b bg-sidebar px-4 py-3 text-sidebar-accent-foreground">
            <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent">
              <UserRound className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{patient?.name ?? "Paciente fictício"}</p>
              <p className="text-xs text-sidebar-foreground">WhatsApp simulado · não conectado</p>
            </div>
            {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
          </div>
          <div className="flex-1 overflow-y-auto bg-chat p-4" style={{ maxHeight: "62vh" }}>
            {!conversationId ? (
              <EmptyState
                title="Comece uma conversa"
                description="Escolha um cenário rápido ou escreva uma mensagem abaixo, por exemplo: quero marcar uma limpeza amanhã à tarde."
              />
            ) : messages.error ? (
              <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
            ) : (
              <ChatMessages
                messages={messages.data ?? []}
                timezone={tz}
                onOption={(v) => void send({ text: v, kind: "text" })}
                disabled={busy || conversation?.status === "pending_human" || conversation?.status === "human"}
                pendingText={pending}
              />
            )}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t bg-card p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Enviar áudio de exemplo" disabled={busy}>
                  <Mic aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {AUDIO_SAMPLES.map((a) => (
                  <DropdownMenuItem key={a.title} onSelect={() => void send({ text: a.text, kind: "audio", audioLabel: a.label })}>
                    {a.title} <span className="ml-2 text-xs text-muted-foreground">{a.label.replace("Áudio de exemplo · ", "")}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <label htmlFor="sim-text" className="sr-only">
              Mensagem do paciente
            </label>
            <Input id="sim-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva como paciente..." maxLength={1000} disabled={busy} autoComplete="off" />
            <Button type="submit" disabled={busy} aria-label="Enviar mensagem">
              {busy ? <Spinner /> : <Send aria-hidden />}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Decisão do agente</CardTitle>
            </CardHeader>
            <CardContent>
              {!last ? (
                <p className="text-sm text-muted-foreground">Envie uma mensagem para ver a intenção identificada, a etapa e a ação executada.</p>
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Intenção</dt>
                    <dd className="font-semibold">{last.intentLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Etapa</dt>
                    <dd className="font-semibold">{last.status === "pending_human" ? STEP_LABELS["handoff"] : STEP_LABELS[last.step] ?? last.step}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Última ação</dt>
                    <dd>{last.lastAction ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Redação</dt>
                    <dd>{last.aiUsed ? "Com IA (texto livre revisado)" : "Mensagem padrão do sistema"}</dd>
                  </div>
                  {last.action && last.action.type !== "handoff" ? (
                    <Button asChild variant="success" size="sm" className="w-full">
                      <Link to="/agenda">Ver na agenda</Link>
                    </Button>
                  ) : null}
                  {last.status === "pending_human" ? (
                    <Button asChild variant="warning" size="sm" className="w-full">
                      <Link to="/conversas" search={conversationId ? { id: conversationId } : {}}>
                        Abrir na fila da equipe
                      </Link>
                    </Button>
                  ) : null}
                </dl>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="size-4" aria-hidden /> O que é simulado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>WhatsApp: as mensagens ficam só neste painel. Nada é enviado ao celular.</p>
              <p>Áudio: usa gravações de exemplo com transcrição pronta. A transcrição real não está conectada.</p>
              <p>Agenda: real nesta clínica de demonstração, validada no servidor.</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <NewContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        clinicId={c?.id}
        onCreated={async (id) => {
          await qc.invalidateQueries({ queryKey: ["patients"] });
          setPatientId(id);
          setConversationId(null);
        }}
      />
    </div>
  );
}

function NewContactDialog({ open, onOpenChange, clinicId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; clinicId?: string | undefined; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("(11) 9");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 3) next["name"] = "Informe o nome (mínimo 3 letras)";
    if (phone.replace(/\D/g, "").length < 10) next["phone"] = "Informe um telefone de teste com DDD";
    setErrors(next);
    if (Object.keys(next).length || !clinicId) return;
    setBusy(true);
    const { data, error } = await supabase.from("patients").insert({ clinic_id: clinicId, name: name.trim(), phone: phone.trim(), notes: "Contato de teste criado no simulador" }).select("id").single();
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe um paciente com esse telefone." : errorMessage(error));
      return;
    }
    toast.success("Contato de teste criado.");
    onOpenChange(false);
    setName("");
    await onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato de teste</DialogTitle>
          <DialogDescription>Use nome e telefone fictícios. Não cadastre dados reais.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="nc-name">Nome</Label>
            <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors["name"]} />
            {errors["name"] ? <p className="text-sm text-destructive">{errors["name"]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-phone">Telefone de teste</Label>
            <Input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors["phone"]} />
            {errors["phone"] ? <p className="text-sm text-destructive">{errors["phone"]}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Criar contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
