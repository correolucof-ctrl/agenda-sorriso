import type { BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;

export const PRO_COLORS: Record<string, { soft: string; solid: string; border: string; text: string }> = {
  "pro-1": { soft: "bg-pro-1-soft", solid: "bg-pro-1", border: "border-pro-1", text: "text-pro-1" },
  "pro-2": { soft: "bg-pro-2-soft", solid: "bg-pro-2", border: "border-pro-2", text: "text-pro-2" },
  "pro-3": { soft: "bg-pro-3-soft", solid: "bg-pro-3", border: "border-pro-3", text: "text-pro-3" },
  "pro-4": { soft: "bg-pro-4-soft", solid: "bg-pro-4", border: "border-pro-4", text: "text-pro-4" },
  "pro-5": { soft: "bg-pro-5-soft", solid: "bg-pro-5", border: "border-pro-5", text: "text-pro-5" },
};
export const PRO_COLOR_KEYS = Object.keys(PRO_COLORS);
export const proColor = (key: string | null | undefined) => PRO_COLORS[key ?? ""] ?? PRO_COLORS["pro-1"]!;

export const CONVERSATION_STATUS: Record<string, { label: string; variant: Variant }> = {
  bot: { label: "Com o agente", variant: "info" },
  pending_human: { label: "Aguardando equipe", variant: "warning" },
  human: { label: "Em atendimento humano", variant: "success" },
  closed: { label: "Encerrada", variant: "muted" },
};

export const APPOINTMENT_STATUS: Record<string, { label: string; variant: Variant }> = {
  scheduled: { label: "Agendada", variant: "info" },
  confirmed: { label: "Confirmada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "danger" },
  completed: { label: "Realizada", variant: "muted" },
  no_show: { label: "Faltou", variant: "warning" },
};

export const REMINDER_STATUS: Record<string, { label: string; variant: Variant }> = {
  pending: { label: "Na fila", variant: "info" },
  sent: { label: "Enviado (simulado)", variant: "success" },
  failed: { label: "Falhou (simulado)", variant: "danger" },
  cancelled: { label: "Cancelado", variant: "muted" },
};

export const INTENT_BADGE: Record<string, { label: string; variant: Variant }> = {
  agendar: { label: "Agendar", variant: "info" },
  remarcar: { label: "Remarcar", variant: "info" },
  cancelar: { label: "Cancelar", variant: "muted" },
  urgencia: { label: "Urgência", variant: "danger" },
  duvida: { label: "Dúvida", variant: "secondary" },
  humano: { label: "Pediu atendente", variant: "warning" },
  confirmar_presenca: { label: "Confirmação", variant: "success" },
  saudacao: { label: "Saudação", variant: "secondary" },
  agradecimento: { label: "Agradecimento", variant: "secondary" },
  desconhecido: { label: "Não identificada", variant: "muted" },
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Algo deu errado. Tente novamente.";
}
