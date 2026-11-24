import { describe, expect, it, vi } from "vitest";
import { handleMetaWebhook, verifyMetaChallenge } from "@/server/meta-webhook.server";
import { sendWhatsAppText, transcribeAudio } from "@/server/whatsapp-gateway.server";
import type { StoredEvent, WaStore } from "@/server/whatsapp-webhook.server";

const secret = "fictitious-app-secret";
const allowed = "5562900000001";

async function signed(payload: unknown, signingKey = secret): Promise<Request> {
  const raw = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://example.test/api/public/whatsapp/webhook", { method: "POST", headers: { "x-hub-signature-256": `sha256=${hex}` }, body: raw });
}

function payload(from: string) {
  return { object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "123456" }, contacts: [{ wa_id: from }],
    messages: [{ id: "wamid.test", from, type: "text", text: { body: "Olá" } }],
  } }] }] };
}

function store() {
  const rows = new Map<string, StoredEvent>();
  const result: WaStore = {
    loadAllowlist: vi.fn(async () => [allowed]),
    saveEvent: vi.fn(async (event) => {
      const existing = rows.get(event.deliveryId);
      if (existing) return existing;
      const row: StoredEvent = { id: event.deliveryId, deliveryId: event.deliveryId, event: event.event, payload: event.payload, processedAt: null, attempts: 0 };
      rows.set(event.deliveryId, row);
      return row;
    }),
    markProcessed: async (id) => { rows.get(id)!.processedAt = new Date().toISOString(); },
    markPending: async () => {},
    listDue: async () => [],
  };
  return { result, rows };
}

describe("Meta Cloud API", () => {
  it("aceita apenas a verificação com token correto", () => {
    const url = "https://example.test/api/public/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=123";
    expect(verifyMetaChallenge(new Request(url), "abc").status).toBe(200);
    expect(verifyMetaChallenge(new Request(url), "wrong").status).toBe(403);
  });
  it("recusa assinatura inválida antes de ler a lista ou salvar", async () => {
    const { result } = store();
    const response = await handleMetaWebhook(await signed(payload(allowed), "wrong"), { appSecret: secret, phoneId: "123456", store: result, process: vi.fn() });
    expect(response.status).toBe(401);
    expect(result.loadAllowlist).not.toHaveBeenCalled();
    expect(result.saveEvent).not.toHaveBeenCalled();
  });
  it("descarta remetente não autorizado e outro número empresarial", async () => {
    const { result } = store();
    const process = vi.fn();
    expect((await handleMetaWebhook(await signed(payload("5562900000999")), { appSecret: secret, phoneId: "123456", store: result, process })).status).toBe(200);
    expect((await handleMetaWebhook(await signed(payload(allowed)), { appSecret: secret, phoneId: "999999", store: result, process })).status).toBe(200);
    expect(result.saveEvent).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });
  it("salva e processa mensagem autorizada uma vez após reentrega", async () => {
    const { result, rows } = store();
    const process = vi.fn(async () => {});
    const deps = { appSecret: secret, phoneId: "123456", store: result, process };
    expect((await handleMetaWebhook(await signed(payload(allowed)), deps)).status).toBe(200);
    expect((await handleMetaWebhook(await signed(payload(allowed)), deps)).status).toBe(200);
    expect(rows.size).toBe(1);
    expect(process).toHaveBeenCalledTimes(1);
  });
  it("no modo de clínicas, aceita somente o número oficial conectado", async () => {
    const { result, rows } = store();
    const process = vi.fn(async () => {});
    const isConnectedNumber = vi.fn(async (id: string) => id === "123456");
    const deps = { appSecret: secret, store: result, process, isConnectedNumber };
    const unknown = payload("5562900000999");
    unknown.entry[0]!.changes[0]!.value.metadata.phone_number_id = "999999";
    expect((await handleMetaWebhook(await signed(unknown), deps)).status).toBe(200);
    expect(rows.size).toBe(0);
    expect((await handleMetaWebhook(await signed(payload("5562900000999")), deps)).status).toBe(200);
    expect(rows.size).toBe(1);
    expect(process).toHaveBeenCalledOnce();
    expect(result.loadAllowlist).not.toHaveBeenCalled();
  });
  it("não envia com a chave de ativação ausente", async () => {
    const old = process.env["META_WHATSAPP_SEND_ENABLED"];
    delete process.env["META_WHATSAPP_SEND_ENABLED"];
    const fetcher = vi.spyOn(globalThis, "fetch");
    try {
      expect((await sendWhatsAppText(allowed, "teste")).kind).toBe("rejected");
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
      if (old === undefined) delete process.env["META_WHATSAPP_SEND_ENABLED"];
      else process.env["META_WHATSAPP_SEND_ENABLED"] = old;
    }
  });
  it("envia áudio ao endpoint de transcrição com modelo por uso e lê o texto", async () => {
    const old = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "fictitious-test-key";
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ text: "Consulta amanhã às dez." }));
    try {
      const text = await transcribeAudio(new Uint8Array([1, 2, 3]), "audio/ogg");
      expect(text).toBe("Consulta amanhã às dez.");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, options] = fetcher.mock.calls[0]!;
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect((options?.body as FormData).get("model")).toBe("gpt-4o-mini-transcribe");
    } finally {
      fetcher.mockRestore();
      if (old === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = old;
    }
  });
});
