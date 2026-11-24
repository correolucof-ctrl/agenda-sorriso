import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Spinner } from "@/components/app/States";
import { useClinic, usePatients, useReminders } from "@/hooks/use-clinic";
import { formatDateTime } from "@/lib/time";
import { errorMessage, REMINDER_STATUS } from "@/lib/ui-maps";

export const Route = createFileRoute("/_authenticated/lembretes")({
  head: () => ({
    meta: [
      { title: "Lembretes | Agenda Sorriso" },
      { name: "description", content: "Fila de lembretes de consulta com envio simulado." },
      { property: "og:title", content: "Lembretes | Agenda Sorriso" },
      { property: "og:description", content: "Fila de lembretes de consulta com envio simulado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemindersPage,
});

function RemindersPage() {
  const qc = useQueryClient();
  const clinic = useClinic();
  const c = clinic.data;
  const reminders = useReminders(c?.id);
  const patients = usePatients(c?.id);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const tz = c?.timezone ?? "America/Sao_Paulo";

  const list = useMemo(() => (reminders.data ?? []).filter((r) => filter === "all" || r.status === filter), [reminders.data, filter]);
  const due = (reminders.data ?? []).filter((r) => r.status === "pending" && new Date(r.scheduled_for).getTime() <= Date.now());

  async function update(ids: string[], status: "sent" | "failed" | "pending", key: string) {
    if (!ids.length) return;
    setBusy(key);
    const { error } = await supabase
      .from("reminders")
      .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null })
      .in("id", ids);
    setBusy(null);
    if (error) return void toast.error(errorMessage(error));
    toast.success(status === "sent" ? `${ids.length} lembrete(s) marcado(s) como enviado(s) (simulado).` : status === "failed" ? "Falha simulada registrada." : "Lembrete recolocado na fila.");
    qc.invalidateQueries({ queryKey: ["reminders"] });
  }

  if (clinic.error || reminders.error) return <ErrorState error={clinic.error ?? reminders.error} onRetry={() => reminders.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Lembretes"
        description={`Cada consulta gera um lembrete ${c?.reminder_hours_before ?? 24} horas antes. O envio é simulado: nenhuma mensagem real sai pelo WhatsApp.`}
        actions={
          <Button onClick={() => update(due.map((r) => r.id), "sent", "queue")} disabled={!!busy || due.length === 0}>
            {busy === "queue" ? <Spinner /> : <PlayCircle aria-hidden />} Processar fila agora ({due.length})
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="pending">Na fila</TabsTrigger>
          <TabsTrigger value="sent">Enviados</TabsTrigger>
          <TabsTrigger value="failed">Com falha</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      {reminders.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhum lembrete aqui" description="Lembretes aparecem automaticamente quando uma consulta é criada." />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <ul className="divide-y">
            {list.map((r) => {
              const st = REMINDER_STATUS[r.status];
              const appt = r.appointments as { starts_at: string; patient_id: string } | null;
              const name = patients.data?.find((p) => p.id === appt?.patient_id)?.name ?? "Paciente";
              const isDue = r.status === "pending" && new Date(r.scheduled_for).getTime() <= Date.now();
              return (
                <li key={r.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{name}</p>
                      {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
                      {isDue ? <Badge variant="warning">Pronto para envio</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Envio previsto: {formatDateTime(r.scheduled_for, tz)}
                      {appt ? ` · consulta ${formatDateTime(appt.starts_at, tz)}` : ""}
                      {r.sent_at ? ` · enviado ${formatDateTime(r.sent_at, tz)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "pending" || r.status === "failed" ? (
                      <Button size="sm" variant="outline" onClick={() => update([r.id], "sent", r.id)} disabled={!!busy}>
                        <Send aria-hidden /> Simular envio
                      </Button>
                    ) : null}
                    {r.status === "pending" ? (
                      <Button size="sm" variant="ghost" onClick={() => update([r.id], "failed", `${r.id}f`)} disabled={!!busy}>
                        <TriangleAlert aria-hidden /> Simular falha
                      </Button>
                    ) : null}
                    {r.status === "failed" || r.status === "sent" ? (
                      <Button size="sm" variant="ghost" onClick={() => update([r.id], "pending", `${r.id}p`)} disabled={!!busy}>
                        Recolocar na fila
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
