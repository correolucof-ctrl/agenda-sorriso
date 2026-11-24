import { describe, expect, it } from "vitest";
import { ANNUAL_ACCESS_MONTHS, annualSavings, COMMERCIAL_PLANS, CREDIT_PACKS, CREDIT_RULES, priceFor } from "@/lib/commercial-plans";

describe("Planos comerciais", () => {
  it.each([
    ["essencial", 3000, 30000],
    ["crescimento", 5000, 50000],
    ["profissional", 10000, 100000],
  ] as const)("%s mantém os preços mensal e anual definidos", (id, monthly, annual) => {
    const plan = COMMERCIAL_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error("Plano ausente");
    expect(priceFor(plan, "monthly")).toBe(monthly);
    expect(priceFor(plan, "annual")).toBe(annual);
  });
  it.each(COMMERCIAL_PLANS)("$name oferece 12 meses pelo preço de 10", (plan) => {
    expect(ANNUAL_ACCESS_MONTHS).toBe(12);
    expect(plan.annualCents).toBe(plan.monthlyCents * 10);
    expect(annualSavings(plan)).toBe(plan.monthlyCents * 2);
  });
  it("mantém as franquias iniciais mensais propostas", () => {
    expect(COMMERCIAL_PLANS.map((p) => p.monthlyCredits)).toEqual([300, 800, 2000]);
  });
  it.each([[100, 1500], [500, 6000], [1000, 10000]] as const)("pacote de %i créditos custa %i centavos", (credits, price) => {
    const pack = CREDIT_PACKS.find((p) => p.credits === credits);
    expect(pack?.priceCents).toBe(price);
  });
  it("define o custo de referência por resposta e minuto de áudio", () => {
    expect(CREDIT_RULES.processedMessage).toBe(1);
    expect(CREDIT_RULES.audioTranscription).toBe(10);
  });
});
