import { describe, expect, it } from "vitest";
import {
  assertValidClientDocument,
  getClientDocumentType,
  isClientDocumentUniqueConstraintError,
  normalizeClientDocument,
} from "../utils/clientDocuments.js";

describe("client document validation", () => {
  it("normaliza CPF/CNPJ numérico e alfanumérico", () => {
    expect(normalizeClientDocument("529.982.247-25")).toBe("52998224725");
    expect(normalizeClientDocument("AB.123.456/7800-26")).toBe("AB123456780026");
  });

  it("valida CPF e CNPJ conforme o tipo da pessoa", () => {
    expect(assertValidClientDocument("529.982.247-25", "PF")).toBe("52998224725");
    expect(assertValidClientDocument("12.345.678/0001-95", "PJ")).toBe("12345678000195");
    expect(assertValidClientDocument("AB.123.456/7800-26", "PJ")).toBe("AB123456780026");
  });

  it("rejeita dígitos verificadores inválidos e documento vazio", () => {
    expect(() => assertValidClientDocument("529.982.247-26", "PF")).toThrow("CPF inválido.");
    expect(() => assertValidClientDocument("12.345.678/0001-00", "PJ")).toThrow("CNPJ inválido.");
    expect(() => assertValidClientDocument("", "PJ")).toThrow("CNPJ inválido.");
  });

  it("trata tipos desconhecidos como PJ no contrato legado", () => {
    expect(getClientDocumentType("empresa")).toBe("PJ");
  });

  it("identifica a colisão de unicidade do Prisma", () => {
    expect(isClientDocumentUniqueConstraintError({ code: "P2002" })).toBe(true);
    expect(isClientDocumentUniqueConstraintError({ code: "P2025" })).toBe(false);
  });
});
