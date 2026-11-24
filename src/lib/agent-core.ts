// Pure, deterministic language helpers for the simulated attendance agent.
import { addDays, weekdayOf } from "./time";

export type Intent =
  | "urgencia"
  | "humano"
  | "agendar"
  | "remarcar"
  | "cancelar"
  | "confirmar_presenca"
  | "duvida"
  | "saudacao"
  | "agradecimento"
  | "desconhecido";

export const INTENT_LABELS: Record<Intent, string> = {
  urgencia: "Urgência",
  humano: "Pedido de atendente",
  agendar: "Agendar",
  remarcar: "Remarcar",
  cancelar: "Cancelar",
  confirmar_presenca: "Confirmar presença",
  duvida: "Dúvida",
  saudacao: "Saudação",
  agradecimento: "Agradecimento",
  desconhecido: "Não identificada",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}:/\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const URGENCY_PATTERNS = [
  /dor (muito |bem |mt )?(forte|intensa|insuportavel|demais|terrivel|horrivel)/,
  /muita dor/,
  /(muito|bastante) dolorid/,
  /sangr/,
  /inchad|inchaco|inchando|inchar|inchou/,
  /febre/,
  /\bpus\b/,
  /abscesso/,
  /trauma|acidente|levei uma pancada|bati (o|a|meu|minha) (dente|rosto|boca)/,
  /(quebr|trinc|lasc)\w* (o |um |meu )?dente|dente (quebr|caiu|saiu|mole|amolec)/,
  /urgen|emergen/,
  /nao (consigo|aguento)\b.*\b(dor|abrir a boca|engolir|respirar|dormir)/,
  /dificuldade (para|pra|de) (respirar|engolir|abrir a boca)/,
];

export function detectUrgency(text: string): boolean {
  const t = normalize(text);
  return URGENCY_PATTERNS.some((re) => re.test(t));
}

export type FaqTopic =
  | "endereco"
  | "horario_funcionamento"
  | "servicos"
  | "preco"
  | "convenio"
  | "pagamento"
  | "clinica";

export function detectFaqTopic(text: string): FaqTopic | null {
  const t = normalize(text);
  if (/remedio|medicamento|antibiotico|analgesico|anti inflamatorio|posso tomar|e normal|o que (pode ser|e isso)|sensibilidade|gengiva|dente doendo|doi quando|esta doendo|ta doendo/.test(t))
    return "clinica";
  if (/endereco|onde fica|onde voces ficam|localiza|como chego|fica onde/.test(t)) return "endereco";
  if (/horario de (funcionamento|atendimento)|que horas (abre|fecha|funciona|voces abrem)|abre (no|aos|de|sabado|domingo)|funciona (no|aos|de|sabado|domingo)|esta aberto|estao abertos|atendem (no|aos|sabado|domingo)/.test(t))
    return "horario_funcionamento";
  if (/quais (servicos|tratamentos|procedimentos)|que (servicos|tratamentos)|o que voces fazem|servicos/.test(t)) return "servicos";
  if (/preco|valor|quanto custa|custa quanto|orcamento|quanto fica|quanto e/.test(t)) return "preco";
  if (/convenio|plano odontologico|plano de saude|aceita (plano|convenio)|aceitam (plano|convenio)/.test(t)) return "convenio";
  if (/pagamento|\bpix\b|cartao|parcel|dinheiro|boleto/.test(t)) return "pagamento";
  return null;
}

const BOOKING_VERB = /\b(agend\w*|marc\w*|reserv\w*|quero|queria|gostaria|preciso|precisava|tem (horario|vaga)|teria (horario|vaga)|disponib\w*|vaga)\b/;

export function classifyIntent(text: string): Intent {
  const t = normalize(text);
  if (!t) return "desconhecido";
  if (detectUrgency(t)) return "urgencia";
  if (/(falar|conversar) com (um |uma |o |a |alguem )?(atendente|humano|pessoa|recepcao|secretaria|alguem)|\batendente\b|\bhumano\b|pessoa de verdade/.test(t))
    return "humano";
  if (/remarc|reagend|(mudar|trocar|alterar) (o |a |meu |minha )?(horario|consulta|data|dia)|adiar|outro (dia|horario) para (a |minha )?consulta/.test(t))
    return "remarcar";
  if (/cancel|desmarc|nao (vou|poderei|posso|consigo) (mais )?(ir|comparecer)/.test(t)) return "cancelar";
  const faq = detectFaqTopic(t);
  if (faq && (faq === "clinica" || !/\b(agend\w*|marc\w*)\b/.test(t))) return "duvida";
  if (/\b(agend\w*|marcar|marca|marcacao)\b/.test(t)) return "agendar";
  if (BOOKING_VERB.test(t) && /(consulta|horario|avaliacao|limpeza|clareamento|restaura|manutencao|aparelho|dentista|atendimento)/.test(t))
    return "agendar";
  if (/^(sim|confirmo|confirmado|confirmar|pode confirmar|vou sim|estarei)\b/.test(t)) return "confirmar_presenca";
  if (/obrigad|valeu|agradec/.test(t)) return "agradecimento";
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hello|alo)\b/.test(t)) return "saudacao";
  if (text.trim().endsWith("?")) return "duvida";
  return "desconhecido";
}

const SERVICE_SYNONYMS: Array<[RegExp, RegExp]> = [
  [/avalia/, /avalia|consulta de rotina|check ?up|revisao|primeira consulta|olhar os dentes/],
  [/limpeza|profilaxia/, /limpeza|limpar|profilaxia|tartaro/],
  [/restaura/, /restaura|obtura|carie|chumbo/],
  [/manuten|aparelho|ortodon/, /aparelho|ortodon|manutencao/],
  [/clarea/, /clarea|clarear|branque/],
];

export function matchService<T extends { id: string; name: string }>(text: string, services: T[]): T | null {
  const t = normalize(text);
  for (const s of services) {
    const name = normalize(s.name);
    if (t.includes(name)) return s;
  }
  for (const s of services) {
    const name = normalize(s.name);
    for (const [nameRe, textRe] of SERVICE_SYNONYMS) {
      if (nameRe.test(name) && textRe.test(t)) return s;
    }
  }
  for (const s of services) {
    const tokens = normalize(s.name).split(" ").filter((w) => w.length > 4);
    if (tokens.some((w) => t.includes(w.slice(0, 6)))) return s;
  }
  return null;
}

const ORDINALS: Array<[RegExp, number]> = [
  [/\bprimeir[ao]\b/, 1],
  [/\bsegund[ao] (opcao|horario|op)\b|^a segunda$|^segunda opcao$/, 2],
  [/\bterceir[ao]\b/, 3],
  [/\bquart[ao] (opcao|horario)\b|^a quarta$/, 4],
  [/\bquint[ao] (opcao|horario)\b/, 5],
];

/** Returns a 1-based option number chosen by the patient, or null. */
export function parseChoice(text: string, max: number): number | null {
  const t = normalize(text);
  let n: number | null = null;
  const alone = t.match(/^(?:a |o )?(?:opcao |numero |n )?(\d{1,2})(?: opcao)?$/);
  if (alone) n = Number(alone[1]);
  if (n === null) {
    const m = t.match(/\b(?:opcao|numero|alternativa)\s*(\d{1,2})\b/);
    if (m) n = Number(m[1]);
  }
  if (n === null) {
    for (const [re, v] of ORDINALS) if (re.test(t)) n = v;
  }
  if (n === null && /\bultim[ao]\b/.test(t)) n = max;
  if (n === null || n < 1 || n > max) return null;
  return n;
}

/** Explicit time in the message, as minutes since midnight. */
export function parseTime(text: string): number | null {
  const t = normalize(text);
  const m = t.match(/\b(\d{1,2})(?::(\d{2})|h(\d{2})?|\s?horas?)\b/) ?? t.match(/\bas (\d{1,2})\b/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  if (h < 6 || h > 22 || min > 59) return null;
  return h * 60 + min;
}

const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(?! (opcao|horario|op\b))(?:[ -]feira)?\b/, 1],
  [/\bterca\b/, 2],
  [/\bquarta(?! (opcao|horario))(?:[ -]feira)?\b/, 3],
  [/\bquinta(?! (opcao|horario))(?:[ -]feira)?\b/, 4],
  [/\bsexta\b/, 5],
  [/\bsabado\b/, 6],
];

/** Date mentioned by the patient (business-local YYYY-MM-DD), relative to `today`. */
export function parseDatePreference(text: string, today: string): string | null {
  const t = normalize(text);
  if (/depois de amanha/.test(t)) return addDays(today, 2);
  if (/\bamanha\b/.test(t)) return addDays(today, 1);
  if (/\bhoje\b/.test(t)) return today;
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  if (dm) {
    const d = Number(dm[1]);
    const m = Number(dm[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let y = ty;
      if (m < tm || (m === tm && d < td)) y += 1;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = Number(dia[1]);
    if (d >= 1 && d <= 31) {
      let y = ty;
      let m = tm;
      if (d < td) {
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  for (const [re, wd] of WEEKDAY_WORDS) {
    if (re.test(t)) {
      const cur = weekdayOf(today);
      let diff = (wd - cur + 7) % 7;
      if (diff === 0) diff = 7;
      return addDays(today, diff);
    }
  }
  return null;
}

export type Period = "manha" | "tarde";

export function parsePeriod(text: string): Period | null {
  const t = normalize(text);
  if (/\bmanha\b|\bcedo\b/.test(t)) return "manha";
  if (/\btarde\b|\bnoite\b|depois do almoco/.test(t)) return "tarde";
  return null;
}

export function isYes(text: string): boolean {
  const t = normalize(text);
  if (/\bnao\b/.test(t)) return false;
  return /^(sim|s|isso|isso mesmo|pode|pode ser|confirmo|confirmar|confirmado|ok|okay|certo|claro|perfeito|fechado|beleza|correto|positivo|quero|pode confirmar|pode marcar|esse mesmo|esse)\b/.test(t);
}

export function isNo(text: string): boolean {
  const t = normalize(text);
  return /^(nao|n|negativo|nenhum|nenhuma|prefiro outro|outro|outra)\b/.test(t) || /\bnao (quero|posso|serve|da)\b/.test(t);
}

export function wantsOtherOptions(text: string): boolean {
  const t = normalize(text);
  return /outr[oa]s? (horario|opcao|opcoes|dia|data)|mais (opcoes|horarios)|nenhum|nao (serve|da|posso) (nesses|esses|nenhum)|tem outro|tem mais/.test(t);
}

export function stripEmojis(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]+\n/g, "\n").trim();
}

export const URGENCY_REPLY =
  "Sinto muito que você esteja passando por isso. Sou um assistente virtual e não consigo avaliar sintomas nem indicar tratamento. Se a dor estiver muito forte, houver sangramento que não para, inchaço no rosto, febre ou dificuldade para respirar ou engolir, procure agora um serviço de urgência ou pronto atendimento. Em caso de emergência, ligue 192 (SAMU). Estou transferindo sua conversa para a nossa equipe, que vai responder assim que possível.";

export const CLINICAL_REPLY =
  "Não consigo dar orientação clínica por aqui: só um dentista pode avaliar o seu caso em consulta. Posso procurar um horário de avaliação para você? Se o desconforto estiver forte ou piorando, procure um serviço de urgência.";

/** Professional explicitly named in the message ("com a Dra. Helena"). */
export function matchProfessional<T extends { id: string; name: string }>(text: string, professionals: T[]): T | null {
  const t = ` ${normalize(text)} `;
  for (const p of professionals) {
    const tokens = normalize(p.name)
      .split(" ")
      .filter((w) => w.length > 3 && !["dra", "dr", "doutor", "doutora"].includes(w));
    if (tokens.some((w) => t.includes(` ${w} `))) return p;
  }
  return null;
}
