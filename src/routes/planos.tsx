import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PlanCatalog } from "@/components/app/PlanCatalog";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SellerDetails } from "@/components/app/SellerDetails";

export const Route = createFileRoute("/planos")({
  head: () => ({ meta: [
    { title: "Planos mensais, anuais e créditos | Agenda Sorriso" },
    { name: "description", content: "Planos do Agenda Sorriso a partir de R$ 30 por mês, assinatura anual com dois meses grátis e pacotes de créditos em preparação." },
    { property: "og:title", content: "Planos e créditos | Agenda Sorriso" },
    { property: "og:description", content: "Compare planos mensais e anuais do software para clínicas. Vendas ainda não abertas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PlansPage,
});

function PlansPage() {
  return <div className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5"><Logo /><Button asChild variant="outline"><Link to="/"><ArrowLeft aria-hidden /> Voltar</Link></Button></header>
    <main className="mx-auto max-w-6xl px-6 pb-12 pt-6">
      <Badge variant="demo">Vendas ainda não abertas</Badge>
      <h1 className="mt-4 text-3xl font-bold">Agenda Sorriso</h1>
      <p className="mb-8 mt-3 max-w-2xl text-muted-foreground">Assinaturas mensais e anuais para o software de atendimento e agenda odontológica.</p>
      <PlanCatalog />
      <div className="mt-8 border-t pt-6"><Button asChild><a href="/#demonstracao">Testar a demonstração <ArrowRight aria-hidden /></a></Button></div>
      <div className="mt-8"><SellerDetails /></div>
    </main>
  </div>;
}
