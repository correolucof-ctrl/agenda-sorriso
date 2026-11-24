import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleStripeWebhook } = await import("@/server/stripe-billing.server");
        return handleStripeWebhook(request, supabaseAdmin);
      },
    },
  },
});
