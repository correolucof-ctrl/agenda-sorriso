import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha | Agenda Sorriso" },
      { name: "description", content: "Defina uma nova senha para acessar a Agenda Sorriso." },
      { property: "og:title", content: "Redefinir senha | Agenda Sorriso" },
      { property: "og:description", content: "Defina uma nova senha para acessar a Agenda Sorriso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      toast.error("Não foi possível atualizar a senha. Peça um novo link.");
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-card">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">Nova senha</h1>
        {!ready ? (
          <p className="mt-2 text-sm text-muted-foreground">Abra esta página pelo link enviado ao seu e-mail.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!error} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
