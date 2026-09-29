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
