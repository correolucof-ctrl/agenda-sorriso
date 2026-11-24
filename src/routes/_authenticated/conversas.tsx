import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, CheckCircle2, Hand, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatMessages } from "@/components/app/ChatMessages";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Spinner } from "@/components/app/States";
import { useClinic, useConversations, useMessages, type Conversation } from "@/hooks/use-clinic";
import { formatDateTime } from "@/lib/time";
import { CONVERSATION_STATUS, errorMessage, INTENT_BADGE } from "@/lib/ui-maps";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/conversas")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => {
    const out: { id?: string } = {};
    if (typeof search["id"] === "string") out.id = search["id"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Conversas | Agenda Sorriso" },
      { name: "description", content: "Histórico de atendimentos do agente e pendências para a equipe." },
      { property: "og:title", content: "Conversas | Agenda Sorriso" },
      { property: "og:description", content: "Histórico de atendimentos do agente e pendências para a equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationsPage,
});

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "pending_human", label: "Aguardando equipe" },
  { value: "human", label: "Com a equipe" },
  { value: "bot", label: "Com o agente" },
  { value: "closed", label: "Encerradas" },
];

function ConversationsPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate({ from: "/conversas" });
  const clinic = useClinic();
  const convs = useConversations(clinic.data?.id);
  const [filter, setFilter] = useState("all");
  const tz = clinic.data?.timezone ?? "America/Sao_Paulo";

  const list = useMemo(() => {
    const all = convs.data ?? [];
    const filtered = filter === "all" ? all : all.filter((c) => c.status === filter);
    return [...filtered].sort((a, b) => Number(b.status === "pending_human") - Number(a.status === "pending_human") || b.last_message_at.localeCompare(a.last_message_at));
  }, [convs.data, filter]);
  const selected = convs.data?.find((c) => c.id === id) ?? null;

  if (clinic.error || convs.error) return <ErrorState error={clinic.error ?? convs.error} onRetry={() => convs.refetch()} />;

  return (
    <div>
      <PageHeader title="Conversas" description="Todas as conversas do canal simulado. A equipe assume quando há urgência, pedido de atendente ou baixa confiança do agente." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className={cn("overflow-hidden shadow-card", selected && "hidden lg:block")}>
          <div className="border-b p-3">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                {FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value} className="text-xs">
                    {f.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {convs.isLoading ? (
              <LoadingRows rows={5} />
            ) : list.length === 0 ? (
              <EmptyState title="Nenhuma conversa neste filtro" className="m-2" />
            ) : (
              <ul className="space-y-1">
                {list.map((c) => (
                  <li key={c.id}>
                    <ConversationItem c={c} tz={tz} active={c.id === id} onSelect={() => navigate({ search: { id: c.id } })} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? (
            <ConversationDetail conversation={selected} tz={tz} onBack={() => navigate({ search: {} })} />
          ) : (
            <EmptyState title="Selecione uma conversa" description="Escolha uma conversa da lista para ver o histórico e assumir o atendimento." className="h-full min-h-80" />
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationItem({ c, tz, active, onSelect }: { c: Conversation; tz: string; active: boolean; onSelect: () => void }) {
  const st = CONVERSATION_STATUS[c.status];
  const intent = c.last_intent ? INTENT_BADGE[c.last_intent] : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary-soft" : "hover:bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">{c.contact_name}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.last_message_at, tz)}</span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{c.last_message_preview}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {c.is_urgent ? <Badge variant="danger">Urgência</Badge> : null}
        {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
        {intent ? <Badge variant="outline">{intent.label}</Badge> : null}
      </div>
    </button>
  );
}

function ConversationDetail({ conversation: c, tz, onBack }: { conversation: Conversation; tz: string; onBack: () => void }) {
  const qc = useQueryClient();
  const messages = useMessages(c.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const st = CONVERSATION_STATUS[c.status];

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["conversations"] }), qc.invalidateQueries({ queryKey: ["messages", c.id] })]);
  }

  async function setStatus(status: Conversation["status"], note: string, key: string) {
    setBusy(key);
    try {
      const patch: Partial<Conversation> = { status, last_message_at: new Date().toISOString() };
      if (status === "bot") patch.state = {};
      const u = await supabase.from("conversations").update(patch).eq("id", c.id);
      if (u.error) throw u.error;
      const m = await supabase.from("messages").insert({ clinic_id: c.clinic_id, conversation_id: c.id, sender: "system", content: note });
      if (m.error) throw m.error;
      await refresh();
      toast.success(note);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendHuman(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) {
      toast.error("Digite uma mensagem");
      return;
    }
    setBusy("send");
    try {
      const m = await supabase.from("messages").insert({ clinic_id: c.clinic_id, conversation_id: c.id, sender: "human", content });
      if (m.error) throw m.error;
      await supabase.from("conversations").update({ last_message_preview: content.slice(0, 140), last_message_at: new Date().toISOString() }).eq("id", c.id);
      setText("");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex h-full min-h-[70vh] flex-col overflow-hidden shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Voltar para a lista">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold">{c.contact_name}</p>
          <p className="text-xs text-muted-foreground">
            {c.contact_phone} · canal {c.channel === "simulador" ? "WhatsApp simulado" : c.channel === "whatsapp" ? "WhatsApp (número de teste)" : c.channel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
          {c.status === "bot" || c.status === "pending_human" ? (
            <Button size="sm" variant="warning" onClick={() => setStatus("human", "Atendimento assumido pela equipe.", "take")} disabled={!!busy}>
              {busy === "take" ? <Spinner /> : <Hand aria-hidden />} Assumir atendimento
            </Button>
          ) : null}
          {c.status === "human" || c.status === "pending_human" ? (
            <Button size="sm" variant="outline" onClick={() => setStatus("bot", "Conversa devolvida ao agente.", "bot")} disabled={!!busy}>
              <Bot aria-hidden /> Devolver ao agente
            </Button>
          ) : null}
          {c.status !== "closed" ? (
            <Button size="sm" variant="ghost" onClick={() => setStatus("closed", "Conversa encerrada.", "close")} disabled={!!busy}>
              <CheckCircle2 aria-hidden /> Encerrar
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-chat p-4">
        {messages.isLoading ? (
          <LoadingRows rows={4} />
        ) : messages.error ? (
          <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
        ) : (messages.data ?? []).length === 0 ? (
          <EmptyState title="Sem mensagens" />
        ) : (
          <ChatMessages messages={messages.data ?? []} timezone={tz} />
        )}
      </div>
      <form onSubmit={sendHuman} className="flex gap-2 border-t p-3">
        <label htmlFor="human-reply" className="sr-only">
          Resposta da equipe
        </label>
        <Input
          id="human-reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            c.status !== "human"
              ? "Assuma o atendimento para responder"
              : c.channel === "whatsapp"
                ? "Anotação da equipe (fica só no painel, não vai ao WhatsApp)"
                : "Responder como equipe (envio simulado)"
          }
          disabled={c.status !== "human" || !!busy}
          maxLength={1000}
        />
        <Button type="submit" disabled={c.status !== "human" || !!busy}>
          {busy === "send" ? <Spinner /> : <Send aria-hidden />} Enviar
        </Button>
      </form>
    </Card>
  );
}
