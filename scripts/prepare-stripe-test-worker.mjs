import fs from "node:fs/promises";

const path = ".output/server/wrangler.json";
const config = JSON.parse(await fs.readFile(path, "utf8"));
const prices = JSON.parse(await fs.readFile("config/stripe-test-prices.json", "utf8"));
const vars = { ...config.vars, STRIPE_LIVE_ENABLED: "false" };
for (const [plan, periods] of Object.entries(prices)) {
  if (plan === "credit_packs") continue;
  for (const [period, id] of Object.entries(periods)) {
    if (!/^price_[a-zA-Z0-9]+$/.test(id)) throw new Error(`ID de preço inválido: ${plan}/${period}`);
    vars[`STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`] = id;
  }
}
for (const [credits, id] of Object.entries(prices.credit_packs ?? {})) {
  if (!/^(100|500|1000)$/.test(credits) || !/^price_[a-zA-Z0-9]+$/.test(id)) {
    throw new Error(`Preço de pacote inválido: ${credits}`);
  }
  vars[`STRIPE_PACK_PRICE_${credits}`] = id;
}
config.vars = vars;
await fs.writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
console.log("Configuração de preços da Stripe teste preparada para o Worker.");
