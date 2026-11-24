import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/app/Logo";
import { useClinic, useConversations } from "@/hooks/use-clinic";
import { cn } from "@/lib/utils";
import { clinicRegistrationOptions } from "@/lib/clinic-registration-query";

const NAV = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/conversas", label: "Conversas", icon: MessageSquareText },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/simulador", label: "Simulador do agente", icon: Smartphone },
  { to: "/lembretes", label: "Lembretes", icon: Bell },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;
const standalone = import.meta.env["VITE_STANDALONE"] === "true";

function NavList({ onNavigate, pending }: { onNavigate?: () => void; pending: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV.filter((item) => !standalone || item.to !== "/simulador").map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("size-4", active ? "text-sidebar-primary" : "")} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.to === "/conversas" && pending > 0 ? (
              <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground" aria-label={`${pending} aguardando equipe`}>
                {pending}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate, pending, clinicName, email, onSignOut }: { onNavigate?: () => void; pending: number; clinicName: string; email: string; onSignOut: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4">
      <div className="px-2 pt-1">
        <Logo inverted />
        <p className="mt-3 truncate text-xs text-sidebar-foreground/80">{clinicName}</p>
      </div>
      <NavList pending={pending} {...(onNavigate ? { onNavigate } : {})} />
      <div className="mt-auto space-y-3 rounded-lg border border-sidebar-border p-3">
        {!standalone && <p className="text-xs leading-relaxed text-sidebar-foreground/80">
          Modo demonstração. Dados fictícios. WhatsApp, Google Agenda e transcrição real não estão conectados.
        </p>}
        <p className="truncate text-xs text-sidebar-foreground" title={email}>
          {email}
        </p>
        <Button variant="sidebar" size="sm" className="w-full" onClick={onSignOut}>
          <LogOut aria-hidden /> Sair
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clinic = useClinic();
  const registration = useQuery(clinicRegistrationOptions());
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const conversations = useConversations(clinic.data?.id);
  const pending = conversations.data?.filter((c) => c.status === "pending_human").length ?? 0;
  const clinicName = clinic.data?.name ?? "Carregando clínica...";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <SidebarBody pending={pending} clinicName={clinicName} email={email} onSignOut={handleSignOut} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Abrir menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} pending={pending} clinicName={clinicName} email={email} onSignOut={handleSignOut} />
            </SheetContent>
          </Sheet>
          <Logo />
          {!standalone && <Badge variant="demo" className="ml-auto">
            Demonstração
          </Badge>}
        </header>
        {!standalone && <div className="hidden items-center justify-end gap-2 border-b bg-card px-8 py-2.5 lg:flex">
          <Badge variant="demo">Modo demonstração · dados fictícios</Badge>
        </div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {registration.isSuccess && !registration.data && pathname !== "/cadastro-clinica" ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <p className="text-sm text-muted-foreground">Cadastro da clínica pendente</p>
              <Button asChild variant="outline" size="sm"><Link to="/cadastro-clinica">Cadastrar clínica</Link></Button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
