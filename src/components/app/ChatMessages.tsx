import { useEffect, useRef } from "react";
import { Bot, Mic, Sparkles, UserRound } from "lucide-react";
import type { Message } from "@/hooks/use-clinic";
import { formatTime } from "@/lib/time";
import { INTENT_BADGE } from "@/lib/ui-maps";
import { cn } from "@/lib/utils";

type Option = { label: string; value: string };

function AudioBubble({ label }: { label: string }) {
  const bars = [6, 12, 9, 16, 10, 14, 7, 12, 15, 8, 11, 6, 13, 9];
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
      <Mic className="size-4 text-primary" aria-hidden />
      <div className="flex items-end gap-0.5" aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className="w-1 rounded-full bg-primary/60" style={{ height: h }} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function ChatMessages({
  messages,
  timezone,
  onOption,
  disabled,
  pendingText,
}: {
  messages: Message[];
  timezone: string;
  onOption?: (value: string) => void;
  disabled?: boolean;
  pendingText?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingText]);

  const lastAgentIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.sender === "agent") return i;
      if (m.sender === "patient") return -1;
    }
    return -1;
  })();

  return (
    <div className="space-y-3" role="log" aria-live="polite" aria-label="Mensagens da conversa">
      {messages.map((m, idx) => {
        if (m.sender === "system") {
          return (
            <div key={m.id} className="flex justify-center">
              <p className="max-w-[90%] rounded-full bg-warning-soft px-3 py-1 text-center text-xs font-medium text-warning-foreground">{m.content}</p>
            </div>
          );
        }
        const fromPatient = m.sender === "patient";
        const options = (Array.isArray(m.options) ? (m.options as Option[]) : []).filter((o) => o && typeof o.value === "string");
        const intent = m.intent ? INTENT_BADGE[m.intent] : null;
        return (
          <div key={m.id} className={cn("flex flex-col", fromPatient ? "items-start" : "items-end")}>
            <div
              className={cn(
                "max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm shadow-card sm:max-w-[78%]",
                fromPatient ? "rounded-bl-md bg-bubble-in text-foreground" : "rounded-br-md bg-bubble-out text-bubble-out-foreground",
                m.sender === "human" && "bg-success text-success-foreground",
              )}
            >
              {m.kind === "audio" ? <AudioBubble label={m.audio_label ?? "Áudio de exemplo"} /> : null}
              {m.kind === "audio" ? <span className="mb-1 block text-xs font-semibold text-muted-foreground">Transcrição simulada</span> : null}
              {m.content}
            </div>
            <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
              {fromPatient ? <UserRound className="size-3" aria-hidden /> : m.sender === "agent" ? <Bot className="size-3" aria-hidden /> : null}
              <span>{fromPatient ? "Paciente" : m.sender === "agent" ? "Agente" : "Equipe"}</span>
              <span>{formatTime(m.created_at, timezone)}</span>
              {intent && fromPatient ? <span className="font-medium">· {intent.label}</span> : null}
              {m.ai_written ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-primary">
                  <Sparkles className="size-3" aria-hidden /> redação com IA
                </span>
              ) : null}
            </div>
            {onOption && idx === lastAgentIdx && options.length ? (
              <div className="mt-2 flex max-w-[95%] flex-wrap justify-end gap-1.5">
                {options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    disabled={disabled}
                    onClick={() => onOption(o.value)}
                    className="rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {pendingText ? (
        <div className="flex flex-col items-start opacity-70">
          <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-bubble-in px-3.5 py-2.5 text-sm shadow-card">{pendingText}</div>
          <p className="mt-1 px-1 text-[11px] text-muted-foreground">Enviando e aguardando o agente...</p>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
