import { describe, expect, it } from "vitest";
import {
  createIntegrationBodySchema,
  updateRegularizeBodySchema,
} from "../schemas/clientVerticals.schemas.js";

const createBody = { type: "PJ", name: "Acme", cpf_cnpj: "12345678000195" };

function firstMessage(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("regularize opening date", () => {
  it("rejects a future opening date on regularize and integration", () => {
    for (const result of [
      updateRegularizeBodySchema.safeParse({ opening_date: "2099-01-01" }),
      createIntegrationBodySchema.safeParse({ ...createBody, opening_date: "2099-01-01" }),
    ]) {
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe("Data de abertura não pode ser no futuro.");
    }
  });

  it("accepts past dates and null", () => {
    for (const opening_date of ["2020-05-10", null]) {
      expect(updateRegularizeBodySchema.safeParse({ opening_date }).success).toBe(true);
    }
  });
});

describe("regularize CNAE", () => {
  it.each(["6201-5/01", "6201501", "62.01-5-01"])("accepts %s", (cnae) => {
    expect(updateRegularizeBodySchema.safeParse({ cnae }).success).toBe(true);
  });

  it.each(["QA_abc", "6201-5", "62015011"])("rejects %s", (cnae) => {
    const result = updateRegularizeBodySchema.safeParse({ cnae });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("CNAE deve ter 7 dígitos (ex.: 6201-5/01).");
  });

  it("accepts null to clear the CNAE", () => {
    expect(updateRegularizeBodySchema.safeParse({ cnae: null }).success).toBe(true);
  });
});
