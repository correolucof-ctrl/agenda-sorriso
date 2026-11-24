// Optional AI wording for free-form agent replies. Scheduling never depends on it.
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { stripEmojis } from "@/lib/agent-core";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6.1-sol";

const SAFETY_RULES = `Você redige mensagens de WhatsApp do assistente virtual de uma clínica odontológica de DEMONSTRAÇÃO.
Regras obrigatórias:
- Escreva em português brasileiro correto, tom cordial e profissional, no máximo 3 frases curtas.
- Nunca use emojis.
- Use somente os fatos fornecidos. Não invente horários, datas, preços, convênios, nomes ou serviços.
- Nunca faça diagnóstico, nunca sugira medicamentos, dosagens ou tratamentos, nunca diga se algo "é normal".
- Se a pessoa pedir orientação clínica, diga que só um dentista pode avaliar em consulta e ofereça agendar.
- Não diga que é humano. Não prometa retorno em prazo específico.
- Responda apenas com o texto final da mensagem, sem aspas.`;

export async function polishReply(input: { patientText: string; draft: string; facts: string }): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: SAFETY_RULES,
      messages: [
        {
          role: "user",
          content: `Fatos da clínica:\n${input.facts}\n\nMensagem do paciente:\n${input.patientText}\n\nRascunho de resposta (mantenha o sentido e os fatos, melhore a naturalidade):\n${input.draft}`,
        },
      ],
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const text = stripEmojis((await result.text).trim());
    if (!text || text.length > 900) return null;
    // Reject any time or price the model introduced that isn't in the facts or draft.
    const allowed = `${input.facts}\n${input.draft}`;
    const tokens = text.match(/\b\d{1,2}:\d{2}\b|R\$\s?\d[\d.,]*/g) ?? [];
    if (tokens.some((tk) => !allowed.includes(tk))) return null;
    if (/\b(diagn[oó]stic|antibi[oó]tic|ibuprofeno|paracetamol|dipirona|amoxicilina|tome |tomar )/i.test(text)) return null;
    return text;
  } catch (error) {
    console.error("[ai] polishReply failed", error instanceof Error ? error.message : error);
    return null;
  }
}
