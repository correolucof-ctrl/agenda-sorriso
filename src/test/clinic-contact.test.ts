import { describe, expect, it } from "vitest";

import { WHATSAPP_DISPLAY, WHATSAPP_NUMBER_E164, whatsappChatLink } from "@/lib/clinic-contact";

describe("Contato público de WhatsApp", () => {
  it("abre a conversa no número informado pelo usuário", () => {
    expect(whatsappChatLink()).toBe("https://wa.me/5511976273100");
  });

  it("mostra o número formatado como (11) 97627-3100", () => {
    expect(WHATSAPP_DISPLAY).toBe("(11) 97627-3100");
    expect(WHATSAPP_NUMBER_E164).toBe("5511976273100");
  });

  it("mantém o mesmo número quando anexa uma mensagem", () => {
    expect(whatsappChatLink("Olá")).toBe("https://wa.me/5511976273100?text=Ol%C3%A1");
  });
});
