import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-calendar/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const status = url.searchParams.get("error") ? "denied" : "connected";
    if (status === "denied") return Response.redirect(`${url.origin}/configuracoes?google=denied`, 303);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { finishGoogleConnection } = await import("@/server/google-calendar.server");
      await finishGoogleConnection(supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient, code, state);
      return Response.redirect(`${url.origin}/configuracoes?google=connected`, 303);
    } catch {
      return Response.redirect(`${url.origin}/configuracoes?google=error`, 303);
    }
  } } },
});
