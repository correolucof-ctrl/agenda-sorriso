import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const checkoutSchema = z.object({
  plan: z.enum(["essencial", "crescimento", "profissional"]),
  period: z.enum(["monthly", "annual"]),
});

async function clinicIdForUser(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db.from("clinics").select("id").eq("owner_id", userId).eq("is_demo", false).single();
  if (error || !data) throw new Error("Clínica não encontrada para esta conta.");
  return data.id;
}

export const getBillingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const clinicId = await clinicIdForUser(db, context.userId);
    const [billing, access, wallet] = await Promise.all([
      db.from("billing_subscriptions").select("status, current_period_end, cancel_at_period_end, stripe_price_id, stripe_customer_id")
        .eq("clinic_id", clinicId).maybeSingle(),
      db.from("commercial_access").select("status, plan, payment_required").eq("clinic_id", clinicId).maybeSingle(),
      db.from("credit_wallets").select("included_remaining,extra_remaining,period_end").eq("clinic_id", clinicId).maybeSingle(),
    ]);
    if (billing.error || access.error) throw new Error("Não foi possível carregar a contratação.");
    return { subscription: billing.data, access: access.data, wallet: wallet.error ? null : wallet.data };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const clinicId = await clinicIdForUser(db, context.userId);
    const email = String(context.claims.email ?? "");
    if (!email) throw new Error("Confirme o e-mail da conta antes de contratar.");
    const { createClinicCheckout } = await import("@/server/stripe-billing.server");
    return { url: await createClinicCheckout(db, { clinicId, email, ...data }) };
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const clinicId = await clinicIdForUser(db, context.userId);
    const { createBillingPortal } = await import("@/server/stripe-billing.server");
    return { url: await createBillingPortal(db, clinicId) };
  });

export const startCreditPackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ credits: z.union([z.literal(100), z.literal(500), z.literal(1000)]) }).parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const clinicId = await clinicIdForUser(db, context.userId);
    const { createCreditPackCheckout } = await import("@/server/stripe-billing.server");
    return { url: await createCreditPackCheckout(db, clinicId, data.credits) };
  });
