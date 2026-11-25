import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { SELLER } from "@/lib/seller";

export const Route = createFileRoute("/exclusao-de-dados")({
  head: () => ({ meta: [
    { title: "Exclusão de dados | Agenda Sorriso" },
    { name: "description", content: "Como solicitar acesso, correção ou exclusão de dados no Agenda Sorriso." },
  ] }),
  component: DataDeletion,
});

function DataDeletion() {
  return <div className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5">
      <Link to="/" aria-label="Agenda Sorriso, página inicial"><Logo /></Link>
      <Button asChild variant="outline"><Link to="/"><ArrowLeft aria-hidden /> Voltar ao início</Link></Button>
    </header>
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 text-foreground">
      <p className="text-sm font-semibold text-primary">Agenda Sorriso</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Solicitar exclusão de dados</h1>
      <p className="mt-8 leading-7">Para pedir a exclusão de dados relacionados à sua conta ou ao uso do Agenda Sorriso, escreva para <a className="break-all text-primary underline underline-offset-4" href={`mailto:${SELLER.privacyEmail}`}>{SELLER.privacyEmail}</a> com o assunto “Exclusão de dados”. Informe o e-mail da conta ou o nome da clínica e quais dados deseja excluir. Não envie senha, documentos de identidade ou informações clínicas no primeiro contato.</p>
      <p className="mt-4 leading-7">Confirmaremos a identidade e a relação com a conta antes de atender ao pedido. Caso seja necessário verificar informações adicionais, indicaremos um meio adequado. Também é possível pedir acesso ou correção dos dados pelo mesmo endereço.</p>
      <h2 className="mt-10 text-xl font-bold">Dados de pacientes</h2>
      <p className="mt-3 leading-7">Se o pedido envolver uma consulta ou conversa com uma clínica, procure a clínica responsável pelo atendimento. Você também pode escrever ao Agenda Sorriso no endereço acima, identificando a clínica para que possamos encaminhar e auxiliar o atendimento do pedido. Não inclua detalhes de saúde no primeiro e-mail.</p>
      <h2 className="mt-10 text-xl font-bold">O que acontece após o pedido</h2>
      <p className="mt-3 leading-7">Analisaremos os dados vinculados ao pedido e informaremos as providências aplicáveis. Alguns registros podem precisar ser preservados para cumprir obrigações legais ou resguardar direitos; nesse caso, explicaremos a razão e limitaremos seu uso. A exclusão da conta ou dos dados pode impedir o acesso posterior ao serviço.</p>
      <p className="mt-8 leading-7">Leia também a <Link to="/politica-de-privacidade" className="text-primary underline underline-offset-4">Política de Privacidade</Link> para conhecer as categorias de dados e os contatos de privacidade.</p>
    </main>
  </div>;
}
