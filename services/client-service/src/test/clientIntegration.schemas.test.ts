import { describe, expect, it } from "vitest";
import {
  createIntegrationBodySchema,
  updateIntegrationBodySchema,
} from "../schemas/clientVerticals.schemas.js";

const createBody = { type: "PJ", name: "Acme", cpf_cnpj: "12345678000195" };

describe("integration email contract", () => {
  it.each(["QA_email_invalido", "sem@dominio", "a b@x.com"])("rejects %s", (email) => {
    for (const result of [
      createIntegrationBodySchema.safeParse({ ...createBody, email }),
      updateIntegrationBodySchema.safeParse({ email }),
    ]) {
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Informe um e-mail válido.");
    }
  });

  it("accepts a valid email and null", () => {
    for (const email of ["contato@acme.com.br", null]) {
      expect(createIntegrationBodySchema.safeParse({ ...createBody, email }).success).toBe(true);
      expect(updateIntegrationBodySchema.safeParse({ email }).success).toBe(true);
    }
  });

  it("normalizes empty and padded Instagram values on canonical client inputs", () => {
    expect(updateIntegrationBodySchema.parse({ instagram: "  @acme  " }).instagram).toBe("@acme");
    expect(updateIntegrationBodySchema.parse({ instagram: "   " }).instagram).toBeNull();
    expect(
      createIntegrationBodySchema.parse({ ...createBody, instagram: " " }).instagram,
    ).toBeNull();
  });
});

describe("integration tax regime contract", () => {
  it.each([
    "Simples Nacional",
    "Lucro Presumido",
    "Lucro Real",
  ])("accepts the shared regime %s for create and edit", (regime) => {
    expect(createIntegrationBodySchema.safeParse({ ...createBody, regime }).success).toBe(true);
    expect(updateIntegrationBodySchema.safeParse({ regime }).success).toBe(true);
  });

  it.each(["MEI", ""])("rejects unsupported regime %s", (regime) => {
    expect(createIntegrationBodySchema.safeParse({ ...createBody, regime }).success).toBe(false);
    expect(updateIntegrationBodySchema.safeParse({ regime }).success).toBe(false);
  });

  it("accepts an unset regime", () => {
    expect(createIntegrationBodySchema.safeParse({ ...createBody, regime: null }).success).toBe(
      true,
    );
    expect(updateIntegrationBodySchema.safeParse({ regime: null }).success).toBe(true);
  });
});

describe("integration client address contract", () => {
  const address = {
    address: "Rua A, 10",
    cep: "01001-000",
    neighborhood: "Centro",
    state: "SP",
    city: "São Paulo",
  };

  it("accepts optional address fields for create and edit", () => {
    expect(createIntegrationBodySchema.safeParse({ ...createBody, ...address }).success).toBe(true);
    expect(updateIntegrationBodySchema.safeParse(address).success).toBe(true);
  });

  it("accepts unset address values without introducing required fields", () => {
    expect(createIntegrationBodySchema.safeParse(createBody).success).toBe(true);
    expect(
      createIntegrationBodySchema.safeParse({
        ...createBody,
        address: null,
        cep: null,
        neighborhood: null,
        state: null,
        city: null,
      }).success,
    ).toBe(true);
  });
});
