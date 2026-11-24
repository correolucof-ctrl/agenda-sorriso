import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptToken, syncGoogleCalendar } from "@/server/google-calendar.server";

const envNames = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"] as const;
const original = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of envNames) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

describe("Google Calendar sync", () => {
  it("cria evento ausente sem transmitir dados do paciente", async () => {
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "client-test";
    process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = "secret-test";
    process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const cipher = await encryptToken("refresh-test");
    const appointmentId = "11111111-1111-4111-8111-111111111111";
    const clinicId = "22222222-2222-4222-8222-222222222222";
    const finish = vi.fn(async (_name: string) => ({ error: null }));
    const db = {
      rpc: async (name: string) => name === "claim_google_calendar_sync"
        ? { data: [{ appointment_id: appointmentId, clinic_id: clinicId, version: 1 }], error: null }
        : finish(name),
      from: (table: string) => ({ select: () => ({ eq: () => ({ eq: () => ({
        single: async () => ({ data: { id: appointmentId, starts_at: "2026-12-01T12:00:00Z",
          ends_at: "2026-12-01T12:30:00Z", status: "scheduled", service: { name: "Consulta" },
          professional: { name: "Dra. Teste" }, patient_name: "Nome privado", patient_phone: "5511999999999" } }),
      }), single: async () => ({ data: table === "google_calendar_connections"
        ? { calendar_id: "primary", refresh_token_ciphertext: cipher, enabled: true } : null }) }) }) }),
    };
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-test" });
      if (url.includes("/events/") && init?.method === "PATCH") return new Response(null, { status: 404 });
      if (url.endsWith("/events") && init?.method === "POST") return Response.json({ id: "created" });
      throw new Error(`Requisição inesperada: ${url}`);
    });
    const result = await syncGoogleCalendar(db as never, 1);
    expect(result).toEqual({ processed: 1, failed: 0 });
    const create = fetcher.mock.calls.find(([url, init]) => String(url).endsWith("/events") && init?.method === "POST");
    expect(create).toBeDefined();
    const body = String(create![1]?.body);
    expect(body).toContain("Consulta");
    expect(body).not.toContain("Nome privado");
    expect(body).not.toContain("5511999999999");
    expect(finish).toHaveBeenCalledWith("finish_google_calendar_sync");
  });
});
