import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;
const ORIGIN = "https://agenda-sorriso.correo-lucof-708.workers.dev";
const REDIRECT = `${ORIGIN}/api/public/google-calendar/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function config() {
  const id = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const secret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  const key = process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"];
  if (!id || !secret || !key) throw new Error("Google Agenda ainda não configurado.");
  return { id, secret, key };
}

const hex = (data: ArrayBuffer) => Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function aesKey(raw: string): Promise<CryptoKey> {
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("Chave de criptografia Google inválida.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string, key = config().key): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key), new TextEncoder().encode(token)));
  return `${b64(iv)}.${b64(data)}`;
}

export async function decryptToken(cipher: string, key = config().key): Promise<string> {
  const [iv64, data64] = cipher.split(".");
  if (!iv64 || !data64) throw new Error("Token Google armazenado inválido.");
  const bytes = unb64(data64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv64), tagLength: 128 }, await aesKey(key), bytes);
  return new TextDecoder().decode(plain);
}

async function activeClinic(db: Db, clinicId: string): Promise<void> {
  const { data: access, error } = await db.from("commercial_access").select("status,expires_at,payment_required")
    .eq("clinic_id", clinicId).single();
  if (error || access?.status !== "approved" || new Date(access.expires_at).getTime() <= Date.now()) {
    throw new Error("Clínica sem acesso aprovado.");
  }
  if (access.payment_required) {
    const { data } = await db.from("billing_subscriptions").select("status,current_period_end").eq("clinic_id", clinicId).maybeSingle();
    if (!data || !["active", "trialing"].includes(data.status) || new Date(data.current_period_end).getTime() <= Date.now()) {
      throw new Error("Assinatura inativa.");
    }
  }
}

export async function googleConnectUrl(db: Db, clinicId: string, userId: string): Promise<string> {
  const { id } = config();
  await activeClinic(db, clinicId);
  const state = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
  const { error } = await db.from("google_calendar_oauth_states").insert({
    state_hash: await sha(state), clinic_id: clinicId, user_id: userId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Não foi possível iniciar a conexão Google.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", REDIRECT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function finishGoogleConnection(db: Db, code: string, state: string): Promise<void> {
  if (!code || !state || code.length > 4096 || state.length > 512) throw new Error("Retorno OAuth inválido.");
  const hash = await sha(state);
  const { data: row, error } = await db.from("google_calendar_oauth_states").delete().eq("state_hash", hash)
    .gt("expires_at", new Date().toISOString()).select("clinic_id,user_id").single();
  if (error || !row) throw new Error("Conexão Google expirada ou já utilizada.");
  const { data: clinic } = await db.from("clinics").select("owner_id").eq("id", row.clinic_id).single();
  if (clinic?.owner_id !== row.user_id) throw new Error("Conta da clínica mudou durante a conexão.");
  await activeClinic(db, row.clinic_id);
  const { id, secret } = config();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  if (!tokenResponse.ok) throw new Error(`Google recusou a conexão (${tokenResponse.status}).`);
  const tokens = await tokenResponse.json() as { refresh_token?: string };
  if (!tokens.refresh_token) throw new Error("Google não forneceu autorização duradoura; conecte novamente.");
  const cipher = await encryptToken(tokens.refresh_token);
  const { error: saveError } = await db.from("google_calendar_connections").upsert({
    clinic_id: row.clinic_id, calendar_id: "primary", refresh_token_ciphertext: cipher,
    enabled: true, updated_at: new Date().toISOString(),
  }, { onConflict: "clinic_id" });
  if (saveError) throw new Error("Não foi possível guardar a conexão Google.");
  // Include future appointments already created before the calendar was connected.
  const { data: future, error: futureError } = await db.from("appointments").select("id")
    .eq("clinic_id", row.clinic_id).gte("ends_at", new Date().toISOString()).limit(1000);
  if (futureError) throw new Error("Conexão salva, mas não foi possível preparar a sincronização inicial.");
  if (future?.length) {
    const { error: queueError } = await db.from("google_calendar_sync_queue").upsert(
      future.map((a: { id: string }) => ({ appointment_id: a.id, clinic_id: row.clinic_id, state: "pending" })),
      { onConflict: "appointment_id", ignoreDuplicates: true },
    );
    if (queueError) throw new Error("Conexão salva, mas a fila inicial falhou.");
  }
}

async function accessToken(cipher: string): Promise<string> {
  const { id, secret } = config();
  const refresh = await decryptToken(cipher);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Falha ao renovar Google OAuth (${response.status}).`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google não retornou token de acesso.");
  return data.access_token;
}

function eventId(uuid: string): string { return `as${uuid.replaceAll("-", "").toLowerCase()}`; }

export async function syncGoogleCalendar(db: Db, limit = 10): Promise<{ processed: number; failed: number }> {
  const { data: jobs, error } = await db.rpc("claim_google_calendar_sync", { p_limit: limit });
  if (error) throw new Error("Não foi possível reservar a fila Google.");
  let processed = 0, failed = 0;
  for (const job of jobs as Array<{ appointment_id: string; clinic_id: string; version: number }>) {
    let failure: string | null = null;
    try {
      const [{ data: appointment }, { data: connection }] = await Promise.all([
        db.from("appointments").select("id,starts_at,ends_at,status,service:services(name),professional:professionals(name)")
          .eq("id", job.appointment_id).eq("clinic_id", job.clinic_id).single(),
        db.from("google_calendar_connections").select("calendar_id,refresh_token_ciphertext,enabled")
          .eq("clinic_id", job.clinic_id).single(),
      ]);
      if (!appointment || !connection?.enabled) throw new Error("Consulta ou conexão indisponível.");
      const token = await accessToken(connection.refresh_token_ciphertext);
      const calendar = encodeURIComponent(connection.calendar_id);
      const id = eventId(appointment.id);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`;
      // Do not place patient name, telephone, notes or medical details in the external calendar.
      const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
      const professional = Array.isArray(appointment.professional) ? appointment.professional[0] : appointment.professional;
      const body = JSON.stringify({ id, summary: `Consulta — ${service?.name ?? "Agenda Sorriso"}`,
        description: `Profissional: ${professional?.name ?? "clínica"}. Gerencie esta consulta no Agenda Sorriso.`,
        start: { dateTime: appointment.starts_at }, end: { dateTime: appointment.ends_at },
        status: appointment.status === "cancelled" ? "cancelled" : "confirmed",
      });
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const patch = await fetch(`${url}/${id}`, { method: "PATCH", headers, body });
      if (patch.status === 404 && appointment.status !== "cancelled") {
        const create = await fetch(url, { method: "POST", headers, body });
        if (!create.ok && create.status !== 409) throw new Error(`Google Calendar recusou evento (${create.status}).`);
      } else if (!patch.ok && !(patch.status === 404 && appointment.status === "cancelled")) {
        throw new Error(`Google Calendar recusou atualização (${patch.status}).`);
      }
      processed++;
    } catch (e) { failure = e instanceof Error ? e.message : "Falha desconhecida"; failed++; }
    const { error: finishError } = await db.rpc("finish_google_calendar_sync", {
      p_appointment_id: job.appointment_id, p_version: job.version, p_error: failure,
    });
    if (finishError) throw new Error("Não foi possível concluir um item da fila Google.");
  }
  return { processed, failed };
}
