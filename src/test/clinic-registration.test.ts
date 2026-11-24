import { describe, expect, it } from "vitest";
import { clinicRegistrationSchema } from "@/lib/clinic-registration";

const valid = { clinic_name: "Clínica Teste", responsible_name: "Responsável Fictício", contact_email: "teste@example.com", contact_phone: "+5562999990000" };

describe("Cadastro comercial de clínica", () => {
  it("aceita dados válidos e remove espaços externos", () => {
    expect(clinicRegistrationSchema.parse({ ...valid, clinic_name: " Clínica Teste " }).clinic_name).toBe("Clínica Teste");
  });
  it("recusa cadastro sem responsável", () => {
    expect(clinicRegistrationSchema.safeParse({ ...valid, responsible_name: "" }).success).toBe(false);
  });
  it("recusa e-mail inválido", () => {
    expect(clinicRegistrationSchema.safeParse({ ...valid, contact_email: "invalido" }).success).toBe(false);
  });
  it("recusa telefone sem código internacional", () => {
    expect(clinicRegistrationSchema.safeParse({ ...valid, contact_phone: "62999990000" }).success).toBe(false);
  });
});