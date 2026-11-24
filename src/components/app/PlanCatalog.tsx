import { useState } from "react";
import { Check, Coins, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMERCIAL_PLANS, CREDIT_PACKS, CREDIT_RULES, annualSavings, formatBRL, priceFor, type BillingPeriod } from "@/lib/commercial-plans";

type PlanId = typeof COMMERCIAL_PLANS[number]["id"];

export function PlanCatalog({ approvedPlan, onCheckout, onBuyPack, busy }: {
  approvedPlan?: PlanId | null;
  onCheckout?: ((plan: PlanId, period: BillingPeriod) => void) | undefined;
  onBuyPack?: ((credits: 100 | 500 | 1000) => void) | undefined;
  busy?: boolean;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  return (
    <div className="space-y-8">
      <section aria-labelledby="plans-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="plans-title" className="text-2xl font-bold">Planos para sua clínica</h2>
            <p className="mt-2 text-sm text-muted-foreground">Todos os benefícios. Escolha pela quantidade de créditos incluídos.</p>
          </div>
          <Tabs value={period} onValueChange={(value) => { if (value === "monthly" || value === "annual") setPeriod(value); }}>
            <TabsList aria-label="Período de cobrança"><TabsTrigger value="monthly">Mensal</TabsTrigger><TabsTrigger value="annual">Anual · 2 meses grátis</TabsTrigger></TabsList>
          </Tabs>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COMMERCIAL_PLANS.map((plan) => (
            <article key={plan.id} className="flex min-w-0 flex-col rounded-lg border bg-card p-5">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-4 text-3xl font-bold">{formatBRL(priceFor(plan, period))}</p>
              <p className="mt-1 text-sm text-muted-foreground">{period === "annual" ? "por ano · pagamento único por 12 meses" : "por mês"}</p>
              <div className="mt-3 min-h-8">{period === "annual" ? <Badge variant="success">Economize {formatBRL(annualSavings(plan))} por ano</Badge> : <span className="text-sm text-muted-foreground">Assinatura mensal</span>}</div>
              <div className="mt-5 border-t pt-5">
                <p className="text-xl font-semibold">{plan.monthlyCredits.toLocaleString("pt-BR")} créditos/mês</p>
                <ul className="mt-4 space-y-3 text-sm">
                  {["Agente, agenda, pacientes e conversas", "Todos os recursos do software", "Créditos adicionais disponíveis"].map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /><span>{item}</span></li>)}
                </ul>
              </div>
              <Button disabled={!onCheckout || approvedPlan !== plan.id || busy} onClick={() => onCheckout?.(plan.id, period)} variant="outline" className="mt-6 w-full">
                {approvedPlan === plan.id && onCheckout ? "Contratar na Stripe" : <><LockKeyhole aria-hidden /> Aguarde aprovação</>}
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No anual, a franquia continua mensal: não são liberados todos os créditos do ano de uma vez. A clínica precisa de aprovação antes da contratação.</p>
      </section>

      <section aria-labelledby="credits-title" className="border-t pt-6">
        <h2 id="credits-title" className="flex items-center gap-2 text-xl font-semibold"><Coins className="size-5 text-primary" aria-hidden /> Créditos adicionais</h2>
        <p className="mt-2 text-sm text-muted-foreground">Amplie o uso sem trocar de plano. Pagamento avulso, sem alterar sua assinatura.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => <article key={pack.credits} className="rounded-lg border bg-card p-5"><h3 className="text-lg font-semibold">{pack.credits.toLocaleString("pt-BR")} créditos</h3><p className="mt-3 text-2xl font-bold">{formatBRL(pack.priceCents)}</p><p className="mt-2 text-sm text-muted-foreground">{formatBRL(pack.priceCents / pack.credits)} por crédito</p><Button disabled={!onBuyPack || busy} onClick={() => onBuyPack?.(pack.credits)} variant="outline" className="mt-4 w-full">{onBuyPack ? "Comprar na Stripe" : <><LockKeyhole aria-hidden /> Assinatura ativa necessária</>}</Button></article>)}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Os créditos adicionais ficam na conta enquanto a assinatura estiver ativa.</p>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-lg font-semibold">Referência de consumo</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="font-medium">Mensagem atendida pelo agente</dt><dd className="mt-1 text-sm text-muted-foreground">{CREDIT_RULES.processedMessage} crédito por mensagem processada.</dd></div>
          <div><dt className="font-medium">Transcrição de áudio</dt><dd className="mt-1 text-sm text-muted-foreground">{CREDIT_RULES.audioTranscription} créditos por áudio, além do processamento da mensagem.</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">O saldo aparece em Conta e contratação. Sem créditos disponíveis, a conversa vai para atendimento humano.</p>
      </section>
    </div>
  );
}
