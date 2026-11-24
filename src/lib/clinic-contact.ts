// Single source of truth for the clinic's public WhatsApp contact.
// The official WhatsApp Business Cloud API integration stays "Não conectado"
// until Meta credentials and the webhook are configured: this number is only
// the contact shown to visitors and recorded in the settings panel.

export const WHATSAPP_NUMBER_E164 = "5511976273100";
export const WHATSAPP_DISPLAY = "(11) 97627-3100";

export function whatsappChatLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER_E164}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
