import { describe, expect, it, vi } from "vitest";
import { createClinicCheckout, handleStripeWebhook } from "@/server/stripe-billing.server";
import Stripe from "stripe";

describe("Stripe billing gates", () => {
  it("recusa o webhook sem segredo ou assinatura", async () => {
    const previous = process.env["STRIPE_WEBHOOK_SECRET"];
    delete process.env["STRIPE_WEBHOOK_SECRET"];
    try {
      const request = new Request("https://example.test/api/public/stripe/webhook", { method: "POST", body: "{}" });
      expect((await handleStripeWebhook(request, {} as never)).status).toBe(503);
      process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_fictitious";
      expect((await handleStripeWebhook(request, {} as never)).status).toBe(400);
    } finally {
      if (previous === undefined) delete process.env["STRIPE_WEBHOOK_SECRET"];
      else process.env["STRIPE_WEBHOOK_SECRET"] = previous;
    }
  });

  it("não abre Checkout para uma clínica pendente", async () => {
    const stripeFetch = vi.spyOn(globalThis, "fetch");
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: "pending", plan: null, payment_required: false }, error: null }) }) }) }) };
    try {
      await expect(createClinicCheckout(db as never, {
        clinicId: "11111111-1111-4111-8111-111111111111", plan: "essencial", period: "monthly", email: "clinic@example.test",
      })).rejects.toThrow("aprovação");
      expect(stripeFetch).not.toHaveBeenCalled();
    } finally { stripeFetch.mockRestore(); }
  });

  it("não abre Checkout se a aprovação venceu", async () => {
    const stripeFetch = vi.spyOn(globalThis, "fetch");
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
      status: "approved", plan: "essencial", payment_required: true, expires_at: "2020-01-01T00:00:00Z",
    }, error: null }) }) }) }) };
    try {
      await expect(createClinicCheckout(db as never, {
        clinicId: "11111111-1111-4111-8111-111111111111", plan: "essencial", period: "monthly", email: "clinic@example.test",
      })).rejects.toThrow("aprovação");
      expect(stripeFetch).not.toHaveBeenCalled();
    } finally { stripeFetch.mockRestore(); }
  });

  it("aceita webhook assinado, consulta o estado atual e aplica um único evento", async () => {
    const previous = process.env["STRIPE_WEBHOOK_SECRET"];
    const previousPrice = process.env["STRIPE_PRICE_ESSENCIAL_MONTHLY"];
    const secret = "whsec_test_fictitious";
    process.env["STRIPE_WEBHOOK_SECRET"] = secret;
    process.env["STRIPE_PRICE_ESSENCIAL_MONTHLY"] = "price_test";
    const stripe = new Stripe("sk_test_fictitious");
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
      id: "sub_test", customer: "cus_test", status: "active", metadata: { clinic_id: clinicId },
      items: { data: [{ price: { id: "price_test" }, current_period_end: 1796000000 }] }, cancel_at_period_end: false,
    } as never);
    const rpc = vi.fn(async () => ({ error: null }));
    const db = { rpc, from: (table: string) => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: table === "commercial_access" ? { plan: "essencial", payment_required: true } : null, error: null }),
      maybeSingle: async () => ({ data: table === "billing_subscriptions" ? { stripe_customer_id: "cus_test" } : null, error: null }),
    }) }) }) };
    const payload = JSON.stringify({
      id: "evt_test", type: "customer.subscription.updated",
      data: { object: { id: "sub_test" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    try {
      const request = new Request("https://example.test/api/public/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": signature }, body: payload,
      });
      expect((await handleStripeWebhook(request, db as never, stripe)).status).toBe(200);
      expect(rpc).toHaveBeenCalledWith("apply_stripe_subscription_event", expect.objectContaining({
        p_event_id: "evt_test", p_clinic_id: clinicId, p_subscription_id: "sub_test", p_status: "active",
      }));
      expect(rpc).toHaveBeenCalledWith("refresh_clinic_credits", { p_clinic_id: clinicId });
      retrieve.mockResolvedValue({
        id: "sub_test", customer: "cus_test", status: "active", metadata: { clinic_id: clinicId },
        items: { data: [{ price: { id: "price_other_plan" }, current_period_end: 1796000000 }] }, cancel_at_period_end: false,
      } as never);
      const wrongPayload = JSON.stringify({ id: "evt_wrong_price", type: "customer.subscription.updated", data: { object: { id: "sub_test" } } });
      const wrongSignature = stripe.webhooks.generateTestHeaderString({ payload: wrongPayload, secret });
      const callsBefore = rpc.mock.calls.length;
      expect((await handleStripeWebhook(new Request("https://example.test/api/public/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": wrongSignature }, body: wrongPayload,
      }), db as never, stripe)).status).toBe(422);
      expect(rpc).toHaveBeenCalledTimes(callsBefore);
    } finally {
      if (previous === undefined) delete process.env["STRIPE_WEBHOOK_SECRET"];
      else process.env["STRIPE_WEBHOOK_SECRET"] = previous;
      if (previousPrice === undefined) delete process.env["STRIPE_PRICE_ESSENCIAL_MONTHLY"];
      else process.env["STRIPE_PRICE_ESSENCIAL_MONTHLY"] = previousPrice;
    }
  });

  it("credita um pacote pago apenas após conferir preço, clínica e cliente Stripe", async () => {
    const previousSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    const previousPrice = process.env["STRIPE_PACK_PRICE_100"];
    const secret = "whsec_test_fictitious";
    process.env["STRIPE_WEBHOOK_SECRET"] = secret;
    process.env["STRIPE_PACK_PRICE_100"] = "price_pack_100";
    const stripe = new Stripe("sk_test_fictitious");
    const clinicId = "11111111-1111-4111-8111-111111111111";
    vi.spyOn(stripe.checkout.sessions, "retrieve").mockResolvedValue({
      id: "cs_pack", mode: "payment", payment_status: "paid", client_reference_id: clinicId,
      customer: "cus_clinic", metadata: { clinic_id: clinicId, credits: "100", kind: "credit_pack" },
    } as never);
    vi.spyOn(stripe.checkout.sessions, "listLineItems").mockResolvedValue({
      data: [{ price: { id: "price_pack_100" }, quantity: 1 }],
    } as never);
    const rpc = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { stripe_customer_id: "cus_clinic" } }) }) }) }), rpc };
    const payload = JSON.stringify({ id: "evt_pack", type: "checkout.session.completed", data: { object: {
      id: "cs_pack", mode: "payment", metadata: { kind: "credit_pack" },
    } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    try {
      const response = await handleStripeWebhook(new Request("https://example.test/api/public/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": signature }, body: payload,
      }), db as never, stripe);
      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith("grant_extra_credits", {
        p_clinic_id: clinicId, p_reference: "stripe:cs_pack", p_units: 100,
      });
    } finally {
      if (previousSecret === undefined) delete process.env["STRIPE_WEBHOOK_SECRET"];
      else process.env["STRIPE_WEBHOOK_SECRET"] = previousSecret;
      if (previousPrice === undefined) delete process.env["STRIPE_PACK_PRICE_100"];
      else process.env["STRIPE_PACK_PRICE_100"] = previousPrice;
    }
  });
});
