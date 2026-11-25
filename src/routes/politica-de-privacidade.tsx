import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { SELLER } from "@/lib/seller";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({ meta: [
    { title: "Política de Privacidade | Agenda Sorriso" },
    { name: "description", content: "Saiba como o Agenda Sorriso trata dados de clínicas, usuários e pacientes." },
    { property: "og:title", content: "Política de Privacidade | Agenda Sorriso" },
    { property: "og:type", content: "website" },
  ] }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return <div className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5">
      <Link to="/" aria-label="Agenda Sorriso, página inicial"><Logo /></Link>
      <Button asChild variant="outline"><Link to="/"><ArrowLeft aria-hidden /> Voltar ao início</Link></Button>
    </header>
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 text-foreground">
      <p className="text-sm font-semibold text-primary">Agenda Sorriso</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Política de Privacidade</h1>
      <p className="mt-3 text-sm text-muted-foreground">Última atualização: 25 de novembro de 2026.</p>
      <p className="mt-8 text-base leading-7">Esta política explica como o Agenda Sorriso trata dados no site, no cadastro das clínicas e no serviço de agenda e atendimento odontológico. A demonstração da página inicial usa apenas dados fictícios e não grava as escolhas feitas nela.</p>

      <section className="mt-10 space-y-3" aria-labelledby="responsavel">
        <h2 id="responsavel" className="text-xl font-bold">1. Quem trata os dados</h2>
        <p className="leading-7">A plataforma Agenda Sorriso é operada por {SELLER.legalName}, CNPJ {SELLER.cnpj}. Para cadastro, contratação, segurança e administração da plataforma, esse operador decide como os dados são tratados. Para os dados de pacientes inseridos pela clínica ou recebidos no número oficial dela, a clínica define as finalidades do atendimento e da agenda; o Agenda Sorriso presta o serviço tecnológico conforme a configuração da clínica.</p>
        <p className="leading-7">Contato para assuntos de privacidade: <a className="break-all text-primary underline underline-offset-4" href={`mailto:${SELLER.privacyEmail}`}>{SELLER.privacyEmail}</a>.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="dados">
        <h2 id="dados" className="text-xl font-bold">2. Dados tratados</h2>
        <ul className="list-disc space-y-2 pl-6 leading-7">
          <li><strong>Conta e clínica:</strong> e-mail de acesso, identificação da clínica, nome e contato do responsável, telefone comercial, configurações de serviços, profissionais e horários.</li>
          <li><strong>Agenda e atendimento:</strong> nome e telefone do paciente, consultas, mensagens, status da conversa e informações que a pessoa enviar à clínica, inclusive áudio quando o recurso estiver habilitado.</li>
          <li><strong>Assinatura:</strong> plano contratado, identificadores e estado da assinatura e eventos necessários para conciliar pagamentos. Os dados completos do cartão são tratados pelo provedor de pagamento, não pela agenda.</li>
          <li><strong>Uso e segurança:</strong> dados técnicos necessários para autenticação, funcionamento, prevenção de abuso e diagnóstico de falhas, como identificadores de sessão e registros de acesso.</li>
        </ul>
        <p className="leading-7">O serviço não solicita prontuário nem diagnóstico na demonstração. Mensagens livres de pacientes podem, porém, conter informações de saúde; a clínica deve orientar sua equipe sobre o uso adequado desses dados.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="finalidades">
        <h2 id="finalidades" className="text-xl font-bold">3. Para que usamos os dados</h2>
        <p className="leading-7">Usamos os dados para criar e proteger contas, confirmar e-mails, analisar e aprovar clínicas, operar a agenda, atender solicitações de pacientes, registrar, remarcar e cancelar consultas, enviar lembretes quando habilitados, prestar suporte, conciliar assinaturas e cumprir obrigações aplicáveis. A finalidade e a hipótese legal de cada atendimento a paciente devem ser definidas pela clínica responsável, conforme seu contexto.</p>
        <p className="leading-7">O atendimento automatizado ajuda na organização da agenda e não substitui avaliação clínica ou orientação profissional.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="integracoes">
        <h2 id="integracoes" className="text-xl font-bold">4. Serviços e integrações</h2>
        <p className="leading-7">Usamos Cloudflare para hospedar o site e processar requisições, Supabase para autenticação e banco de dados e Brevo para e-mails de conta. Quando a clínica habilitar os recursos correspondentes, mensagens passam pela plataforma oficial de WhatsApp da Meta, áudios podem ser enviados à OpenAI para transcrição e processamento do atendimento, eventos da agenda podem ser sincronizados com o Google Agenda após autorização da clínica e pagamentos são processados pela Stripe.</p>
        <p className="leading-7">A sincronização com o Google Agenda envia dados da consulta, serviço e profissional, sem nome, telefone ou anotações clínicas do paciente. Integrações dependem da ativação e da configuração apropriadas. Esses prestadores podem processar dados em outros países, conforme suas operações e garantias aplicáveis.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="retencao">
        <h2 id="retencao" className="text-xl font-bold">5. Armazenamento e proteção</h2>
        <p className="leading-7">Os registros são mantidos pelo tempo necessário para prestar o serviço, atender solicitações e cumprir obrigações legais ou de defesa de direitos. O prazo concreto depende do tipo de dado e da finalidade. Após esse período, os dados são eliminados ou anonimizados quando cabível. Aplicamos controles de acesso por clínica, autenticação e proteção de credenciais das integrações. Nenhuma medida técnica elimina totalmente os riscos de segurança.</p>
        <p className="leading-7">As escolhas da demonstração pública permanecem apenas na sessão da página e não são gravadas na agenda. O site pode manter os dados técnicos estritamente necessários para o funcionamento da sessão autenticada.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="direitos">
        <h2 id="direitos" className="text-xl font-bold">6. Seus direitos e contato</h2>
        <p className="leading-7">Você pode solicitar confirmação do tratamento, acesso, correção e, quando aplicável, eliminação, portabilidade ou informações sobre compartilhamento. Envie o pedido para <a className="break-all text-primary underline underline-offset-4" href={`mailto:${SELLER.privacyEmail}`}>{SELLER.privacyEmail}</a>. Podemos solicitar informações para confirmar sua identidade antes de responder.</p>
        <p className="leading-7">Se o pedido tratar de uma consulta ou conversa com uma clínica, procure também a própria clínica, que decide sobre os dados de seus pacientes. Podemos auxiliá-la a atender o pedido.</p>
        <p className="leading-7">Consulte as <Link to="/exclusao-de-dados" className="text-primary underline underline-offset-4">instruções para solicitar exclusão de dados</Link>.</p>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="alteracoes">
        <h2 id="alteracoes" className="text-xl font-bold">7. Alterações desta política</h2>
        <p className="leading-7">Podemos atualizar esta página quando o serviço ou suas integrações mudarem. A data no início indica a versão publicada; alterações relevantes serão comunicadas pelos canais apropriados.</p>
      </section>
    </main>
  </div>;
}
