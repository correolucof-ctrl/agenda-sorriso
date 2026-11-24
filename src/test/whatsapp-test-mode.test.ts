import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gateDelivery } from "@/server/whatsapp-gate";
import { handleWhatsAppWebhook, type StoredEvent, type WaStore } from "@/server/whatsapp-webhook.server";
import { isAllowedNumber, normalizeWhatsAppDigits } from "@/lib/whatsapp-phone";

// Fictitious numbers only (no real customers).
const TEST_NUMBER = "5562900000001";
const STRANGER = "5562900000999";
const SECRET = "test-secret-not-real";

const messagePayload = (from: string, text = "Quero agendar uma limpeza") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "PNID" },
            contacts: [{ wa_id: from, profile: { name: "Contato" } }],
            messages: [{ id: `wamid.${from}`, from, timestamp: "1763668800", type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});

const statusPayload = (recipient: string) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.out", status: "delivered", recipient_id: recipient, timestamp: "1763668800" }] } }] }],
});

async function signedRequest(body: unknown, headers: Record<string, string> = {}, secret = SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("http://localhost/api/public/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-lovable-timestamp": ts, "x-lovable-signature": `sha256=${hex}`, ...headers },
    body: raw,
  });
}

function memoryStore(allowlist: string[]) {
  const rows = new Map<string, StoredEvent>();
  const store: WaStore = {
    loadAllowlist: async () => allowlist,
    saveEvent: vi.fn(async (e) => {
      const existing = rows.get(e.deliveryId);
      if (existing) return existing;
      const row: StoredEvent = { id: `row-${rows.size + 1}`, deliveryId: e.deliveryId, event: e.event, payload: e.payload, processedAt: null, attempts: 0 };
      rows.set(e.deliveryId, row);
      return row;
    }),
    markProcessed: async (id) => {
      for (const r of rows.values()) if (r.id === id) r.processedAt = new Date().toISOString();
    },
    markPending: async (id, _e, attempts) => {
      for (const r of rows.values()) if (r.id === id) r.attempts = attempts;
    },
    listDue: async () => [],
  };
  return { store, rows };
}

describe("números de WhatsApp", () => {
  it("normaliza e reconhece o mesmo celular com e sem o nono dígito", () => {
    expect(normalizeWhatsAppDigits("+55 (62) 90000-0001")).toBe(TEST_NUMBER);
    expect(isAllowedNumber("556200000001", [TEST_NUMBER])).toBe(true);
    expect(isAllowedNumber(STRANGER, [TEST_NUMBER])).toBe(false);
  });
  it("lista vazia não autoriza ninguém", () => {
    expect(isAllowedNumber(TEST_NUMBER, [])).toBe(false);
  });
});

describe("filtro do modo de teste (antes de gravar)", () => {
  it("descarta mensagem de remetente não autorizado", () => {
    expect(gateDelivery("whatsapp.message", messagePayload(STRANGER), [TEST_NUMBER])).toEqual({ action: "discard", reason: "unauthorized_sender" });
  });
  it("com a lista vazia, descarta até o número de teste", () => {
    expect(gateDelivery("whatsapp.message", messagePayload(TEST_NUMBER), []).action).toBe("discard");
  });
  it("guarda só a mensagem e o contato do número autorizado", () => {
    const mixed = messagePayload(TEST_NUMBER);
    const value = mixed.entry[0]!.changes[0]!.value;
    value.messages.push({ id: "wamid.x", from: STRANGER, timestamp: "1", type: "text", text: { body: "cliente da loja" } });
    value.contacts.push({ wa_id: STRANGER, profile: { name: "Cliente" } });
    const r = gateDelivery("whatsapp.message", mixed, [TEST_NUMBER]);
    expect(r.action).toBe("store");
    const stored = JSON.stringify(r.action === "store" ? r.payload : {});
    expect(stored).not.toContain(STRANGER);
    expect(stored).not.toContain("cliente da loja");
    expect(stored).toContain(TEST_NUMBER);
  });
  it("status de entrega só é guardado para destinatário autorizado", () => {
    expect(gateDelivery("whatsapp.status", statusPayload(STRANGER), [TEST_NUMBER]).action).toBe("discard");
    expect(gateDelivery("whatsapp.status", statusPayload(TEST_NUMBER), [TEST_NUMBER]).action).toBe("store");
  });
  it("histórico, mensagens enviadas pelo celular da loja e contatos nunca são guardados", () => {
    for (const ev of ["whatsapp.history", "whatsapp.smb_message_echoes", "whatsapp.smb_app_state_sync", "whatsapp.algo_novo"]) {
      expect(gateDelivery(ev, { entry: [] }, [TEST_NUMBER]).action).toBe("discard");
    }
  });
});

describe("receptor assinado", () => {
  it("sem a conexão vinculada, não processa nada", async () => {
    const { store } = memoryStore([TEST_NUMBER]);
    const process = vi.fn();
    const res = await handleWhatsAppWebhook(await signedRequest(messagePayload(TEST_NUMBER)), { secret: undefined, store, process });
    expect(res.status).toBe(401);
    expect(store.saveEvent).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });
  it("recusa assinatura inválida", async () => {
    const { store } = memoryStore([TEST_NUMBER]);
    const req = await signedRequest(messagePayload(TEST_NUMBER), { "x-lovable-delivery": "d1", "x-lovable-event": "whatsapp.message" }, "outra-chave");
    const res = await handleWhatsAppWebhook(req, { secret: SECRET, store, process: vi.fn() });
    expect(res.status).toBe(401);
    expect(store.saveEvent).not.toHaveBeenCalled();
  });
  it("remetente não autorizado: responde 200, não grava e não aciona o agente", async () => {
    const { store, rows } = memoryStore([TEST_NUMBER]);
    const process = vi.fn();
    const req = await signedRequest(messagePayload(STRANGER), { "x-lovable-delivery": "d2", "x-lovable-event": "whatsapp.message" });
    const res = await handleWhatsAppWebhook(req, { secret: SECRET, store, process });
    expect(res.status).toBe(200);
    expect(store.saveEvent).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    expect(process).not.toHaveBeenCalled();
  });
  it("remetente autorizado: grava e processa uma única vez, mesmo com reenvio", async () => {
    const { store, rows } = memoryStore([TEST_NUMBER]);
    const process = vi.fn(async () => {});
    const headers = { "x-lovable-delivery": "d3", "x-lovable-event": "whatsapp.message" };
    const first = await handleWhatsAppWebhook(await signedRequest(messagePayload(TEST_NUMBER)), { secret: SECRET, store, process });
    expect(first.status).toBe(400); // missing delivery headers
    const ok = await handleWhatsAppWebhook(await signedRequest(messagePayload(TEST_NUMBER), headers), { secret: SECRET, store, process });
    expect(ok.status).toBe(200);
    const again = await handleWhatsAppWebhook(await signedRequest(messagePayload(TEST_NUMBER), headers), { secret: SECRET, store, process });
    expect(again.status).toBe(200);
    expect(process).toHaveBeenCalledTimes(1);
    expect(rows.get("d3")?.processedAt).not.toBeNull();
  });
  it("falha no processamento fica pendente e pede nova tentativa", async () => {
    const { store, rows } = memoryStore([TEST_NUMBER]);
    const process = vi.fn(async () => {
      throw new Error("falha temporária");
    });
    const req = await signedRequest(messagePayload(TEST_NUMBER), { "x-lovable-delivery": "d4", "x-lovable-event": "whatsapp.message" });
    const res = await handleWhatsAppWebhook(req, { secret: SECRET, store, process });
    expect(res.status).toBe(503);
    expect(rows.get("d4")?.processedAt).toBeNull();
    expect(rows.get("d4")?.attempts).toBe(1);
  });
});

describe("administrador único", () => {
  const cleanup = readFileSync(path.resolve(__dirname, "../../standalone/0009_platform_admin_legacy_cleanup.sql"), "utf8");
  it("remove o gatilho legado de concessão automática", () => {
    expect(cleanup).toContain("drop trigger if exists on_auth_user_confirmed_grant_admin");
  });
  it("o papel administrativo depende da plataforma e de e-mail confirmado", () => {
    expect(cleanup).toContain("public.platform_administrators");
    expect(cleanup).toContain("u.email_confirmed_at is not null");
  });
});
