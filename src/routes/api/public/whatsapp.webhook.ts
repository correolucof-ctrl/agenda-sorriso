import { createFileRoute } from "@tanstack/react-router";

// Direct Meta Cloud API receiver. Restricted mode: only allowlisted numbers are processed.
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyMetaChallenge } = await import("@/server/meta-webhook.server");
        return verifyMetaChallenge(request, process.env["META_WEBHOOK_VERIFY_TOKEN"]);
      },
      POST: async ({ request }) => {
        const { handleMetaWebhook } = await import("@/server/meta-webhook.server");
        const appSecret = process.env["META_APP_SECRET"];
        const phoneId = process.env["META_WHATSAPP_PHONE_NUMBER_ID"];
        const multi = process.env["META_MULTI_CLINIC_ENABLED"] === "true";
        if (!appSecret || (!multi && !phoneId)) return handleMetaWebhook(request, {});
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createSupabaseStore, createProcessor } = await import("@/server/whatsapp-runtime.server");
        const { resolveClinicNumber } = await import("@/server/whatsapp-clinic.server");
        return handleMetaWebhook(request, { appSecret, ...(multi ? {} : { phoneId: phoneId! }),
          ...(multi ? { isConnectedNumber: async (id: string) => !!(await resolveClinicNumber(supabaseAdmin, id)) } : {}),
          store: createSupabaseStore(supabaseAdmin), process: createProcessor(supabaseAdmin) });
      },
    },
  },
});
