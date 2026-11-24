import { gateDelivery } from "./whatsapp-gate";
import { runStoredEvent, type ProcessFn, type WaStore } from "./whatsapp-webhook.server";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
type Obj = Record<string, unknown>;
const obj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

async function verifySignature(raw: Uint8Array, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const hex = header.slice(7);
  const bytes = new Uint8Array(hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
  return crypto.subtle.verify("HMAC", key, bytes, new Uint8Array(raw).buffer);
}

async function deliveryId(event: string, payload: Obj): Promise<string> {
  const entry = Array.isArray(payload["entry"]) ? payload["entry"][0] : null;
  const change = obj(entry) && Array.isArray(entry["changes"]) ? entry["changes"][0] : null;
  const value = obj(change) ? change["value"] : null;
  const items = obj(value) ? value[event === "whatsapp.message" ? "messages" : "statuses"] : null;
  const item = Array.isArray(items) ? items[0] : null;
  if (!obj(item) || typeof item["id"] !== "string") throw new Error("Evento da Meta sem identificador");
  const phoneId = obj(value) && obj(value["metadata"]) ? value["metadata"]["phone_number_id"] : null;
  const stable = event === "whatsapp.message" ? [event, phoneId, item["id"]] : [event, phoneId, item["id"], item["status"], item["recipient_id"]];
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(stable))));
  return `meta-${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Splits Meta batches so the existing inbox can deduplicate each message or status. */
function splitEvents(payload: unknown, expectedPhoneId?: string): Array<{ event: string; payload: Obj; phoneId: string }> {
  if (!obj(payload) || payload["object"] !== "whatsapp_business_account" || !Array.isArray(payload["entry"])) return [];
  const result: Array<{ event: string; payload: Obj; phoneId: string }> = [];
  for (const entry of payload["entry"]) {
    if (!obj(entry) || !Array.isArray(entry["changes"])) continue;
    for (const change of entry["changes"]) {
      if (!obj(change) || !obj(change["value"]) || change["field"] !== "messages") continue;
      const value = change["value"];
      if (!obj(value["metadata"]) || typeof value["metadata"]["phone_number_id"] !== "string") continue;
      const phoneId = value["metadata"]["phone_number_id"] as string;
      if (expectedPhoneId && phoneId !== expectedPhoneId) continue;
      for (const [key, event] of [["messages", "whatsapp.message"], ["statuses", "whatsapp.status"]] as const) {
        if (!Array.isArray(value[key])) continue;
        for (const item of value[key]) {
          if (!obj(item)) continue;
          const contacts = Array.isArray(value["contacts"]) ? value["contacts"] : [];
          const oneValue: Obj = { messaging_product: value["messaging_product"], metadata: value["metadata"], [key]: [item] };
          if (key === "messages") oneValue["contacts"] = contacts.filter((contact) => obj(contact) && contact["wa_id"] === item["from"]);
          result.push({ event, phoneId, payload: { object: payload["object"], entry: [{ id: entry["id"], changes: [{ field: "messages", value: oneValue }] }] } });
        }
      }
    }
  }
  return result;
}

export function verifyMetaChallenge(request: Request, verifyToken: string | undefined): Response {
  const url = new URL(request.url);
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (!verifyToken || url.searchParams.get("hub.mode") !== "subscribe" || token !== verifyToken || !challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handleMetaWebhook(request: Request, deps: { appSecret?: string; phoneId?: string; store?: WaStore; process?: ProcessFn; isConnectedNumber?: (phoneId: string) => Promise<boolean> }): Promise<Response> {
  const { appSecret, phoneId, store, process, isConnectedNumber } = deps;
  if (!appSecret || (!phoneId && !isConnectedNumber) || !store || !process) return new Response("Not configured", { status: 401 });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret))) return new Response("Invalid signature", { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  const events = splitEvents(payload, phoneId);
  if (!events.length) return Response.json({ received: true, stored: 0 });
  let allowed: string[] = [];
  if (!isConnectedNumber) {
    try { allowed = await store.loadAllowlist(); }
    catch { return new Response("Inbox unavailable", { status: 503 }); }
  }
  let saved = 0;
  let failed = false;
  for (const event of events) {
    try {
      if (isConnectedNumber && !(await isConnectedNumber(event.phoneId))) continue;
      const gated = isConnectedNumber ? event.payload : gateDelivery(event.event, event.payload, allowed);
      if ("action" in gated && gated.action !== "store") continue;
      const payload = ("action" in gated ? gated.payload : gated) as Obj;
      const row = await store.saveEvent({ deliveryId: await deliveryId(event.event, payload), event: event.event, payload });
      saved++;
      if (!row.processedAt && !(await runStoredEvent(store, process, row, Date.now() + 4000))) failed = true;
    } catch { failed = true; }
  }
  return Response.json({ received: true, stored: saved, processed: !failed }, { status: failed ? 503 : 200 });
}
