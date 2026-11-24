import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, CalendarCheck2, CalendarClock, CircleSlash, MessageCircle, Mic, Phone, ShieldAlert, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import { WHATSAPP_DISPLAY, whatsappChatLink } from "@/lib/clinic-contact";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda Sorriso | Atendimento odontológico e agenda inteligente" },
      {
        name: "description",
        content: "Conheça o Agenda Sorriso: atendimento, agendamento e gestão de consultas para clínicas odontológicas. Teste a demonstração gratuita na página inicial.",
      },
      { property: "og:title", content: "Agenda Sorriso | Agente de atendimento odontológico 24h" },
      { property: "og:description", content: "Conheça os planos e experimente a demonstração interativa do atendimento e agendamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const CAPABILITIES = [
  { icon: Mic, title: "Texto ou áudio", text: "Recebe a mensagem, mostra a transcrição e identifica a intenção do paciente." },
  { icon: CalendarClock, title: "Horários reais da agenda", text: "Oferece opções calculadas pelo funcionamento, duração do serviço, bloqueios e consultas existentes." },
  { icon: CalendarCheck2, title: "Reserva após confirmação", text: "Só agenda depois que o paciente escolhe e confirma. Horário ocupado nunca é reservado duas vezes." },
  { icon: CircleSlash, title: "Remarca e cancela", text: "Encontra a consulta do paciente, respeita a antecedência mínima e atualiza a agenda na hora." },
  { icon: BellRing, title: "Lembretes automáticos", text: "Cada consulta gera um lembrete na fila, atualizado ou cancelado junto com ela." },
  { icon: ShieldAlert, title: "Sem diagnóstico", text: "Em sinais de urgência, orienta a procurar atendimento profissional e transfere para a equipe." },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [demoStep, setDemoStep] = useState<"choose" | "confirm" | "done">("choose");
  const [demoTime, setDemoTime] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const cta = signedIn ? "/painel" as const : "/auth" as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile: logo + Entrar on the first row, full-width WhatsApp button below. sm+: single row. */}
      <header className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-6 py-5 sm:flex sm:justify-between">
        <Logo className="min-w-0 whitespace-nowrap" />
        <div className="contents sm:flex sm:shrink-0 sm:items-center sm:gap-2">
          <Button asChild variant="outline" className="col-span-2 row-start-2 w-full border-success/40 text-success hover:bg-success-soft hover:text-success sm:w-auto">
            <a href={whatsappChatLink()} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden /> Conversar no WhatsApp
            </a>
          </Button>
          <Button asChild variant={signedIn ? "default" : "outline"} className="col-start-2 row-start-1">
            <Link to={cta}>{signedIn ? "Abrir painel" : "Entrar"}</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <Badge variant="demo">Experimente aqui, sem cadastro</Badge>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl">
            Atendimento odontológico 24h que agenda sozinho.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Organize a agenda da clínica e prepare o atendimento automático dos pacientes no número oficial da sua clínica. Veja ao lado uma conversa simulada: escolha um horário e acompanhe a confirmação da consulta.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <a href="#demonstracao">Testar demonstração <ArrowRight aria-hidden /></a>
            </Button>
            <Button asChild size="lg" variant="success" className="h-12 px-6">
              <a href={whatsappChatLink()} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden /> Conversar no WhatsApp
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6"><Link to="/planos">Conhecer planos</Link></Button>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Phone className="size-3.5 text-success" aria-hidden />
            <span>
              Fale com a equipe no WhatsApp{" "}
              <a
                href={whatsappChatLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {WHATSAPP_DISPLAY}
              </a>
              . Esse número é para conversar com a equipe comercial.
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">A demonstração usa dados fictícios, não exige conta e não salva informações. O cadastro da clínica começa em <Link to={cta} className="underline">Entrar</Link>.</p>
        </div>

        <div id="demonstracao" className="relative scroll-mt-6" aria-label="Demonstração interativa">
          <div className="absolute -inset-6 rounded-[2rem] bg-grid-soft" aria-hidden />
          <div className="relative rounded-2xl border bg-card p-4 shadow-float">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">Ana Beatriz Lima</p>
                  <p className="text-xs text-muted-foreground">WhatsApp simulado</p>
                </div>
              </div>
              <Badge variant="info">Agendar</Badge>
            </div>
            <div className="space-y-2.5 bg-chat px-1 py-4 text-sm">
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-bubble-out px-3.5 py-2 text-bubble-out-foreground">
                Oi, queria marcar uma limpeza essa semana, de preferência à tarde.
              </div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-bubble-in px-3.5 py-2 shadow-card">
                Para limpeza (45 min), tenho estes horários:
                <br />1. qui. 14:00 com Dra. Camila Azevedo
                <br />2. sex. 15:30 com Dra. Helena Prado
              </div>
              {demoStep !== "choose" && <div className="w-fit max-w-[85%] rounded-2xl bg-bubble-in px-3.5 py-2 shadow-card" role="status">
                {demoStep === "confirm" ? `Confirma a limpeza ${demoTime}?` : `Consulta simulada confirmada ${demoTime}. O lembrete foi colocado na fila fictícia.`}
              </div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {demoStep === "choose" && ["quinta às 14:00", "sexta às 15:30"].map((time) =>
                <Button key={time} size="sm" variant="outline" onClick={() => { setDemoTime(time); setDemoStep("confirm"); }}>{time}</Button>,
              )}
              {demoStep === "confirm" && <Button size="sm" onClick={() => setDemoStep("done")}>Confirmar</Button>}
              {demoStep !== "choose" && <Button size="sm" variant="ghost" onClick={() => { setDemoTime(""); setDemoStep("choose"); }}>{demoStep === "done" ? "Reiniciar" : "Trocar horário"}</Button>}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Os dados desta simulação não são salvos.</p>
          </div>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold">O que o agente faz sem ajuda</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-xl border bg-background p-5">
                <c.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-3 font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold">Da demonstração à agenda da sua clínica</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A demonstração acima é independente. Na contratação, cada clínica recebe uma agenda própria e começa sem consultas cadastradas.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5"><p className="text-sm font-semibold text-primary">01 · Cadastro</p><h3 className="mt-2 font-semibold">Sua clínica, sua agenda</h3><p className="mt-2 text-sm text-muted-foreground">Cadastre a clínica e confirme o e-mail. A agenda começa vazia, separada das demais clínicas.</p></div>
          <div className="rounded-xl border bg-card p-5"><p className="text-sm font-semibold text-primary">02 · Aprovação</p><h3 className="mt-2 font-semibold">Liberação controlada</h3><p className="mt-2 text-sm text-muted-foreground">A equipe Agenda Sorriso analisa e aprova o acesso antes de liberar o serviço.</p></div>
          <div className="rounded-xl border bg-card p-5"><p className="text-sm font-semibold text-primary">03 · Configuração</p><h3 className="mt-2 font-semibold">Seu atendimento</h3><p className="mt-2 text-sm text-muted-foreground">Configure serviços, profissionais, horários e o número oficial de WhatsApp da clínica antes de ativar as automações.</p></div>
        </div>
        <p className="mt-6 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          Quer conhecer a implantação e as integrações disponíveis? Fale com a equipe pelo WhatsApp{" "}
          <a
            href={whatsappChatLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {WHATSAPP_DISPLAY}
          </a>
          . O atendimento automático depende da conexão do número oficial da clínica e da liberação das integrações.
        </p>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>Agenda Sorriso · Atendimento e agenda para clínicas odontológicas. A demonstração usa apenas dados fictícios.</p>
        <p className="mt-1.5">
          WhatsApp da equipe:{" "}
          <a
            href={whatsappChatLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {WHATSAPP_DISPLAY}
          </a>{" "}
          · atendimento comercial.
        </p>
      </footer>
    </div>
  );
}
