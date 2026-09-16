import { describe, expect, it } from "vitest";

import { assertProspectingTransition } from "../services/prospectingDomain.js";

describe("assertProspectingTransition", () => {
  it.each([
    ["Análise Financeira", "Análise/Agendamento"],
    ["Análise/Agendamento", "Envio de Proposta"],
    ["Envio de Proposta", "Fechado"],
    ["Paralisado", "Análise/Agendamento"],
    ["Recusado pelo Cliente", "Análise/Agendamento"],
  ] as const)("aceita a transição de %s para %s", (currentStatus, nextStatus) => {
    expect(() => assertProspectingTransition(currentStatus, nextStatus)).not.toThrow();
  });

  it.each([
    ["Fechado", "Análise Financeira"],
    ["Paralisado", "Fechado"],
    ["Recusado pelo Cliente", "Fechado"],
  ] as const)("rejeita a transição de %s para %s", (currentStatus, nextStatus) => {
    expect(() => assertProspectingTransition(currentStatus, nextStatus)).toThrow("não é permitida");
  });
});
