import { createFileRoute } from "@tanstack/react-router";
import { ClinicAccount } from "@/components/app/ClinicAccount";
import { PageHeader } from "@/components/app/States";
import { clinicRegistrationOptions } from "@/lib/clinic-registration-query";

export const Route = createFileRoute("/_authenticated/cadastro-clinica")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicRegistrationOptions()),
  head: () => ({ meta: [
    { title: "Cadastro da clínica | Agenda Sorriso" },
    { name: "description", content: "Cadastro da clínica, responsável e contato de contratação no Agenda Sorriso." },
    { property: "og:title", content: "Cadastro da clínica | Agenda Sorriso" },
    { property: "og:description", content: "Dados da clínica e situação da contratação no Agenda Sorriso." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <div><PageHeader title="Cadastro da clínica" description="Identificação e contato de contratação" /><ClinicAccount /></div>,
});