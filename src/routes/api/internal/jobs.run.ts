import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request): boolean {
  const secret = process.env["JOBS_CRON_SECRET"];
  const actual = request.headers.get("Authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!secret || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/internal/jobs/run")({
  server: { handlers: { POST: async ({ request }) => {
    if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncGoogleCalendar } = await import("@/server/google-calendar.server");
    const { sendDueReminders } = await import("@/server/reminders.server");
    const results = await Promise.allSettled([
      syncGoogleCalendar(supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient, 5),
      sendDueReminders(supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient, 5),
    ]);
    const failed = results.some((r) => r.status === "rejected");
    return Response.json({ ok: !failed,
      google: results[0]?.status === "fulfilled" ? results[0].value : { error: "queue_failed" },
      reminders: results[1]?.status === "fulfilled" ? results[1].value : { error: "queue_failed" },
    }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } } },
});
