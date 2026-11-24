import { z } from "zod";

export const clinicRegistrationSchema = z.object({
  clinic_name: z.string().trim().min(3, "Informe o nome da clínica").max(120),
  responsible_name: z.string().trim().min(3, "Informe o nome do responsável").max(120),
  contact_email: z.string().trim().email("Informe um e-mail válido").max(254),
  contact_phone: z.string().trim().regex(/^\+[1-9]\d{9,14}$/, "Use o código do país, por exemplo +5562999990000"),
});

export type ClinicRegistrationInput = z.infer<typeof clinicRegistrationSchema>;