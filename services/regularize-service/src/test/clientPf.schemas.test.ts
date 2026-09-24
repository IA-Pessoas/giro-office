import { describe, expect, it } from "vitest";

import { createClientPfBodySchema } from "../schemas/clientPf.schemas.js";

describe("client PF body schema", () => {
  it("accepts a PF without a father", () => {
    const result = createClientPfBodySchema.safeParse({
      code: "PF-001",
      name: "Pessoa",
      sex: "Feminino",
      address: "Rua A",
      city: "Cidade",
      zip_code: "01001-000",
      state: "SP",
      profession: "Advogada",
      mother: "Mae",
      marital_status: "Solteira",
      date_of_birth: "1990-01-01",
      cpf: "12345678901",
      rg: "456",
      status: "Ativo",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.father).toBe("");
  });
});
