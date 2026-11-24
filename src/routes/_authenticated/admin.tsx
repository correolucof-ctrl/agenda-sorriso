import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/States";
import { COMMERCIAL_PLANS } from "@/lib/commercial-plans";
import { decideCommercialAccess, linkClinicWhatsAppNumber, listClinicWhatsAppNumbers, listCommercialApplications, setClinicReminderTemplate, setClinicWhatsAppStatus } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async () => {
    if (import.meta.env["VITE_STANDALONE"] !== "true") throw redirect({ to: "/painel" });
    const applications = await listCommercialApplications();
    if (!applications) throw redirect({ to: "/painel" });
    const numbers = await listClinicWhatsAppNumbers();
    return { applications, numbers };
  },
  component: Administration,
});

const statusLabel = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  suspended: "Suspenso",
};

function Administration() {
  const { applications, numbers } = Route.useLoaderData();
  const decide = useServerFn(decideCommercialAccess);
  const linkNumber = useServerFn(linkClinicWhatsAppNumber);
  const setNumberStatus = useServerFn(setClinicWhatsAppStatus);
  const saveTemplate = useServerFn(setClinicReminderTemplate);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decideApplication(event: FormEvent<HTMLFormElement>, clinicId: string) {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if (action !== "approved" && action !== "rejected" && action !== "suspended") return;
    const form = new FormData(event.currentTarget);
    const plan = COMMERCIAL_PLANS.find(({ id }) => id === form.get("plan"));
    const date = form.get("expiration");
    const deadline = typeof date === "string" && date ? new Date(`${date}T23:59:59-03:00`) : null;
    if (action === "approved" && (!plan || !deadline || !(deadline.getTime() > Date.now()))) {
      toast.error("Informe um plano e um vencimento futuro.");
      return;
    }
    const expiration = deadline && Number.isFinite(deadline.getTime()) ? deadline.toISOString() : null;
    setBusy(true);
    try {
      await decide({ data: { target_clinic: clinicId, next_status: action, selected_plan: plan?.id ?? null, expiration } });
      await router.invalidate();
      toast.success("Decisão registrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a decisão.");
    } finally {
      setBusy(false);
    }
  }

  async function linkOfficialNumber(event: FormEvent<HTMLFormElement>, clinicId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const phoneId = String(values.get("phoneId") ?? "").trim();
    const accessToken = String(values.get("accessToken") ?? "").trim();
    setBusy(true);
    try {
      const result = await linkNumber({ data: { clinicId, phoneId, accessToken } });
      form.reset();
      await router.invalidate();
      toast.success(`Número ${result.displayPhone} vinculado. Ative após conferir a configuração.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível vincular o número."); }
    finally { setBusy(false); }
  }

  async function changeNumberStatus(clinicId: string, status: "active" | "paused") {
    setBusy(true);
    try {
      await setNumberStatus({ data: { clinicId, status } });
      await router.invalidate();
      toast.success(status === "active" ? "Número ativado." : "Número pausado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível mudar o número."); }
    finally { setBusy(false); }
  }

  async function saveReminderTemplate(event: FormEvent<HTMLFormElement>, clinicId: string) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await saveTemplate({ data: { clinicId, templateName: String(values.get("templateName") ?? "").trim(),
        language: String(values.get("language") ?? "pt_BR") as "pt_BR" } });
      await router.invalidate();
      toast.success("Modelo de lembrete salvo. Envios continuam desativados até a liberação.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o modelo."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Administração de clínicas" description="Acompanhe os cadastros e registre decisões de acesso comercial." />
      {applications.length === 0 && <p className="text-muted-foreground">Nenhum cadastro comercial recebido.</p>}
      <div className="grid gap-4">
        {applications.map((clinic) => {
          const number = numbers.find((item) => item.clinic_id === clinic.clinic_id);
          return (
          <Card key={clinic.clinic_id}>
            <CardHeader>
              <CardTitle>{clinic.clinic_name}</CardTitle>
              <p className="break-words text-sm text-muted-foreground">{clinic.responsible_name} · {clinic.contact_email} · {statusLabel[clinic.status]}</p>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => decideApplication(event, clinic.clinic_id)}>
                <label className="grid gap-1 text-sm">
                  Plano
                  <select name="plan" defaultValue={clinic.plan ?? ""} className="h-9 rounded-md border bg-background px-2">
                    <option value="">Selecione</option>
                    {COMMERCIAL_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Vencimento
                  <Input type="date" name="expiration" defaultValue={clinic.expires_at ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(clinic.expires_at)) : ""} />
                </label>
                <Button type="submit" value="approved" disabled={busy}>{clinic.status === "suspended" ? "Reativar" : "Aprovar"}</Button>
                <Button type="submit" value="suspended" variant="outline" disabled={busy || clinic.status !== "approved"}>Suspender</Button>
                <Button type="submit" value="rejected" variant="outline" disabled={busy || clinic.status === "rejected"}>Rejeitar</Button>
              </form>
              <div className="mt-5 border-t pt-5">
                <h3 className="font-semibold">WhatsApp oficial da clínica</h3>
                {number ? <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <span>{number.display_phone} · {number.status === "active" ? "Ativo" : number.status === "paused" ? "Pausado" : "Pendente"}</span>
                  <Button size="sm" variant="outline" disabled={busy || clinic.status !== "approved"} onClick={() => changeNumberStatus(clinic.clinic_id, number.status === "active" ? "paused" : "active")}>
                    {number.status === "active" ? "Pausar número" : "Ativar número"}
                  </Button>
                </div> : <p className="mt-1 text-sm text-muted-foreground">Nenhum número vinculado. Cada clínica usa o próprio número oficial.</p>}
                <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => linkOfficialNumber(event, clinic.clinic_id)}>
                  <label className="grid gap-1 text-sm">ID do número na Meta<Input name="phoneId" inputMode="numeric" required autoComplete="off" /></label>
                  <label className="grid min-w-52 flex-1 gap-1 text-sm">Token da Meta<Input name="accessToken" type="password" required autoComplete="off" /></label>
                  <Button type="submit" variant="outline" disabled={busy}>{number ? "Substituir vínculo" : "Vincular número"}</Button>
                </form>
                {number && <form key={`${number.phone_number_id}:${number.reminder_template_name ?? ""}`} className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => saveReminderTemplate(event, clinic.clinic_id)}>
                  <label className="grid min-w-52 flex-1 gap-1 text-sm">Modelo de lembrete aprovado na Meta<Input name="templateName" required autoComplete="off" defaultValue={number.reminder_template_name ?? ""} placeholder="lembrete_consulta" /></label>
                  <label className="grid gap-1 text-sm">Idioma<select name="language" defaultValue={number.reminder_template_language} className="h-9 rounded-md border bg-background px-2"><option value="pt_BR">Português (Brasil)</option><option value="en_US">English</option><option value="es_ES">Español</option></select></label>
                  <Button type="submit" variant="outline" disabled={busy}>Salvar modelo</Button>
                </form>}
                {number && <p className="mt-1 text-xs text-muted-foreground">Use um modelo aprovado pela Meta com uma única variável no corpo: {"{{1}}"} receberá a data e hora da consulta. Salvar o nome não ativa envios.</p>}
                <p className="mt-2 text-xs text-muted-foreground">O token é enviado somente ao servidor do Agenda Sorriso, verificado na Meta e armazenado criptografado. Não o envie por chat.</p>
              </div>
            </CardContent>
          </Card>
        ); })}
      </div>
    </div>
  );
}
