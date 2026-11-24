// Direct Meta Cloud API and pay-per-use transcription. Server-only credentials.
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function metaConfig() {
  const token = process.env["META_WHATSAPP_ACCESS_TOKEN"];
  const phoneId = process.env["META_WHATSAPP_PHONE_NUMBER_ID"];
  const version = process.env["META_GRAPH_API_VERSION"] ?? "v27.0";
  if (!token || !phoneId) throw new Error("Meta WhatsApp não configurado");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneId)) throw new Error("Configuração da Meta inválida");
  return { token, phoneId, base: `https://graph.facebook.com/${version}` };
}

export type SendOutcome =
  | { kind: "accepted"; waMessageId: string }
  | { kind: "rejected"; status: number; body: string; retryable: boolean }
  | { kind: "unknown"; error: string };

export async function sendWhatsAppText(toDigits: string, body: string, clinic?: { phoneId: string; token: string }): Promise<SendOutcome> {
  // An explicit switch prevents a deploy or credential setup from sending messages.
  if (process.env["META_WHATSAPP_SEND_ENABLED"] !== "true") {
    return { kind: "rejected", status: 403, body: "Envio real desativado", retryable: false };
  }
  const { token, phoneId, base } = clinic
    ? { ...clinic, base: `https://graph.facebook.com/${process.env["META_GRAPH_API_VERSION"] ?? "v27.0"}` }
    : metaConfig();
  let response: Response;
  try {
    response = await fetch(`${base}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toDigits, type: "text", text: { body: body.slice(0, 4000) } }),
    });
  } catch (error) {
    return { kind: "unknown", error: error instanceof Error ? error.message : String(error) };
  }
  const text = await response.text();
  if (!response.ok) {
    // A 5xx can still have accepted the message; do not automatically resend it.
    if (response.status >= 500) return { kind: "unknown", error: `Meta HTTP ${response.status}` };
    return { kind: "rejected", status: response.status, body: text.slice(0, 1000), retryable: response.status === 429 };
  }
  try {
    const id = (JSON.parse(text) as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
    if (id) return { kind: "accepted", waMessageId: id };
  } catch { /* malformed response */ }
  return { kind: "unknown", error: "Meta respondeu sem identificador de mensagem" };
}

export async function sendWhatsAppReminder(input: {
  toDigits: string; dateTime: string; phoneId: string; token: string;
  templateName: string; language: string;
}): Promise<SendOutcome> {
  if (process.env["META_WHATSAPP_SEND_ENABLED"] !== "true")
    return { kind: "rejected", status: 403, body: "Envio real desativado", retryable: false };
  if (!/^\d{5,30}$/.test(input.phoneId) || !/^[a-z0-9_]{2,100}$/.test(input.templateName) || !/^\w{2,5}(?:_\w{2,5})?$/.test(input.language)) {
    return { kind: "rejected", status: 400, body: "Modelo de lembrete inválido", retryable: false };
  }
  const version = process.env["META_GRAPH_API_VERSION"] ?? "v27.0";
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${input.phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: input.toDigits, type: "template",
        template: { name: input.templateName, language: { code: input.language }, components: [{ type: "body", parameters: [{ type: "text", text: input.dateTime }] }] } }),
    });
  } catch (e) { return { kind: "unknown", error: e instanceof Error ? e.message : String(e) }; }
  const body = await response.text();
  if (!response.ok) {
    if (response.status >= 500) return { kind: "unknown", error: `Meta HTTP ${response.status}` };
    return { kind: "rejected", status: response.status, body: body.slice(0, 1000), retryable: response.status === 429 };
  }
  try {
    const id = (JSON.parse(body) as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
    if (id) return { kind: "accepted", waMessageId: id };
  } catch { /* invalid body */ }
  return { kind: "unknown", error: "Meta aceitou sem identificador" };
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("Resposta de mídia vazia");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Áudio acima do limite de tamanho");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

export async function downloadWhatsAppMedia(mediaId: string, clinic?: { phoneId: string; token: string }): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!/^\d+$/.test(mediaId)) throw new Error("ID de mídia inválido");
  const { token, base } = clinic
    ? { ...clinic, base: `https://graph.facebook.com/${process.env["META_GRAPH_API_VERSION"] ?? "v27.0"}` }
    : metaConfig();
  const meta = await fetch(`${base}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) throw new Error(`Falha ao consultar mídia [${meta.status}]`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("Mídia sem endereço de download");
  if (typeof info.file_size === "number" && info.file_size > MAX_AUDIO_BYTES) throw new Error("Áudio acima do limite de tamanho");
  const url = new URL(info.url);
  if (url.protocol !== "https:" || !(url.hostname === "lookaside.fbsbx.com" || url.hostname === "graph.facebook.com")) {
    throw new Error("Host de mídia inesperado");
  }
  const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) throw new Error(`Falha ao baixar mídia [${file.status}]`);
  const bytes = await readLimited(file, MAX_AUDIO_BYTES);
  return { bytes, mimeType: (file.headers.get("content-type") ?? info.mime_type ?? "audio/ogg").split(";")[0]!.trim() };
}

export async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Transcrição não configurada");
  if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("Tamanho de áudio inválido");
  const type = mimeType.startsWith("audio/") ? mimeType : "audio/ogg";
  const ext = type.split("/")[1]?.replace("mpeg", "mp3") ?? "ogg";
  const form = new FormData();
  form.append("model", process.env["OPENAI_TRANSCRIBE_MODEL"] ?? "gpt-4o-mini-transcribe");
  form.append("file", new File([bytes.slice().buffer as ArrayBuffer], `audio.${ext}`, { type }));
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  });
  if (!response.ok) throw new Error(`Transcrição falhou [${response.status}]`);
  const result = (await response.json()) as { text?: string };
  const text = result.text?.trim();
  if (!text) throw new Error("Transcrição vazia");
  return text;
}
