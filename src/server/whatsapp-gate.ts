// Restricted test mode gate. Runs right after signature verification and BEFORE anything is
// stored: deliveries that do not concern an authorized test number are discarded whole.
import { isAllowedNumber } from "@/lib/whatsapp-phone";

export type GateResult =
  | { action: "discard"; reason: "unauthorized_sender" | "unauthorized_recipient" | "not_used_in_test_mode" | "malformed" }
  | { action: "store"; payload: Record<string, unknown> };

// Account-level notices: no customer content, needed to stop sending when the account is disabled.
const NON_PERSONAL_EVENTS = new Set(["whatsapp.account_update", "whatsapp.template_status", "whatsapp.message_error"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function firstChange(payload: unknown): { entry: Obj; change: Obj; value: Obj } | null {
  if (!isObj(payload) || !Array.isArray(payload["entry"])) return null;
  const entry = payload["entry"][0];
  if (!isObj(entry) || !Array.isArray(entry["changes"])) return null;
  const change = entry["changes"][0];
  if (!isObj(change) || !isObj(change["value"])) return null;
  return { entry, change, value: change["value"] };
}

function rebuild(payload: Obj, entry: Obj, change: Obj, value: Obj): Obj {
  return { object: payload["object"], entry: [{ id: entry["id"], changes: [{ field: change["field"], value }] }] };
}

export function gateDelivery(event: string, payload: unknown, allowlist: readonly string[]): GateResult {
  if (event === "whatsapp.message") {
    const parts = firstChange(payload);
    if (!parts || !isObj(payload)) return { action: "discard", reason: "malformed" };
    const messages = Array.isArray(parts.value["messages"]) ? parts.value["messages"] : [];
    const kept = messages.filter((m) => isObj(m) && isAllowedNumber(m["from"], allowlist));
    if (kept.length === 0) return { action: "discard", reason: "unauthorized_sender" };
    const contacts = Array.isArray(parts.value["contacts"]) ? parts.value["contacts"] : [];
    const value: Obj = {
      messaging_product: parts.value["messaging_product"],
      metadata: parts.value["metadata"],
      contacts: contacts.filter((c) => isObj(c) && isAllowedNumber(c["wa_id"], allowlist)),
      messages: kept,
    };
    return { action: "store", payload: rebuild(payload, parts.entry, parts.change, value) };
  }
  if (event === "whatsapp.status") {
    const parts = firstChange(payload);
    if (!parts || !isObj(payload)) return { action: "discard", reason: "malformed" };
    const statuses = Array.isArray(parts.value["statuses"]) ? parts.value["statuses"] : [];
    const kept = statuses.filter((s) => isObj(s) && isAllowedNumber(s["recipient_id"], allowlist));
    if (kept.length === 0) return { action: "discard", reason: "unauthorized_recipient" };
    const value: Obj = { messaging_product: parts.value["messaging_product"], metadata: parts.value["metadata"], statuses: kept };
    return { action: "store", payload: rebuild(payload, parts.entry, parts.change, value) };
  }
  if (NON_PERSONAL_EVENTS.has(event) && isObj(payload)) return { action: "store", payload };
  // Message echoes, chat history, phone contacts and any other change can carry store
  // customers' data: never stored in test mode.
  return { action: "discard", reason: "not_used_in_test_mode" };
}
