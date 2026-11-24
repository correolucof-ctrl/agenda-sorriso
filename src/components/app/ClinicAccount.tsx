import { useEffect, useState, type FormEvent } from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/app/States";
import { clinicRegistrationSchema, type ClinicRegistrationInput } from "@/lib/clinic-registration";
import { clinicRegistrationOptions } from "@/lib/clinic-registration-query";
import { saveClinicRegistration } from "@/lib/clinic-registration.functions";
import { PlanCatalog } from "@/components/app/PlanCatalog";
import { getBillingSummary, openBillingPortal, startCheckout, startCreditPackCheckout } from "@/lib/billing.functions";
import type { BillingPeriod } from "@/lib/commercial-plans";

type PlanId = "essencial" | "crescimento" | "profissional";
type BillingSummary = Awaited<ReturnType<typeof getBillingSummary>>;

export function ClinicAccount() {
  const { data } = useSuspenseQuery(clinicRegistrationOptions());
  const queryClient = useQueryClient();
  const save = useServerFn(saveClinicRegistration);
  const loadBilling = useServerFn(getBillingSummary);
  const checkout = useServerFn(startCheckout);
  const billingPortal = useServerFn(openBillingPortal);
  const packCheckout = useServerFn(startCreditPackCheckout);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { portal } = useRouteContext({ from: "/_authenticated" });

  useEffect(() => {
    if (!portal || portal.isAdmin) return;
    loadBilling().then(setBilling).catch(() => setBilling(null));
  }, [loadBilling, portal]);

  async function beginCheckout(plan: PlanId, period: BillingPeriod) {
    setBillingBusy(true);
    try {
      const result = await checkout({ data: { plan, period } });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a contratação.");
      setBillingBusy(false);
    }
  }

  async function manageBilling() {
    setBillingBusy(true);
    try {
      const result = await billingPortal();
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a assinatura.");
      setBillingBusy(false);
    }
  }

  async function buyPack(credits: 100 | 500 | 1000) {
    setBillingBusy(true);
    try { const result = await packCheckout({ data: { credits } }); window.location.assign(result.url); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível abrir o pagamento."); setBillingBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = clinicRegistrationSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = await save({ data: parsed.data });
      queryClient.setQueryData(clinicRegistrationOptions().queryKey, saved);
      toast.success("Cadastro da clínica salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  const fields: { name: keyof ClinicRegistrationInput; label: string; type: string; autoComplete: string }[] = [
    { name: "clinic_name", label: "Nome da clínica", type: "text", autoComplete: "organization" },
    { name: "responsible_name", label: "Responsável pela contratação", type: "text", autoComplete: "name" },
    { name: "contact_email", label: "E-mail de contato", type: "email", autoComplete: "email" },
    { name: "contact_phone", label: "Telefone com código do país", type: "tel", autoComplete: "tel" },
  ];

  return (
    <div className="space-y-8">
      <section className="border-b pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Building2 className="size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Cadastro da clínica</h2>
          {data ? <Badge variant="success"><Check className="size-3" aria-hidden /> Cadastro preenchido</Badge> : <Badge variant="muted">Pendente</Badge>}
        </div>
        <form key={data?.updated_at ?? "new"} onSubmit={submit} noValidate className="mt-5 grid max-w-3xl gap-5 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className="min-w-0 space-y-2">
              <Label htmlFor={`account-${field.name}`}>{field.label}</Label>
              <Input id={`account-${field.name}`} name={field.name} type={field.type} autoComplete={field.autoComplete} defaultValue={data?.[field.name] ?? ""} maxLength={field.name === "contact_email" ? 254 : 120} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `error-${field.name}` : undefined} />
              {errors[field.name] ? <p id={`error-${field.name}`} className="text-sm text-destructive">{errors[field.name]}</p> : null}
              {field.name === "contact_phone" ? <p className="text-xs text-muted-foreground">Formato internacional: +5562999990000</p> : null}
            </div>
          ))}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : <Save aria-hidden />} Salvar cadastro</Button></div>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">{portal ? "O acesso à agenda é liberado após análise do cadastro." : "Este cadastro não substitui os dados da agenda de demonstração e não inicia uma cobrança."}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contratação</h2>
        <dl className="grid max-w-3xl gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">Acesso atual</dt><dd className="mt-1 font-medium">{portal ? accessLabel(portal.status, Boolean(data)) : "Demonstração"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Plano aprovado</dt><dd className="mt-1 font-medium">{billing?.access?.plan ?? "Nenhum"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Assinatura</dt><dd className="mt-1"><Badge variant={billing?.subscription?.status === "active" ? "success" : "muted"}>{billing?.subscription?.status ?? "Não contratada"}</Badge></dd></div>
        </dl>
        {billing?.wallet && <p className="text-sm text-muted-foreground">Créditos disponíveis: <strong className="text-foreground">{(billing.wallet.included_remaining + billing.wallet.extra_remaining).toLocaleString("pt-BR")}</strong> ({billing.wallet.included_remaining.toLocaleString("pt-BR")} do plano e {billing.wallet.extra_remaining.toLocaleString("pt-BR")} adicionais).</p>}
        {billing?.subscription?.stripe_customer_id && <Button type="button" variant="outline" disabled={billingBusy} onClick={manageBilling}>Gerenciar assinatura</Button>}
        {portal?.status === "awaiting_payment" && <p className="max-w-3xl text-sm text-muted-foreground">Sua clínica foi aprovada. Contrate o plano selecionado para liberar a agenda.</p>}
      </section>
      <PlanCatalog approvedPlan={billing?.access?.status === "approved" && billing.access.payment_required ? billing.access.plan as PlanId : null} onCheckout={portal?.status === "awaiting_payment" ? beginCheckout : undefined}
        onBuyPack={portal?.status === "active" && billing?.subscription?.status === "active" ? buyPack : undefined} busy={billingBusy} />
      {(!portal || portal.status === "active") && <section className="border-t pt-6">
        <h2 className="text-lg font-semibold">Configuração do atendimento</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline"><Link to="/configuracoes">Horários, profissionais e serviços</Link></Button>
          {!portal && <Button asChild><Link to="/simulador">Testar o agente</Link></Button>}
        </div>
      </section>}
    </div>
  );
}

function accessLabel(status: string, submitted: boolean) {
  switch (status) {
    case "active": return "Ativo";
    case "expired": return "Vencido";
    case "awaiting_payment": return "Aguardando pagamento";
    case "suspended": return "Suspenso";
    case "rejected": return "Cadastro rejeitado";
    case "legacy": return "Conta antiga de demonstração";
    case "pending": return "Aguardando aprovação";
    default: return submitted ? "Aguardando aprovação" : "Cadastro pendente";
  }
}
