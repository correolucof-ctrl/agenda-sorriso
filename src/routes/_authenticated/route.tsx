import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import { getClinicPortal } from "@/lib/clinic-registration.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (import.meta.env["VITE_STANDALONE"] !== "true") return { user: data.user, portal: null };
    const portal = await getClinicPortal();
    if (location.pathname === "/simulador") throw redirect({ to: "/" , hash: "demonstracao" });
    if (portal.isAdmin && location.pathname !== "/admin") throw redirect({ to: "/admin" });
    if (!portal.isAdmin && location.pathname === "/admin") throw redirect({ to: "/cadastro-clinica" });
    if (!portal.isAdmin && portal.status !== "active" && location.pathname !== "/cadastro-clinica") {
      throw redirect({ to: "/cadastro-clinica" });
    }
    return { user: data.user, portal };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, portal } = Route.useRouteContext();
  const navigate = useNavigate();
  if (portal && (portal.isAdmin || portal.status !== "active")) {
    return (
      <div className="min-h-screen bg-background">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link to="/"><Logo /></Link>
          <Button variant="outline" onClick={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth", replace: true });
          }}>Sair</Button>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-5"><Outlet /></main>
      </div>
    );
  }
  return (
    <AppShell email={user.email ?? "Conta conectada"}>
      <Outlet />
    </AppShell>
  );
}
