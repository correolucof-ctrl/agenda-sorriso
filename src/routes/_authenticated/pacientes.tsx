import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Spinner } from "@/components/app/States";
import { useClinic, usePatients, useUpcomingAppointments, type Patient } from "@/hooks/use-clinic";
import { formatSlotLabel } from "@/lib/time";
import { errorMessage } from "@/lib/ui-maps";

export const Route = createFileRoute("/_authenticated/pacientes")({
  head: () => ({
    meta: [
      { title: "Pacientes | Agenda Sorriso" },
      { name: "description", content: "Pacientes fictícios da clínica de demonstração." },
      { property: "og:title", content: "Pacientes | Agenda Sorriso" },
      { property: "og:description", content: "Pacientes fictícios da clínica de demonstração." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const clinic = useClinic();
  const c = clinic.data;
  const patients = usePatients(c?.id);
  const upcoming = useUpcomingAppointments(c?.id);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Patient | null | "new">(null);
  const [removing, setRemoving] = useState<Patient | null>(null);
  const qc = useQueryClient();

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (patients.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || p.phone.includes(term));
  }, [patients.data, q]);

  async function remove() {
    if (!removing) return;
    const { error } = await supabase.from("patients").delete().eq("id", removing.id);
    setRemoving(null);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Paciente removido.");
    qc.invalidateQueries();
  }

  if (clinic.error || patients.error) return <ErrorState error={clinic.error ?? patients.error} onRetry={() => patients.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Somente dados fictícios de teste. Não cadastre pacientes reais nesta demonstração."
        actions={
          <Button onClick={() => setEditing("new")} disabled={!c}>
            <Plus aria-hidden /> Novo paciente
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="pt-search" className="sr-only">Buscar paciente</label>
        <Input id="pt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone" className="pl-9" />
      </div>
      {patients.isLoading ? (
        <LoadingRows rows={6} />
      ) : list.length === 0 ? (
        <EmptyState title={q ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"} description={q ? "Tente outro termo." : "Crie um paciente fictício para testar."} />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <ul className="divide-y">
            {list.map((p) => {
              const next = (upcoming.data ?? []).find((a) => a.patient_id === p.id);
              return (
                <li key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{p.name}</p>
                      {p.is_demo ? <Badge variant="demo">Fictício</Badge> : <Badge variant="muted">Teste</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.phone}{p.notes ? ` · ${p.notes}` : ""}</p>
                  </div>
                  <p className="text-sm text-muted-foreground sm:w-56">
                    {next ? <>Próxima: <span className="font-medium text-foreground">{formatSlotLabel(next.starts_at, c!.timezone)}</span></> : "Sem consulta futura"}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRemoving(p)} aria-label={`Remover ${p.name}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {c ? <PatientDialog clinicId={c.id} value={editing} onClose={() => setEditing(null)} /> : null}
      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>As consultas e lembretes deste paciente também serão removidos. As conversas ficam no histórico.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PatientDialog({ clinicId, value, onClose }: { clinicId: string; value: Patient | null | "new"; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const phone = String(f.get("phone") ?? "").trim();
    const notes = String(f.get("notes") ?? "").trim();
    const next: Record<string, string> = {};
    if (name.length < 3) next["name"] = "Informe o nome (mínimo 3 letras)";
    if (phone.replace(/\D/g, "").length < 10) next["phone"] = "Informe um telefone de teste com DDD";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const res = existing
      ? await supabase.from("patients").update({ name, phone, notes }).eq("id", existing.id)
      : await supabase.from("patients").insert({ clinic_id: clinicId, name, phone, notes, is_demo: false });
    setBusy(false);
    if (res.error) return void toast.error(res.error.code === "23505" ? "Já existe um paciente com esse telefone." : errorMessage(res.error));
    toast.success(existing ? "Paciente atualizado." : "Paciente criado.");
    qc.invalidateQueries({ queryKey: ["patients"] });
    onClose();
  }

  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Editar paciente" : "Novo paciente fictício"}</DialogTitle>
          <DialogDescription>Use apenas nomes e telefones de teste.</DialogDescription>
        </DialogHeader>
        <form key={existing?.id ?? "new"} onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">Nome</Label>
            <Input id="pt-name" name="name" defaultValue={existing?.name ?? ""} aria-invalid={!!errors["name"]} />
            {errors["name"] ? <p className="text-sm text-destructive">{errors["name"]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-phone">Telefone de teste</Label>
            <Input id="pt-phone" name="phone" defaultValue={existing?.phone ?? "(11) 9"} aria-invalid={!!errors["phone"]} />
            {errors["phone"] ? <p className="text-sm text-destructive">{errors["phone"]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-notes">Observações</Label>
            <Textarea id="pt-notes" name="notes" defaultValue={existing?.notes ?? ""} maxLength={300} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
