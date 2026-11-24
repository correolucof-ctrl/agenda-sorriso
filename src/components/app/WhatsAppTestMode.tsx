import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingRows, Spinner } from "@/components/app/States";
import { addAllowedNumber, getWhatsAppOverview, processPendingWhatsApp, removeAllowedNumber } from "@/lib/whatsapp.functions";
import { formatWhatsAppDigits } from "@/lib/whatsapp-phone";
import { errorMessage } from "@/lib/ui-maps";

export function WhatsAppTestMode() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getWhatsAppOverview);
  const addFn = useServerFn(addAllowedNumber);
  const removeFn = useServerFn(removeAllowedNumber);
  const processFn = useServerFn(processPendingWhatsApp);
  const q = useQuery({ queryKey: ["whatsapp-overview"], queryFn: () => overviewFn() });
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["whatsapp-overview"] });

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      await addFn({ data: { phone, label } });
      toast.success("Número de teste autorizado.");
      setPhone("");
      setLabel("");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(id: string) {
    setBusy(id);
    try {
      await removeFn({ data: { id } });
      toast.success("Número removido. Ele não aciona mais o agente.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onProcess() {
    setBusy("process");
    try {
      const r = await processFn();
      toast.success(`Pendências verificadas: ${r.done} concluída(s), ${r.pending} ainda pendente(s).`);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> WhatsApp em modo de teste restrito
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Só os números desta lista acionam o agente e recebem respostas. Mensagens de qualquer outro número são descartadas antes de
              serem gravadas, sem resposta. Histórico de conversas não é importado e lembretes não são enviados pelo WhatsApp.
            </CardDescription>
          </div>
          {q.data ? (
            <Badge variant={q.data.linked ? "success" : "muted"}>{q.data.linked ? "Conexão vinculada · modo de teste" : "Não conectado"}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {q.isLoading ? <LoadingRows rows={2} /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {q.data && !q.data.isAdmin ? (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-muted-foreground">
            <Lock className="size-4" aria-hidden /> Somente o administrador pode ver e editar a lista de números autorizados.
          </p>
        ) : null}
        {q.data?.isAdmin ? (
          <>
            {!q.data.linked ? (
              <p className="rounded-md bg-muted px-3 py-2.5 text-muted-foreground">
                A conexão do WhatsApp ainda não está vinculada a este projeto: nenhuma mensagem real chega nem sai enquanto isso.
              </p>
            ) : null}
            {q.data.sendingPaused ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-foreground">
                Envio pausado{q.data.pausedReason ? `: ${q.data.pausedReason}` : ""}. Reconecte o WhatsApp nas conexões do Lovable.
              </p>
            ) : null}

            <div>
              <p className="mb-2 font-medium">Números autorizados ({q.data.numbers.length})</p>
              {q.data.numbers.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-3 text-muted-foreground">
                  Lista vazia: nenhum número aciona o agente. Adicione apenas celulares de teste.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {q.data.numbers.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{n.label}</p>
                        <p className="text-xs text-muted-foreground">{formatWhatsAppDigits(n.phone_digits)}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onRemove(n.id)} disabled={!!busy} aria-label={`Remover ${n.label}`}>
                        {busy === n.id ? <Spinner /> : <Trash2 aria-hidden />} Remover
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="wa-phone">Número de teste (com DDD)</Label>
                <Input id="wa-phone" inputMode="tel" placeholder="(62) 90000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={25} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-label">Nome de quem vai testar</Label>
                <Input id="wa-label" placeholder="Maria (teste)" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
              </div>
              <Button type="submit" disabled={!!busy}>
                {busy === "add" ? <Spinner /> : <Plus aria-hidden />} Autorizar
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <span>
                Entregas pendentes: {q.data.pendingDeliveries} · Para revisar: {q.data.needsReview} · Respostas com problema: {q.data.problemReplies}
              </span>
              <Button size="sm" variant="outline" onClick={onProcess} disabled={!!busy || !q.data.linked}>
                {busy === "process" ? <Spinner /> : <RefreshCw aria-hidden />} Processar pendentes
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
