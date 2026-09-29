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
        fiscal: true as boolean | null,
        status: "Ativo",
        competence_output: null as Date | null,
        regime: "Simples Nacional" as string | null,
      })),
    },
    fiscalMonthlyRevenue: {
      findMany: vi.fn(async () => records.map((record) => ({ ...record, client_id: clientId }))),
    },
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
      select: expect.objectContaining({ id: true, fiscal: true, regime: true }),
    });
    expect(prisma.fiscalMonthlyRevenue.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: { in: [clientId] },
        competence: {
          gte: new Date("2025-10-01T00:00:00.000Z"),
          lte: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
      select: { client_id: true, competence: true, amount: true },
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

  it("não emite carta do Simples para cliente fora do Simples ou sem Fiscal", async () => {
    for (const [override, reason] of [
      [{ regime: "Lucro Presumido" }, "Cliente fora do Simples Nacional."],
      [{ fiscal: false }, "Fiscal não habilitado para o cliente."],
      [{ status: "Inativo" }, "Cliente inativo em 10/2026."],
    ] as const) {
      const prisma = dependencies();
      prisma.client.findFirst.mockResolvedValueOnce({
        ...(await prisma.client.findFirst()),
        ...override,
      });
      const service = new SimplesRateService(prisma as never);

      await expect(
        service.emission(
          { client_id: clientId, competence: "2026-09", annex: "III" },
          organizationId,
        ),
      ).rejects.toMatchObject({ statusCode: 422, message: reason });
      expect(prisma.fiscalMonthlyRevenue.findMany).not.toHaveBeenCalled();
    }
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

describe("SimplesRateService.batch", () => {
  const eligible = {
    fiscal: true,
    status: "Ativo",
    competence_output: null,
    regime: "Simples Nacional",
  };
  const clients = [
    {
      id: "c1",
      name: "Padaria",
      company_name: "Padaria Exemplo Ltda",
      cpf_cnpj: "12.345.678/0001-90",
      ...eligible,
    },
    {
      id: "c2",
      name: "Sem Fiscal",
      company_name: null,
      cpf_cnpj: "11111111000111",
      ...eligible,
      fiscal: false,
    },
    {
      id: "c3",
      name: "Inativa",
      company_name: "Inativa SA",
      cpf_cnpj: "22.222.222/0001-22",
      ...eligible,
      status: "Inativo",
    },
    {
      id: "c4",
      name: "Presumido",
      company_name: "Presumido SA",
      cpf_cnpj: "33.333.333/0001-33",
      ...eligible,
      regime: "Lucro Presumido",
    },
    // Regime gravado sem acento/caixa e documento com zero à esquerda perdido na planilha.
    {
      id: "c9",
      name: "Caixa",
      company_name: "Caixa Alta Ltda",
      cpf_cnpj: "01.234.567/0001-89",
      ...eligible,
      regime: " SIMPLES NACIONAL ",
    },
    {
      id: "c5",
      name: "Sem receita",
      company_name: "Sem Receita Ltda",
      cpf_cnpj: "444.444.444-44",
      ...eligible,
    },
    {
      id: "c6",
      name: "Grande",
      company_name: "Grande SA",
      cpf_cnpj: "55.555.555/0001-55",
      ...eligible,
    },
    // Saindo: competência de saída no fim de 09/2026 cobre a alíquota de 09/2026.
    {
      id: "c7",
      name: "Saindo",
      company_name: "=Saindo Ltda",
      cpf_cnpj: "66.666.666/0001-66",
      ...eligible,
      status: "Processo de Inativação",
      competence_output: new Date("2026-09-30T23:59:59.000Z"),
    },
    {
      id: "c8",
      name: "Saiu",
      company_name: "Saiu Ltda",
      cpf_cnpj: "77.777.777/0001-77",
      ...eligible,
      status: "Processo de Inativação",
      competence_output: new Date("2026-08-31T23:59:59.000Z"),
    },
  ];
  const monthly: Record<string, number> = {
    c1: 15_000,
    c6: 350_000,
    c7: 50_000,
    c8: 15_000,
    c9: 15_000,
  };

  function batchPrisma() {
    return {
      client: {
        findFirst: vi.fn(),
        findMany: vi.fn(async () => clients),
      },
      fiscalMonthlyRevenue: {
        findMany: vi.fn(async () =>
          Object.entries(monthly).flatMap(([client_id, amount]) =>
            previousCompetences("2026-08").map((competence) => ({
              client_id,
              competence: new Date(`${competence}-01T00:00:00.000Z`),
              amount: { toString: () => amount.toFixed(2) },
            })),
          ),
        ),
      },
    };
  }

  it("inclui só elegíveis com cálculo válido e informa cada ignorado com o motivo", async () => {
    const prisma = batchPrisma();
    const service = new SimplesRateService(prisma as never);

    const result = await service.batch(
      {
        competence: "2026-08",
        annex: "III",
        documents: [
          "12345678000190",
          "11.111.111/0001-11",
          "22222222000122",
          "33333333000133",
          "44444444444",
          "55555555000155",
          "66666666000166",
          "77777777000177",
          "1234567000189",
          "99.999.999/0001-99",
          "12.345.678/0001-90",
        ],
      },
      organizationId,
    );

    // Busca só no tenant, pelos documentos com e sem máscara.
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: organizationId }),
      }),
    );
    expect(result).toMatchObject({
      competence: "2026-08",
      applies_to: "2026-09",
      annex: "III",
      tax: "ISS",
    });
    expect(result.included.map((item) => [item.client_id, item.rate])).toEqual([
      ["c1", "2.01"], // 1ª faixa: 2,01% bruto, no mínimo do ISS
      ["c7", "3.43"], // 3ª faixa (RBT12 600.000): 3,432%
      ["c9", "2.01"],
    ]);
    // Receitas só do tenant e dos elegíveis, nos 11 meses anteriores.
    expect(prisma.fiscalMonthlyRevenue.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: { in: ["c1", "c9", "c5", "c6", "c7"] },
        competence: {
          gte: new Date("2025-09-01T00:00:00.000Z"),
          lte: new Date("2026-07-01T00:00:00.000Z"),
        },
      },
      select: { client_id: true, competence: true, amount: true },
    });
    expect(result.skipped).toEqual([
      {
        document: "11.111.111/0001-11",
        client_name: "Sem Fiscal",
        reason: "Fiscal não habilitado para o cliente.",
      },
      {
        document: "22222222000122",
        client_name: "Inativa SA",
        reason: "Cliente inativo em 09/2026.",
      },
      {
        document: "33333333000133",
        client_name: "Presumido SA",
        reason: "Cliente fora do Simples Nacional.",
      },
      {
        document: "44444444444",
        client_name: "Sem Receita Ltda",
        reason: "Não há base para calcular: nenhuma receita nos 11 meses anteriores à competência.",
      },
      {
        document: "55555555000155",
        client_name: "Grande SA",
        reason:
          "Sem alíquota de ISS para emitir no Anexo III: na 6ª faixa o tributo é recolhido fora do Simples.",
      },
      {
        document: "77777777000177",
        client_name: "Saiu Ltda",
        reason: "Cliente inativo em 09/2026.",
      },
      {
        document: "99.999.999/0001-99",
        client_name: null,
        reason: "Cliente não encontrado nesta organização.",
      },
      {
        document: "12.345.678/0001-90",
        client_name: "Padaria Exemplo Ltda",
        reason: "Documento repetido no lote.",
      },
    ]);
  });
});
