import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingPeriod } from "@/lib/commercial-plans";

type Plan = "essencial" | "crescimento" | "profissional";
type BillingDb = SupabaseClient;
const SITE_ORIGIN = "https://agenda-sorriso.correo-lucof-708.workers.dev";

function stripeClient(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe ainda não configurada.");
  if (process.env["STRIPE_LIVE_ENABLED"] !== "true" && !key.startsWith("sk_test_")) {
    throw new Error("Somente a Stripe em modo de teste está autorizada.");
  }
  return new Stripe(key);
}

function priceId(plan: Plan, period: BillingPeriod): string {
  const name = `STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`;
  const value = process.env[name];
  if (!value?.startsWith("price_")) throw new Error(`Preço Stripe não configurado: ${name}`);
  return value;
}

function packPriceId(credits: 100 | 500 | 1000): string {
  const value = process.env[`STRIPE_PACK_PRICE_${credits}`];
  if (!value?.startsWith("price_")) throw new Error("Pacote Stripe ainda não configurado.");
  return value;
}

function safeOrigin(requestOrigin?: string): string {
  if (!requestOrigin) return SITE_ORIGIN;
  const url = new URL(requestOrigin);
  if (url.origin !== SITE_ORIGIN) throw new Error("Origem de contratação inválida.");
  return url.origin;
}

export async function createClinicCheckout(
  db: BillingDb,
  input: { clinicId: string; plan: Plan; period: BillingPeriod; email: string; origin?: string },
): Promise<string> {
  const { data: access, error: accessError } = await db.from("commercial_access")
    .select("status, plan, expires_at, payment_required").eq("clinic_id", input.clinicId).single();
  if (accessError || !access || access.status !== "approved" || !access.payment_required || access.plan !== input.plan ||
    !access.expires_at || new Date(access.expires_at).getTime() <= Date.now()) {
    throw new Error("A clínica precisa de aprovação e plano definido antes da contratação.");
  }
  const { data: billing, error: billingError } = await db.from("billing_subscriptions")
    .select("stripe_customer_id, status, current_period_end").eq("clinic_id", input.clinicId).maybeSingle();
  if (billingError) throw new Error("Não foi possível consultar a assinatura.");
  if (billing && ["active", "trialing"].includes(billing.status) && billing.current_period_end && new Date(billing.current_period_end).getTime() > Date.now()) {
    throw new Error("A clínica já possui uma assinatura ativa.");
  }
  const stripe = stripeClient();
  const origin = safeOrigin(input.origin);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(billing?.stripe_customer_id ? { customer: billing.stripe_customer_id } : { customer_email: input.email }),
    client_reference_id: input.clinicId,
    line_items: [{ price: priceId(input.plan, input.period), quantity: 1 }],
    subscription_data: { metadata: { clinic_id: input.clinicId, plan: input.plan, period: input.period } },
    metadata: { clinic_id: input.clinicId, plan: input.plan, period: input.period },
    success_url: `${origin}/cadastro-clinica?checkout=success`,
    cancel_url: `${origin}/cadastro-clinica?checkout=cancelled`,
  });
  if (!session.url) throw new Error("A Stripe não retornou a página de pagamento.");
  return session.url;
}

export async function createBillingPortal(db: BillingDb, clinicId: string): Promise<string> {
  const { data, error } = await db.from("billing_subscriptions").select("stripe_customer_id")
    .eq("clinic_id", clinicId).single();
  if (error || !data?.stripe_customer_id) throw new Error("Cliente Stripe ainda não encontrado.");
  const session = await stripeClient().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${SITE_ORIGIN}/cadastro-clinica`,
  });
  return session.url;
}

export async function createCreditPackCheckout(db: BillingDb, clinicId: string, credits: 100 | 500 | 1000): Promise<string> {
  const { data: access } = await db.from("commercial_access").select("status,expires_at")
    .eq("clinic_id", clinicId).single();
  const { data: billing } = await db.from("billing_subscriptions")
    .select("stripe_customer_id,status,current_period_end").eq("clinic_id", clinicId).single();
  if (access?.status !== "approved" || new Date(access.expires_at).getTime() <= Date.now() ||
    !billing?.stripe_customer_id || !["active", "trialing"].includes(billing.status) ||
    new Date(billing.current_period_end).getTime() <= Date.now()) throw new Error("Pacotes exigem assinatura ativa.");
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment", customer: billing.stripe_customer_id, client_reference_id: clinicId,
    line_items: [{ price: packPriceId(credits), quantity: 1 }],
    metadata: { clinic_id: clinicId, credits: String(credits), kind: "credit_pack" },
    success_url: `${SITE_ORIGIN}/configuracoes?pack=success`,
    cancel_url: `${SITE_ORIGIN}/configuracoes?pack=cancelled`,
  });
  if (!session.url) throw new Error("A Stripe não retornou o pagamento avulso.");
  return session.url;
}

export async function handleStripeWebhook(request: Request, db: BillingDb, stripeOverride?: Stripe): Promise<Response> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const maxBytes = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) return new Response("Payload too large", { status: 413 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) return new Response("Payload too large", { status: 413 });
  const raw = new TextDecoder().decode(bytes);
  let event: Stripe.Event;
  const stripe = stripeOverride ?? stripeClient();
  try { event = await stripe.webhooks.constructEventAsync(raw, signature, secret); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const incoming = event.data.object as Stripe.Checkout.Session;
    if (incoming.mode === "payment" && incoming.metadata?.["kind"] === "credit_pack") {
      const session = await stripe.checkout.sessions.retrieve(incoming.id);
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
      if (session.payment_status !== "paid" || session.mode !== "payment") return Response.json({ received: true, pending: true });
      const clinicId = session.client_reference_id;
      const credits = Number(session.metadata?.["credits"]);
      const price = items.data[0]?.price;
      const priceId = typeof price === "string" ? price : price?.id;
      if (!clinicId || clinicId !== session.metadata?.["clinic_id"] || !/^[0-9a-f-]{36}$/i.test(clinicId) || ![100, 500, 1000].includes(credits) ||
        priceId !== packPriceId(credits as 100 | 500 | 1000) || items.data.length !== 1 ||
        items.data[0]?.quantity !== 1) return new Response("Invalid pack", { status: 422 });
      const { data: billing } = await db.from("billing_subscriptions").select("stripe_customer_id")
        .eq("clinic_id", clinicId).single();
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!billing || billing.stripe_customer_id !== customerId) return new Response("Customer mismatch", { status: 422 });
      const { error } = await db.rpc("grant_extra_credits", { p_clinic_id: clinicId,
        p_reference: `stripe:${session.id}`, p_units: credits });
      if (error) return new Response("Credit grant failed", { status: 503 });
      return Response.json({ received: true });
    }
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    return Response.json({ received: true, ignored: true });
  }
  let subscriptionId: string | undefined;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  } else if (event.type.startsWith("customer.subscription.")) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  } else {
    const invoice = event.data.object as Stripe.Invoice;
    const parent = invoice.parent?.subscription_details?.subscription;
    subscriptionId = typeof parent === "string" ? parent : parent?.id;
  }
  if (!subscriptionId) return Response.json({ received: true, ignored: true });
  // Read the current Stripe state instead of trusting event delivery order.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const clinicId = subscription.metadata["clinic_id"];
  if (!clinicId || !/^[0-9a-f-]{36}$/i.test(clinicId)) return new Response("Unmapped subscription", { status: 422 });
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const stripePrice = item?.price.id;
  const { data: access, error: accessError } = await db.from("commercial_access").select("plan,payment_required")
    .eq("clinic_id", clinicId).single();
  const { data: existingBilling, error: billingError } = await db.from("billing_subscriptions")
    .select("stripe_customer_id").eq("clinic_id", clinicId).maybeSingle();
  if (accessError || billingError) return new Response("Billing lookup failed", { status: 503 });
  const approvedPlan = access?.plan;
  const validPlan = approvedPlan === "essencial" || approvedPlan === "crescimento" || approvedPlan === "profissional";
  const allowedPrices = validPlan ? (["MONTHLY", "ANNUAL"] as const).map((period) =>
    process.env[`STRIPE_PRICE_${approvedPlan.toUpperCase()}_${period}`]).filter(Boolean) : [];
  if (!access?.payment_required || !validPlan || !stripePrice || !allowedPrices.includes(stripePrice) ||
    (existingBilling?.stripe_customer_id && existingBilling.stripe_customer_id !== customerId)) {
    return new Response("Subscription mismatch", { status: 422 });
  }
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  const { error } = await db.rpc("apply_stripe_subscription_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_clinic_id: clinicId,
    p_customer_id: customerId,
    p_subscription_id: subscription.id,
    p_price_id: item?.price.id ?? null,
    p_status: subscription.status,
    p_period_end: periodEnd,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
  });
  if (error) return new Response("Billing update failed", { status: 503 });
  if (["active", "trialing"].includes(subscription.status)) {
    const { error: creditError } = await db.rpc("refresh_clinic_credits", { p_clinic_id: clinicId });
    if (creditError) return new Response("Credit grant failed", { status: 503 });
  }
  return Response.json({ received: true });
}
