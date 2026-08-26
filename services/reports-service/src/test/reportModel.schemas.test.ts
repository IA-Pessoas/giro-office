import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as reportModelSchemas from "../schemas/reportModel.schemas.js";

const definition = {
  sources: ["finance.ledger"],
  columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
};

describe("reportModelSchema", () => {
  it("mantém a definição declarativa da versão pessoal", () => {
    expect(
      reportModelSchemas.reportModelSchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        organization_id: "00000000-0000-4000-8000-000000000002",
        name: "Saldo",
        version: 1,
        definition,
      }),
    ).toMatchObject({ definition });
  });

  it("aceita atualização parcial e rejeita corpo vazio", () => {
    const schema = reportModelSchemas.updateReportModelSchema;

    expect(schema.parse({ name: "Saldo atualizado" })).toEqual({ name: "Saldo atualizado" });
    expect(() => schema.parse({})).toThrow("Informe nome ou definição para atualizar o modelo.");
  });

  it("mantém coluna de autor na migration de modelos pessoais", () => {
    const migration = new URL(
      "../../../../infra/prisma/migrations/20260825200000_report_model_personal_owner/migration.sql",
      import.meta.url,
    );

    expect(existsSync(migration)).toBe(true);
    expect(readFileSync(migration, "utf8")).toContain('ADD COLUMN "created_by_user_id" TEXT');
  });
});
