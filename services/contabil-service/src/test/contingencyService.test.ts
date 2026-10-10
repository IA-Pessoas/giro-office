import { parseWithZod } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import { contingencyQuerySchema } from "../schemas/contingency.schemas.js";
import { ContingencyService } from "../services/contingencyService.js";
import { contingencyXls } from "./contingencyFixtures.js";
import { contingencyDatabase } from "./contingencyReviewFixtures.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const clientId = "b0000000-0000-4000-8000-000000000001";
const auth = { userId: "user", organizationId, permission: 2 };
const input = {
  client_id: clientId,
  company_name: "Empresa Sintética",
  cnpj: "11222333000181",
  period_start: "2026-01",
  period_end: "2026-06",
  regime: "Simples Nacional",
  annex: "III",
  filename: "balancete.xls",
};

function setup() {
  return new ContingencyService(contingencyDatabase(organizationId).prisma);
}

describe("ContingencyService", () => {
  it("simula para o cliente da organização, com alíquota inicial de 11% e sem armazenar o XLS", async () => {
    const result = await setup().simulate(
      contingencyXls(),
      parseWithZod(contingencyQuerySchema, input),
      auth,
    );
    expect(result).toMatchObject({
      parameters: { ...input, rate: 11 },
      classification: "legacy_hypothesis",
      minimum: { totalCents: 398200 },
      maximum: { totalCents: 955680 },
    });
    expect(JSON.stringify(result)).not.toContain("buffer");
  });

  it("recusa outra organização e cliente divergente", async () => {
    const data = parseWithZod(contingencyQuerySchema, input);
    await expect(
      setup().simulate(contingencyXls(), data, { ...auth, organizationId: "other" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      setup().simulate(contingencyXls(), { ...data, company_name: "Outra empresa" }, auth),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      setup().simulate(contingencyXls(), { ...data, cnpj: "99888777000166" }, auth),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("recusa leitor sem edição e parâmetros inválidos", async () => {
    await expect(
      setup().simulate(contingencyXls(), parseWithZod(contingencyQuerySchema, input), {
        ...auth,
        permission: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    for (const bad of [
      { rate: "NaN" },
      { rate: "" },
      { rate: 101 },
      { rate: -1 },
      { period_end: "2025-01" },
      { cnpj: "00000000000000" },
      { organization_id: "other" },
      { filename: "../file.xls" },
      { regime: "Lucro Real" },
      { period_start: "2026-13" },
    ]) {
      expect(() => parseWithZod(contingencyQuerySchema, { ...input, ...bad })).toThrow();
    }
  });
});
