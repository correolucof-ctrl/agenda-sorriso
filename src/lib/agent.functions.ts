import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processPatientMessage } from "@/server/agent.server";

export const startSimulatedConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ patientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (import.meta.env["VITE_STANDALONE"] === "true") throw new Error("A demonstração está disponível na página inicial.");
    const { data: patient, error } = await context.supabase.from("patients").select("*").eq("id", data.patientId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("Paciente não encontrado.");
    const { data: conv, error: e2 } = await context.supabase
      .from("conversations")
      .insert({
        clinic_id: patient.clinic_id,
        patient_id: patient.id,
        contact_name: patient.name,
        contact_phone: patient.phone,
        channel: "simulador",
        status: "bot",
        last_message_preview: "Nova conversa simulada",
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return { conversationId: conv.id };
  });

export const sendSimulatedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        text: z.string().trim().min(1, "Digite uma mensagem").max(1000, "Mensagem muito longa"),
        kind: z.enum(["text", "audio"]).default("text"),
        audioLabel: z.string().max(80).optional(),
        useAi: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (import.meta.env["VITE_STANDALONE"] === "true") throw new Error("A demonstração está disponível na página inicial.");
    return processPatientMessage(context.supabase, {
      conversationId: data.conversationId,
      text: data.text,
      kind: data.kind,
      useAi: data.useAi,
      ...(data.audioLabel ? { audioLabel: data.audioLabel } : {}),
    });
  });
