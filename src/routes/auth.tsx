import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/app/Logo";
import { Spinner } from "@/components/app/States";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Agenda Sorriso" },
      { name: "description", content: "Acesse o painel de demonstração da Agenda Sorriso com dados fictícios isolados por conta." },
      { property: "og:title", content: "Entrar | Agenda Sorriso" },
      { property: "og:description", content: "Acesse o painel de demonstração da Agenda Sorriso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Informe um e-mail válido");
const passwordSchema = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres");
const standalone = import.meta.env["VITE_STANDALONE"] === "true";
const googleEnabled = !standalone || import.meta.env["VITE_GOOGLE_LOGIN"] === "true";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signupSent, setSignupSent] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [mode, setMode] = useState("entrar");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/painel", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = emailSchema.safeParse(form.get("email"));
    const password = z.string().min(1, "Informe a senha").safeParse(form.get("password"));
    const next: Record<string, string> = {};
    if (!email.success) next["email"] = email.error.issues[0]?.message ?? "";
    if (!password.success) next["password"] = password.error.issues[0]?.message ?? "";
    setErrors(next);
    if (!email.success || !password.success) return;
    setBusy("signin");
    const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
    setBusy(null);
    if (error) {
      toast.error(error.message.includes("Email not confirmed") ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha incorretos.");
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignupError("");
    const form = new FormData(e.currentTarget);
    const email = emailSchema.safeParse(form.get("email"));
    const password = passwordSchema.safeParse(form.get("password"));
    const next: Record<string, string> = {};
    if (!email.success) next["su-email"] = email.error.issues[0]?.message ?? "";
    if (!password.success) next["su-password"] = password.error.issues[0]?.message ?? "";
    setErrors(next);
    if (!email.success || !password.success) return;
    setBusy("signup");
    const { data, error } = await supabase.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setBusy(null);
    if (error) {
      if (error.code === "over_email_send_rate_limit") {
        setSignupError("O envio de e-mails de confirmação atingiu o limite temporário. Aguarde antes de tentar novamente.");
      } else if (error.code === "email_address_not_authorized") {
        setSignupError("O envio de e-mails de confirmação para este endereço ainda não está disponível.");
      } else if (error.status === 429) {
        setSignupError("Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.");
      } else if (error.code === "user_already_exists" || error.message.includes("registered")) {
        setSignupError("Este e-mail já tem conta. Use a aba Entrar.");
      } else {
        setSignupError("Não foi possível criar a conta. Confira os dados e tente novamente.");
      }
      return;
    }
    if (data.session) navigate({ to: "/painel", replace: true });
    else setSignupSent(true);
  }

  async function handleForgot() {
    const input = document.getElementById("email") as HTMLInputElement | null;
    const email = emailSchema.safeParse(input?.value ?? "");
    if (!email.success) {
      setErrors({ email: "Digite seu e-mail acima para receber o link" });
      return;
    }
    setBusy("forgot");
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(null);
    if (error) toast.error("Não foi possível enviar o link agora.");
    else toast.success("Se o e-mail tiver conta, enviaremos um link para redefinir a senha.");
  }

  async function social(provider: "google" | "lovable") {
    setBusy(provider);
    if (standalone) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        setBusy(null);
        toast.error("Não foi possível entrar com o Google. Tente novamente.");
      }
      return;
    }
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) {
      setBusy(null);
      toast.error("Não foi possível entrar agora. Tente novamente.");
      return;
    }
    if (result.redirected) return;
    setBusy(null);
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <h1 className="mt-8 text-2xl font-bold">{standalone ? "Acesse sua conta" : "Acesse o painel de demonstração"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {standalone ? "Cadastre sua clínica para solicitar acesso ao serviço." : "Cada conta recebe uma clínica fictícia própria. Nenhum dado real de paciente é usado."}
          </p>

          {signupSent ? (
            <div role="status" className="mt-8 rounded-xl border bg-success-soft p-5">
              <p className="font-semibold text-foreground">Confira seu e-mail</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos um link de confirmação. Depois de confirmar, você entra direto no painel.
              </p>
              <Button variant="link" className="mt-2 h-auto p-0" onClick={() => { setSignupSent(false); setMode("entrar"); }}>
                Voltar para entrar
              </Button>
            </div>
          ) : (
            <>
              {(googleEnabled || !standalone) && <div className="mt-8 grid gap-2.5">
                {googleEnabled && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => social("google")} disabled={!!busy}>
                  {busy === "google" ? <Spinner /> : <GoogleLogo />}
                  Continuar com Google
                </Button>}
                {!standalone && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => social("lovable")} disabled={!!busy}>
                  {busy === "lovable" ? <Spinner /> : <LovableMark className="size-[18px]" />}
                  Continuar com Lovable
                </Button>}
              </div>}
              {(googleEnabled || !standalone) && <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
              </div>}
              <div className={standalone && !googleEnabled ? "mt-8" : undefined}>
              <Tabs value={mode} onValueChange={(v) => { setMode(v); setErrors({}); setSignupError(""); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="entrar">Entrar</TabsTrigger>
                  <TabsTrigger value="criar">Criar conta</TabsTrigger>
                </TabsList>
                <TabsContent value="entrar">
                  <form onSubmit={handleSignIn} className="mt-4 space-y-4" noValidate>
                    <Field id="email" label="E-mail" type="email" autoComplete="email" error={errors["email"]} />
                    <Field id="password" label="Senha" type="password" autoComplete="current-password" error={errors["password"]} />
                    <Button type="submit" className="h-11 w-full" disabled={!!busy}>
                      {busy === "signin" ? <Spinner /> : null} Entrar
                    </Button>
                    <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={handleForgot} disabled={!!busy}>
                      Esqueci minha senha
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="criar">
                  <form onSubmit={handleSignUp} className="mt-4 space-y-4" noValidate>
                    <Field id="su-email" name="email" label="E-mail" type="email" autoComplete="email" error={errors["su-email"]} />
                    <Field id="su-password" name="password" label="Senha (mínimo 8 caracteres)" type="password" autoComplete="new-password" error={errors["su-password"]} />
                    {signupError && <p role="alert" className="text-sm text-destructive">{signupError}</p>}
                    <Button type="submit" className="h-11 w-full" disabled={!!busy}>
                      {busy === "signup" ? <Spinner /> : null} {standalone ? "Criar conta" : "Criar conta de demonstração"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
              </div>
            </>
          )}
          <p className="mt-6 text-center text-xs text-muted-foreground">Ao usar o serviço, consulte a <Link to="/politica-de-privacidade" className="underline underline-offset-4">Política de Privacidade</Link>.</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="absolute inset-0 bg-grid-soft opacity-40" aria-hidden />
        <div className="relative max-w-md space-y-5 text-sidebar-foreground">
          <p className="text-sm font-semibold uppercase tracking-widest text-sidebar-primary">Agenda para sua clínica</p>
          <h2 className="text-3xl font-bold text-sidebar-accent-foreground">O agente agenda, remarca e cancela sozinho. A equipe só entra quando precisa.</h2>
          <ul className="space-y-2 text-sm">
            <li>Urgências e pedidos de atendente vão direto para a equipe.</li>
            <li>Horários vêm da agenda interna, validados no servidor.</li>
            <li>As integrações são configuradas por clínica após a aprovação.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, error, name, ...props }: { id: string; label: string; error?: string | undefined; name?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name ?? id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
