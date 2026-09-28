import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { previousCompetences } from "../services/simplesNationalService.js";
import { SimplesRateService } from "../services/simplesRateService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";

function dependencies(monthly = 15_000) {
  // 11 meses de 15.000 antes de 09/2026: RBT12 180.000 (1ª faixa).
  const records = previousCompetences("2026-09").map((competence) => ({
    competence: new Date(`${competence}-01T00:00:00.000Z`),
    amount: { toString: () => monthly.toFixed(2) },
  }));
  return {
    client: {
      findFirst: vi.fn(async () => ({
        id: clientId,
        name: "Padaria",
        company_name: "Padaria Exemplo Ltda",
        cpf_cnpj: "12.345.678/0001-90",
      })),
    },
    fiscalMonthlyRevenue: { findMany: vi.fn(async () => records) },
  };
}

describe("SimplesRateService", () => {
  it("calcula a prévia com as receitas dos 11 meses anteriores no tenant", async () => {
    const prisma = dependencies();
    const service = new SimplesRateService(prisma as never);

    const result = await service.preview(
      { client_id: clientId, competence: "2026-09" },
      organizationId,
    );

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true },
    });
    expect(prisma.fiscalMonthlyRevenue.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        competence: {
          gte: new Date("2025-10-01T00:00:00.000Z"),
          lte: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
      select: { competence: true, amount: true },
    });
    expect(result).toMatchObject({
      client_id: clientId,
      status: "ok",
      rbt12: "180000.00",
      applies_to: "2026-10",
    });
  });

  it("emite a alíquota do anexo com limite, para a competência seguinte e a razão social", async () => {
    const service = new SimplesRateService(dependencies() as never);

    // Anexo IV na 1ª faixa: 2,0025% bruto, emitido no mínimo de ISS (2,01%).
    await expect(
      service.emission({ client_id: clientId, competence: "2026-09", annex: "IV" }, organizationId),
    ).resolves.toEqual({
      client_id: clientId,
      client_name: "Padaria Exemplo Ltda",
      client_document: "12.345.678/0001-90",
      competence: "2026-09",
      applies_to: "2026-10",
      annex: "IV",
      tax: "ISS",
      rate: "2.01",
    });
  });

  it("não emite sem base de receita", async () => {
    const prisma = dependencies();
    prisma.fiscalMonthlyRevenue.findMany.mockResolvedValueOnce([]);
    const service = new SimplesRateService(prisma as never);

    await expect(
      service.emission(
        { client_id: clientId, competence: "2026-09", annex: "III" },
        organizationId,
      ),
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/não há base/i) });
  });

  it("não emite na 6ª faixa, em que ISS/ICMS saem do Simples", async () => {
    const service = new SimplesRateService(dependencies(350_000) as never);

    await expect(
      service.emission({ client_id: clientId, competence: "2026-09", annex: "I" }, organizationId),
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/6ª faixa/) });
  });

  it("não calcula nem emite para cliente de outra organização", async () => {
    const prisma = dependencies();
    prisma.client.findFirst.mockResolvedValue(null as never);
    const service = new SimplesRateService(prisma as never);

    await expect(
      service.preview({ client_id: clientId, competence: "2026-09" }, organizationId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.emission({ client_id: clientId, competence: "2026-09", annex: "I" }, organizationId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.fiscalMonthlyRevenue.findMany).not.toHaveBeenCalled();
  });
});
