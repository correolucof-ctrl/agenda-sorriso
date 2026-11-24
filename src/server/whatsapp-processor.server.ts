// Processes stored (already allowlisted) WhatsApp deliveries: transcribes audio, runs the
// attendance agent and replies only to authorized test numbers. Every step is retry-safe.
import type { Json } from "@/integrations/supabase/types";
import { formatWhatsAppDigits, isAllowedNumber, normalizeWhatsAppDigits } from "@/lib/whatsapp-phone";
import type { DB } from "./booking.server";
import type { ProcessResult } from "./agent.server";
import type { SendOutcome } from "./whatsapp-gateway.server";
import type { ClinicNumber } from "./whatsapp-clinic.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export class DeferredError extends Error {}

export interface ProcessorDeps {
  db: DB;
  deadline: number;
  sendText: (toDigits: string, body: string, number?: ClinicNumber) => Promise<SendOutcome>;
  transcribe: (mediaId: string, number?: ClinicNumber) => Promise<string>;
  resolveNumber?: (phoneId: string) => Promise<ClinicNumber | null>;
  runAgent: (db: DB, input: { conversationId: string; text: string; kind: "text" | "audio"; audioLabel?: string; useAi: boolean }) => Promise<ProcessResult>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);

function valueOf(payload: unknown): Obj {
  const entry = isObj(payload) && Array.isArray(payload["entry"]) ? payload["entry"][0] : null;
  const change = isObj(entry) && Array.isArray(entry["changes"]) ? entry["changes"][0] : null;
  return isObj(change) && isObj(change["value"]) ? change["value"] : {};
}

type DbRes = { data: unknown; error: { message: string } | null };

function must<R extends DbRes>(res: R, what: string): NonNullable<R["data"]> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: sem resposta do banco`);
  return res.data as NonNullable<R["data"]>;
}

function maybe<R extends DbRes>(res: R, what: string): R["data"] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

function ok(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

function checkTime(deps: ProcessorDeps) {
  if (Date.now() > deps.deadline) throw new DeferredError("Tempo esgotado nesta chamada; continua na próxima tentativa.");
}

async function loadAllowlist(db: DB) {
  const rows = must(await db.from("whatsapp_allowed_numbers").select("phone_digits, label"), "Lista de números");
  return rows;
}

async function loadSettings(db: DB) {
  const row = maybe(await db.from("whatsapp_settings").select("*").eq("id", true).maybeSingle(), "Configuração do WhatsApp");
  if (!row) throw new Error("Configuração do WhatsApp ausente");
  return row;
}

async function charge(db: DB, clinicId: string, reference: string, reason: string, units: number): Promise<boolean> {
  const { data, error } = await (db as unknown as SupabaseClient).rpc("consume_clinic_credits", {
    p_clinic_id: clinicId, p_reference: reference, p_reason: reason, p_units: units,
  });
  if (error) throw new Error(`Créditos: ${error.message}`);
  return data === true;
}

export async function processStoredEvent(event: string, payload: unknown, deliveryId: string, deps: ProcessorDeps): Promise<void> {
  const value = valueOf(payload);
  if (event === "whatsapp.message") {
    const messages = Array.isArray(value["messages"]) ? value["messages"].filter(isObj) : [];
    const phoneId = isObj(value["metadata"]) ? str(value["metadata"]["phone_number_id"]) : null;
    for (const m of messages) await handleInbound(m, deps, phoneId);
    return;
  }
  if (event === "whatsapp.status") {
    const statuses = Array.isArray(value["statuses"]) ? value["statuses"].filter(isObj) : [];
    for (const s of statuses) await handleStatus(s, deliveryId, deps.db);
    return;
  }
  if (event === "whatsapp.account_update") {
    await handleAccountUpdate(value, deps.db);
    return;
  }
  // template_status / message_error: kept in the inbox for the admin; nothing else to do.
}

async function handleStatus(s: Obj, deliveryId: string, db: DB) {
  const waId = str(s["id"]);
  const status = str(s["status"]);
  const recipient = normalizeWhatsAppDigits(str(s["recipient_id"]) ?? "");
  if (!waId || !status || !recipient) return;
  const ts = Number(str(s["timestamp"]) ?? s["timestamp"]);
  const ins = await db.from("whatsapp_status_events").upsert(
    {
      wa_message_id: waId,
      status,
      provider_ts: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      errors: (Array.isArray(s["errors"]) ? s["errors"] : null) as Json | null,
      recipient_digits: recipient,
      delivery_id: deliveryId,
    },
    { onConflict: "delivery_id,wa_message_id,status", ignoreDuplicates: true },
  );
  if (ins.error) throw new Error(`Status: ${ins.error.message}`);
  const rec = await db.rpc("whatsapp_reconcile_status", { _wa_id: waId });
  if (rec.error) throw new Error(`Conciliação: ${rec.error.message}`);
}

const STOP_EVENTS = new Set(["PARTNER_REMOVED", "PARTNER_APP_UNINSTALLED", "ACCOUNT_DELETED", "ACCOUNT_OFFBOARDED"]);

async function handleAccountUpdate(value: Obj, db: DB) {
  const ev = str(value["event"]);
  const ban = isObj(value["ban_info"]) ? str(value["ban_info"]["waba_ban_state"]) : null;
  const stop = (ev && STOP_EVENTS.has(ev)) || (ev === "DISABLED_UPDATE" && ban === "DISABLE");
  if (stop) {
    ok(
      await db.from("whatsapp_settings").update({ sending_paused: true, paused_reason: `Meta informou: ${ev}`, updated_at: new Date().toISOString() }).eq("id", true),
      "Pausar envio",
    );
  } else if (ev === "ACCOUNT_RECONNECTED") {
    ok(
      await db
        .from("whatsapp_settings")
        .update({ sending_paused: false, paused_reason: null, updated_at: new Date().toISOString() })
        .eq("id", true)
        .eq("paused_reason", "Meta informou: ACCOUNT_OFFBOARDED"),
      "Retomar envio",
    );
  }
}

function inboundContent(m: Obj): { kind: "text" | "audio" | "other"; body: string | null; mediaId: string | null; mime: string | null } {
  const type = str(m["type"]);
  if (type === "text" && isObj(m["text"])) return { kind: "text", body: str(m["text"]["body"]), mediaId: null, mime: null };
  if (type === "audio" && isObj(m["audio"])) return { kind: "audio", body: null, mediaId: str(m["audio"]["id"]), mime: str(m["audio"]["mime_type"]) };
  if (type === "button" && isObj(m["button"])) return { kind: "text", body: str(m["button"]["text"]), mediaId: null, mime: null };
  if (type === "interactive" && isObj(m["interactive"])) {
    const i = m["interactive"];
    const reply = isObj(i["button_reply"]) ? i["button_reply"] : isObj(i["list_reply"]) ? i["list_reply"] : null;
    return { kind: "text", body: reply ? str(reply["title"]) : null, mediaId: null, mime: null };
  }
  return { kind: "other", body: null, mediaId: null, mime: null };
}

const UNSUPPORTED_REPLY = "Por enquanto consigo ler apenas mensagens de texto e áudio. Pode me escrever o que você precisa?";

function withOptions(content: string, options: Array<{ label: string }>) {
  if (!options.length) return content;
  const missing = options.filter((o) => !content.includes(o.label.replace(/^\d+\.\s*/, "")));
  if (!missing.length) return content;
  return `${content}\n\nOpções: ${options.map((o) => o.label).join(" / ")}`;
}

type Inbound = {
  id: string;
  wa_message_id: string;
  from_digits: string;
  kind: string;
  body: string | null;
  media_id: string | null;
  transcription: string | null;
  state: string;
  conversation_id: string | null;
  clinic_id: string | null;
  phone_number_id?: string | null;
  updated_at: string;
};

async function setInbound(db: DB, id: string, patch: Partial<Inbound> & { error?: string | null }, fromState?: string) {
  let q = db.from("whatsapp_inbound_messages").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (fromState) q = q.eq("state", fromState);
  const res = await q.select("id");
  if (res.error) throw new Error(`Atualizar mensagem recebida: ${res.error.message}`);
  return res.data.length > 0;
}

async function handleInbound(m: Obj, deps: ProcessorDeps, phoneId: string | null) {
  const { db } = deps;
  const waId = str(m["id"]);
  const from = normalizeWhatsAppDigits(str(m["from"]) ?? "");
  if (!waId || !from) return;
  const content = inboundContent(m);
  const ts = Number(str(m["timestamp"]));

  // Re-check the allowlist at processing time: a number removed meanwhile gets no reply.
  const number = deps.resolveNumber && phoneId ? await deps.resolveNumber(phoneId) : null;
  if (deps.resolveNumber && !number) return;
  const allow = deps.resolveNumber ? [] : await loadAllowlist(db);
  const ins = await db.from("whatsapp_inbound_messages").upsert(
    {
      wa_message_id: waId,
      from_digits: from,
      kind: content.kind,
      body: content.body,
      media_id: content.mediaId,
      mime_type: content.mime,
      provider_timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      ...(number ? { clinic_id: number.clinicId, phone_number_id: number.phoneId } : {}),
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (ins.error) throw new Error(`Gravar mensagem recebida: ${ins.error.message}`);
  let row = must(await db.from("whatsapp_inbound_messages").select("*").eq("wa_message_id", waId).single(), "Ler mensagem recebida") as Inbound;
  if (row.state === "done" || row.state === "needs_review" || row.state === "blocked") return;

  if (!number && !isAllowedNumber(from, allow.map((a) => a.phone_digits))) {
    await setInbound(db, row.id, { state: "blocked", error: "Número removido da lista de autorizados" });
    return;
  }

  // 1. Text / transcription
  if (row.state === "received") {
    if (content.kind === "audio") {
      if (!row.media_id) throw new Error("Áudio sem identificador de mídia");
      if (number && !(await charge(db, number.clinicId, `audio:${waId}`, "transcricao_audio", 10))) {
        await handoffForCredits(db, row, number.clinicId, from, "Áudio recebido", "received");
        return;
      }
      checkTime(deps);
      const text = await deps.transcribe(row.media_id, number ?? undefined);
      await setInbound(db, row.id, { transcription: text, state: "ready", error: null }, "received");
    } else {
      await setInbound(db, row.id, { state: "ready", error: null }, "received");
    }
    row = must(await db.from("whatsapp_inbound_messages").select("*").eq("id", row.id).single(), "Ler mensagem recebida") as Inbound;
  }

  // 2. Agent (exactly once; an interrupted run is flagged for review, never re-run)
  if (row.state === "agent_running") {
    if (Date.now() - new Date(row.updated_at).getTime() < 120_000) throw new DeferredError("Mensagem ainda em processamento.");
    await setInbound(db, row.id, { state: "needs_review", error: "Processamento interrompido; revisar a conversa antes de responder." }, "agent_running");
    return;
  }
  if (row.state === "ready") {
    checkTime(deps);
    const clinicId = number?.clinicId ?? (await loadSettings(db)).target_clinic_id;
    if (!clinicId) throw new Error("Nenhuma clínica de destino configurada para o WhatsApp.");
    const claimed = await setInbound(db, row.id, { state: "agent_running", clinic_id: clinicId }, "ready");
    if (!claimed) throw new DeferredError("Mensagem assumida por outra execução.");
    const label = number ? "Contato WhatsApp" : allow.find((a) => isAllowedNumber(from, [a.phone_digits]))?.label || "Contato de teste";
    const conversationId = await ensureConversation(db, clinicId, from, label, !!number);
    if (number && !(await charge(db, clinicId, `agent:${waId}`, "mensagem_processada", 1))) {
      await handoffForCredits(db, row, clinicId, from, row.body ?? "Áudio recebido", "agent_running", conversationId);
      return;
    }
    const text = content.kind === "audio" ? (row.transcription ?? "") : (row.body ?? "").trim();
    let replies: Array<{ content: string; options: Array<{ label: string }> }>;
    if (content.kind === "other" || !text) {
      ok(
        await db.from("messages").insert({ clinic_id: clinicId, conversation_id: conversationId, sender: "patient", content: "(Mensagem de tipo não suportado)" }),
        "Registrar mensagem",
      );
      ok(await db.from("messages").insert({ clinic_id: clinicId, conversation_id: conversationId, sender: "agent", content: UNSUPPORTED_REPLY }), "Registrar resposta");
      replies = [{ content: UNSUPPORTED_REPLY, options: [] }];
    } else {
      const result = await deps.runAgent(db, {
        conversationId,
        text: text.slice(0, 1000),
        kind: content.kind === "audio" ? "audio" : "text",
        useAi: false,
        ...(content.kind === "audio" ? { audioLabel: "Áudio do WhatsApp (transcrição automática)" } : {}),
      });
      replies = result.replies;
    }
    if (replies.length) {
      const out = await db.from("whatsapp_outbound_messages").upsert(
        replies.map((r, seq) => ({
          inbound_wa_message_id: row.wa_message_id,
          seq,
          clinic_id: clinicId,
          ...(number ? { phone_number_id: number.phoneId } : {}),
          conversation_id: conversationId,
          recipient_digits: from,
          body: withOptions(r.content, r.options),
        })),
        { onConflict: "inbound_wa_message_id,seq", ignoreDuplicates: true },
      );
      if (out.error) throw new Error(`Registrar respostas: ${out.error.message}`);
    }
    await setInbound(db, row.id, { state: "replied", conversation_id: conversationId, error: null }, "agent_running");
    row = { ...row, state: "replied", conversation_id: conversationId };
  }

  // 3. Delivery of pending replies
  if (row.state === "replied") {
    await deliverReplies(row, deps);
    await setInbound(db, row.id, { state: "done", error: null }, "replied");
  }
}

async function handoffForCredits(db: DB, row: Inbound, clinicId: string, from: string, text: string,
  state: string, existingConversationId?: string) {
  const conversationId = existingConversationId ?? await ensureConversation(db, clinicId, from, "Contato WhatsApp", true);
  ok(await db.from("messages").insert({ clinic_id: clinicId, conversation_id: conversationId,
    sender: "patient", content: text.slice(0, 1000) }), "Registrar mensagem para a equipe");
  ok(await db.from("messages").insert({ clinic_id: clinicId, conversation_id: conversationId,
    sender: "system", content: "Atendimento automático pausado por créditos insuficientes. A equipe precisa responder ao paciente." }), "Avisar a equipe");
  ok(await db.from("conversations").update({ status: "pending_human", last_message_preview: "Aguardando equipe: créditos insuficientes",
    last_message_at: new Date().toISOString() }).eq("id", conversationId), "Encaminhar à equipe");
  await setInbound(db, row.id, { state: "needs_review", clinic_id: clinicId, conversation_id: conversationId,
    error: "Créditos insuficientes; conversa encaminhada à equipe" }, state);
}

async function ensureConversation(db: DB, clinicId: string, digits: string, label: string, real = false): Promise<string> {
  const display = formatWhatsAppDigits(digits);
  let patient = maybe(await db.from("patients").select("id, name").eq("clinic_id", clinicId).eq("phone", display).maybeSingle(), "Buscar contato");
  if (!patient) {
    patient = must(
      await db
        .from("patients")
        .insert({ clinic_id: clinicId, name: label, phone: display, notes: real ? "" : "Contato de teste autorizado no WhatsApp", is_demo: !real })
        .select("id, name")
        .single(),
      "Criar contato de teste",
    );
  }
  const open = must(
    await db
      .from("conversations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("channel", "whatsapp")
      .eq("contact_phone", display)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1),
    "Buscar conversa",
  );
  if (open[0]) return open[0].id;
  const created = must(
    await db
      .from("conversations")
      .insert({ clinic_id: clinicId, patient_id: patient.id, contact_name: patient.name, contact_phone: display, channel: "whatsapp", status: "bot", last_message_preview: real ? "Nova conversa do WhatsApp" : "Nova conversa do WhatsApp (teste)" })
      .select("id")
      .single(),
    "Criar conversa",
  );
  return created.id;
}

async function noteInConversation(db: DB, clinicId: string | null, conversationId: string | null, content: string) {
  if (!clinicId || !conversationId) return;
  const res = await db.from("messages").insert({ clinic_id: clinicId, conversation_id: conversationId, sender: "system", content });
  if (res.error) throw new Error(`Registrar aviso: ${res.error.message}`);
}

async function deliverReplies(row: Inbound, deps: ProcessorDeps) {
  const { db } = deps;
  const outs = must(
    await db.from("whatsapp_outbound_messages").select("*").eq("inbound_wa_message_id", row.wa_message_id).order("seq"),
    "Ler respostas",
  );
  for (const o of outs) {
    if (o.state === "sending") {
      // A previous run stopped mid-send: the outcome is unknown, so it is not resent.
      ok(await db.from("whatsapp_outbound_messages").update({ state: "unresolved", error: { message: "Envio interrompido; resultado desconhecido." }, updated_at: new Date().toISOString() }).eq("id", o.id).eq("state", "sending"), "Marcar envio");
      continue;
    }
    if (o.state !== "pending") continue;
    const number = deps.resolveNumber && o.phone_number_id ? await deps.resolveNumber(o.phone_number_id) : null;
    const [allow, settings] = deps.resolveNumber ? [[], null] : await Promise.all([loadAllowlist(db), loadSettings(db)]);
    const blocked = deps.resolveNumber && (!number || number.clinicId !== o.clinic_id)
      ? "Número da clínica indisponível ou acesso suspenso"
      : !number && !isAllowedNumber(o.recipient_digits, allow.map((a) => a.phone_digits))
      ? "Número não está mais autorizado"
      : number?.sendingPaused || settings?.sending_paused
        ? `Envio pausado${settings?.paused_reason ? `: ${settings.paused_reason}` : ""}`
        : null;
    if (blocked) {
      ok(await db.from("whatsapp_outbound_messages").update({ state: "blocked", error: { message: blocked }, updated_at: new Date().toISOString() }).eq("id", o.id).eq("state", "pending"), "Bloquear envio");
      await noteInConversation(db, o.clinic_id, o.conversation_id, `Resposta não enviada ao WhatsApp: ${blocked}.`);
      continue;
    }
    checkTime(deps);
    const claim = must(
      await db.from("whatsapp_outbound_messages").update({ state: "sending", attempts: o.attempts + 1, updated_at: new Date().toISOString() }).eq("id", o.id).eq("state", "pending").select("id"),
      "Reservar envio",
    );
    if (!claim.length) continue;
    const result = await deps.sendText(o.recipient_digits, o.body, number ?? undefined);
    const now = new Date().toISOString();
    if (result.kind === "accepted") {
      ok(await db.from("whatsapp_outbound_messages").update({ state: "accepted", wa_message_id: result.waMessageId, error: null, updated_at: now }).eq("id", o.id), "Salvar envio");
      const rec = await db.rpc("whatsapp_reconcile_status", { _wa_id: result.waMessageId });
      if (rec.error) throw new Error(`Conciliação: ${rec.error.message}`);
    } else if (result.kind === "rejected" && result.retryable) {
      ok(await db.from("whatsapp_outbound_messages").update({ state: "pending", error: { status: result.status, body: result.body }, updated_at: now }).eq("id", o.id), "Reagendar envio");
      throw new Error(`Limite de envio do WhatsApp atingido (HTTP ${result.status}); nova tentativa depois.`);
    } else if (result.kind === "rejected") {
      ok(await db.from("whatsapp_outbound_messages").update({ state: "failed", error: { status: result.status, body: result.body }, failed_at: now, updated_at: now }).eq("id", o.id), "Registrar falha");
      await noteInConversation(db, o.clinic_id, o.conversation_id, `Resposta recusada pelo WhatsApp (HTTP ${result.status}).`);
    } else {
      ok(await db.from("whatsapp_outbound_messages").update({ state: "unresolved", error: { message: result.error }, updated_at: now }).eq("id", o.id), "Registrar envio incerto");
      await noteInConversation(db, o.clinic_id, o.conversation_id, "Resultado do envio ao WhatsApp incerto; não foi reenviado automaticamente. Revise antes de responder de novo.");
    }
  }
}
