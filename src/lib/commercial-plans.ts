export type BillingPeriod = "monthly" | "annual";

export const COMMERCIAL_PLANS = [
  { id: "essencial", name: "Essencial", monthlyCents: 3000, annualCents: 30000, monthlyCredits: 300 },
  { id: "crescimento", name: "Crescimento", monthlyCents: 5000, annualCents: 50000, monthlyCredits: 800 },
  { id: "profissional", name: "Profissional", monthlyCents: 10000, annualCents: 100000, monthlyCredits: 2000 },
] as const;

export const CREDIT_PACKS = [
  { credits: 100, priceCents: 1500 },
  { credits: 500, priceCents: 6000 },
  { credits: 1000, priceCents: 10000 },
] as const;
export const ANNUAL_ACCESS_MONTHS = 12;
export const CREDIT_RULES = { processedMessage: 1, audioTranscription: 10 } as const;

export function priceFor(plan: typeof COMMERCIAL_PLANS[number], period: BillingPeriod) {
  return period === "annual" ? plan.annualCents : plan.monthlyCents;
}

export function annualSavings(plan: typeof COMMERCIAL_PLANS[number]) {
  return plan.monthlyCents * ANNUAL_ACCESS_MONTHS - plan.annualCents;
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(cents / 100);
}
