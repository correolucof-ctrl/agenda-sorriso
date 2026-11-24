import { describe, expect, it } from "vitest";
import { classifyIntent, detectUrgency, matchService, parseChoice, parseDatePreference, parseTime, isYes, isNo } from "@/lib/agent-core";

describe("classificação de intenção", () => {
  it("dor intensa é urgência", () => {
    expect(classifyIntent("Estou com uma dor muito forte no dente e o rosto está inchado")).toBe("urgencia");
    expect(detectUrgency("meu dente quebrou")).toBe(true);
  });
  it("identifica agendar, remarcar, cancelar e dúvida", () => {
    expect(classifyIntent("Olá, gostaria de agendar uma avaliação")).toBe("agendar");
    expect(classifyIntent("Preciso remarcar minha consulta")).toBe("remarcar");
    expect(classifyIntent("Quero cancelar minha consulta")).toBe("cancelar");
    expect(classifyIntent("Qual o endereço da clínica?")).toBe("duvida");
    expect(classifyIntent("Vocês aceitam convênio?")).toBe("duvida");
  });
  it("pedido de atendente vai para humano", () => {
    expect(classifyIntent("quero falar com um atendente")).toBe("humano");
  });
});

describe("interpretação de respostas", () => {
  it("escolha de opção", () => {
    expect(parseChoice("2", 4)).toBe(2);
    expect(parseChoice("opção 3", 4)).toBe(3);
    expect(parseChoice("a primeira", 4)).toBe(1);
    expect(parseChoice("9", 4)).toBeNull();
  });
  it("sim e não", () => {
    expect(isYes("Sim, pode confirmar")).toBe(true);
    expect(isYes("não")).toBe(false);
    expect(isNo("não, prefiro outro")).toBe(true);
  });
  it("datas e horários", () => {
    expect(parseDatePreference("amanhã à tarde", "2026-11-26")).toBe("2026-11-27");
    expect(parseDatePreference("na segunda", "2026-11-26")).toBe("2026-11-30");
    expect(parseDatePreference("dia 03/12", "2026-11-26")).toBe("2026-12-03");
    expect(parseTime("às 14h30")).toBe(14 * 60 + 30);
    expect(parseTime("09:00")).toBe(9 * 60);
  });
  it("encontra o serviço pelo texto", () => {
    const services = [
      { id: "a", name: "Avaliação" },
      { id: "l", name: "Limpeza" },
      { id: "m", name: "Manutenção de aparelho" },
    ];
    expect(matchService("queria fazer uma limpeza", services)?.id).toBe("l");
    expect(matchService("ajustar o aparelho", services)?.id).toBe("m");
    expect(matchService("primeira consulta", services)?.id).toBe("a");
  });
});

import { matchProfessional } from "@/lib/agent-core";
describe("profissional citado", () => {
  it("reconhece o nome do profissional na mensagem", () => {
    const pros = [{ id: "h", name: "Dra. Helena Prado" }, { id: "r", name: "Dr. Rafael Moura" }];
    expect(matchProfessional("quero com a Dra. Helena Prado às 8h", pros)?.id).toBe("h");
    expect(matchProfessional("qualquer um", pros)).toBeNull();
  });
});
