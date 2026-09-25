import { describe, expect, it } from "vitest";

import {
  applyFinancialStatusTransition,
  FINANCIAL_LOCKING_TYPE,
  normalizeFinancialStatus,
} from "../services/processFinancialService.js";

describe("process financial status", () => {
  it.each([
    [0, "Pendente"],
    ["1", "Regular"],
    [3, "Bônus"],
    ["4", "Não Contratado"],
    ["Bônus", "Bônus"],
  ])("normalizes legacy value %s to %s", (value, expected) => {
    expect(normalizeFinancialStatus(value)).toBe(expected);
  });

  it("rejects an unknown legacy code", () => {
    expect(() => normalizeFinancialStatus(2)).toThrow("Status financeiro inválido.");
  });

  it("pauses a process with a financial locking cause", () => {
    expect(
      applyFinancialStatusTransition({
        currentFinancialStatus: "Regular",
        currentStatus: "Andamento",
        currentLockingType: null,
        nextFinancialStatus: "Não Contratado",
        requestedStatus: "Andamento",
        requestedLockingType: null,
      }),
    ).toEqual({
      financialStatus: "Não Contratado",
      status: "Paralisado",
      lockingType: FINANCIAL_LOCKING_TYPE,
    });
  });

  it("resumes only a financial pause when financial status becomes regular", () => {
    expect(
      applyFinancialStatusTransition({
        currentFinancialStatus: "Não Contratado",
        currentStatus: "Paralisado",
        currentLockingType: FINANCIAL_LOCKING_TYPE,
        nextFinancialStatus: "Regular",
        requestedStatus: "Paralisado",
        requestedLockingType: FINANCIAL_LOCKING_TYPE,
      }),
    ).toEqual({ financialStatus: "Regular", status: "Andamento", lockingType: null });
  });

  it("preserves a manual pause while leaving the financial status", () => {
    expect(
      applyFinancialStatusTransition({
        currentFinancialStatus: "Não Contratado",
        currentStatus: "Paralisado",
        currentLockingType: "Manual",
        nextFinancialStatus: "Regular",
        requestedStatus: "Paralisado",
        requestedLockingType: "Manual",
      }),
    ).toEqual({ financialStatus: "Regular", status: "Paralisado", lockingType: "Manual" });
  });

  it("keeps a resumed process resumed when the same stale payload is retried", () => {
    expect(
      applyFinancialStatusTransition({
        currentFinancialStatus: "Regular",
        currentStatus: "Andamento",
        currentLockingType: null,
        nextFinancialStatus: "Regular",
        requestedStatus: "Paralisado",
        requestedLockingType: FINANCIAL_LOCKING_TYPE,
      }),
    ).toEqual({ financialStatus: "Regular", status: "Andamento", lockingType: null });
  });
});
