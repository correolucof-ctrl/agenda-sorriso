import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Bot, CalendarCheck2, Clock, MessageSquareText, UserRoundCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/app/States";
import { useAppointments, useClinic, useConversations, usePatients, useProfessionals, useReminders, useServices } from "@/hooks/use-clinic";
import { addDays, businessDate, formatDateShort, formatSlotLabel, formatTime, zonedToUtc } from "@/lib/time";
import { APPOINTMENT_STATUS, CONVERSATION_STATUS, INTENT_BADGE, proColor } from "@/lib/ui-maps";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel | Agenda Sorriso" },
      { name: "description", content: "Atendimentos, agendamentos e pendências da clínica de demonstração." },
      { property: "og:title", content: "Painel | Agenda Sorriso" },
      { property: "og:description", content: "Atendimentos, agendamentos e pendências da clínica de demonstração." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Clock; label: string; value: string | number; hint?: string; tone?: "warning" | "success" | undefined }) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-start gap-4 p-5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            tone === "warning" ? "bg-warning-soft text-warning-foreground" : tone === "success" ? "bg-success-soft text-success" : "bg-primary-soft text-primary",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold text-foreground">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const clinic = useClinic();
  const c = clinic.data;
  const tz = c?.timezone ?? "America/Sao_Paulo";
  const today = businessDate(new Date(), tz);
  const from = zonedToUtc(today, 0, tz).toISOString();
  const to = zonedToUtc(addDays(today, 7), 0, tz).toISOString();
  const todayEnd = zonedToUtc(addDays(today, 1), 0, tz).getTime();
  const appts = useAppointments(c?.id, from, to);
  const convs = useConversations(c?.id);
  const pros = useProfessionals(c?.id);
  const services = useServices(c?.id);
  const patients = usePatients(c?.id);
  const reminders = useReminders(c?.id);

  if (clinic.error) return <ErrorState error={clinic.error} onRetry={() => clinic.refetch()} />;
  const loading = clinic.isLoading || appts.isLoading || convs.isLoading;

  const active = (appts.data ?? []).filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const todayAppts = active.filter((a) => new Date(a.starts_at).getTime() < todayEnd);
  const nowMs = Date.now();
  const nextAppts = active.filter((a) => new Date(a.starts_at).getTime() >= nowMs).slice(0, 6);
  const conversations = convs.data ?? [];
  const todayConvs = conversations.filter((cv) => businessDate(new Date(cv.last_message_at), tz) === today);
  const pending = conversations.filter((cv) => cv.status === "pending_human");
  const week = conversations.filter((cv) => nowMs - new Date(cv.created_at).getTime() < 7 * 86_400_000);
  const automated = week.filter((cv) => cv.status === "bot" || cv.status === "closed").length;
  const automationRate = week.length ? Math.round((automated / week.length) * 100) : 0;
  const pendingReminders = (reminders.data ?? []).filter((r) => r.status === "pending").length;
  const agentBookings = active.filter((a) => a.source === "agent").length;

  const chart = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(today, i);
    return { day: formatDateShort(d), consultas: active.filter((a) => businessDate(new Date(a.starts_at), tz) === d).length };
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.name ?? "Paciente";
  const serviceName = (id: string) => services.data?.find((s) => s.id === id)?.name ?? "Consulta";
  const pro = (id: string) => pros.data?.find((p) => p.id === id);

  return (
    <div>
      <PageHeader
        title="Painel"
        description={c ? `${c.name} · visão de hoje, ${formatDateShort(today)}` : "Carregando..."}
        actions={c?.is_demo ? (
          <Button asChild>
            <Link to="/simulador">
              <Bot aria-hidden /> Abrir simulador
            </Link>
          </Button>
        ) : null}
      />
      {loading ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={MessageSquareText} label="Atendimentos hoje" value={todayConvs.length} hint="Conversas com mensagens hoje" />
            <Kpi icon={CalendarCheck2} label="Consultas hoje" value={todayAppts.length} hint={`${active.length} nos próximos 7 dias`} />
            <Kpi icon={AlertTriangle} label="Pendências humanas" value={pending.length} hint="Aguardando a equipe" tone={pending.length ? "warning" : undefined} />
            <Kpi icon={UserRoundCheck} label="Resolvidas pelo agente" value={`${automationRate}%`} hint={`${agentBookings} consultas marcadas pelo agente · ${pendingReminders} lembretes na fila`} tone="success" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Próximos horários</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/agenda">
                    Ver agenda <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {nextAppts.length === 0 ? (
                  <EmptyState title="Nenhuma consulta futura" description="Use a agenda para criar uma consulta." />
                ) : (
                  <ul className="divide-y">
                    {nextAppts.map((a) => {
                      const p = pro(a.professional_id);
                      const st = APPOINTMENT_STATUS[a.status];
                      return (
                        <li key={a.id} className="flex items-center gap-3 py-3">
                          <span className={cn("h-10 w-1 rounded-full", proColor(p?.color).solid)} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{patientName(a.patient_id)}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {serviceName(a.service_id)} · {p?.name ?? "Profissional"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatSlotLabel(a.starts_at, tz)}</p>
                            <div className="mt-1 flex justify-end gap-1">
                              {a.source === "agent" ? <Badge variant="secondary">Agente</Badge> : null}
                              {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Pendências humanas</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/conversas">
                    Conversas <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {pending.length === 0 ? (
                  <EmptyState title="Nenhuma pendência" description="O agente está resolvendo todos os atendimentos." />
                ) : (
                  <ul className="space-y-2">
                    {pending.map((cv) => (
                      <li key={cv.id}>
                        <Link
                          to="/conversas"
                          search={{ id: cv.id }}
                          className="block rounded-lg border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-medium">{cv.contact_name}</p>
                            {cv.is_urgent ? <Badge variant="danger">Urgência</Badge> : <Badge variant="warning">Aguardando</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{cv.last_message_preview}</p>
                          <p className="mt-1 text-xs text-muted-foreground">desde {formatTime(cv.last_message_at, tz)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Consultas nos próximos 7 dias</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
                    <Bar dataKey="consultas" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Atendimentos recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {conversations.length === 0 ? (
                  <EmptyState title="Nenhuma conversa ainda" description="As conversas da clínica serão exibidas aqui." />
                ) : (
                  <ul className="divide-y">
                    {conversations.slice(0, 6).map((cv) => {
                      const st = CONVERSATION_STATUS[cv.status];
                      const intent = cv.last_intent ? INTENT_BADGE[cv.last_intent] : null;
                      return (
                        <li key={cv.id}>
                          <Link to="/conversas" search={{ id: cv.id }} className="flex min-w-0 items-center gap-3 py-2.5 hover:bg-muted/50">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{cv.contact_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{cv.last_message_preview}</p>
                            </div>
                            {intent ? <Badge variant={intent.variant}>{intent.label}</Badge> : null}
                            {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
