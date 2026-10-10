import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";
import { extractTriageReportingPage } from "../services/triageReportingService.js";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const clientRows = [
  {
    id: CLIENT_A,
    name: "Alfa",
    company_name: "Alfa Comércio Ltda",
    cpf_cnpj: "11222333000181",
    competence_entry: new Date("2024-03-01T00:00:00.000Z"),
    contabil: true,
    fiscal: null,
  },
  {
    id: CLIENT_B,
    name: "Beta",
    company_name: " ",
    cpf_cnpj: "52998224725",
    competence_entry: null,
    contabil: false,
    fiscal: true,
  },
];

function delegates(rows: readonly Record<string, unknown>[]) {
  return {
    clients: { findMany: vi.fn().mockResolvedValue(clientRows) },
    clouds: { findMany: vi.fn().mockResolvedValue(rows) },
    monthly: { findMany: vi.fn().mockResolvedValue(rows) },
  };
}

describe("extractTriageReportingPage", () => {
  it("lista Clouds com cliente e serviço contratado na organização do grant", async () => {
    const prisma = delegates([
      { id: "1", client_id: CLIENT_A, type: "Drive", link: "https://drive.test/a" },
      { id: "2", client_id: CLIENT_B, type: "OneDrive", link: "https://one.test/b" },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_clouds",
        organizationId: ORG,
        fields: [
          "legal_name",
          "trade_name",
          "cpf_cnpj",
          "entry_date",
          "contabil",
          "fiscal",
          "type",
          "link",
        ],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          legal_name: "Alfa Comércio Ltda",
          trade_name: "Alfa",
          cpf_cnpj: "11222333000181",
          entry_date: new Date("2024-03-01T00:00:00.000Z"),
          contabil: true,
          fiscal: false,
          type: "Drive",
          link: "https://drive.test/a",
        },
        {
          legal_name: "Beta",
          trade_name: "Beta",
          cpf_cnpj: "52998224725",
          entry_date: null,
          contabil: false,
          fiscal: true,
          type: "OneDrive",
          link: "https://one.test/b",
        },
      ],
      reachedLimit: false,
    });
    expect(prisma.clouds.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG }, skip: 0, take: 11 }),
    );
    expect(prisma.clients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, id: { in: [CLIENT_A, CLIENT_B] } },
      }),
    );
    expect(prisma.monthly.findMany).not.toHaveBeenCalled();
  });

  it("lista o movimento Contábil por competência sem rotinas arquivadas nem fiscais", async () => {
    const prisma = delegates([
      { id: "1", client_id: CLIENT_A, competence: "2026-09", triad_moviment: true },
      { id: "2", client_id: CLIENT_B, competence: "2026-09", triad_moviment: false },
      { id: "3", client_id: CLIENT_A, competence: "2026-10", triad_moviment: false },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_movement",
        organizationId: ORG,
        fields: ["competence", "sends_movement"],
        limit: 2,
        offset: 4,
      }),
    ).resolves.toEqual({
      rows: [
        { competence: "2026-09", sends_movement: true },
        { competence: "2026-09", sends_movement: false },
      ],
      reachedLimit: true,
    });
    expect(prisma.monthly.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG, type: "CONTABIL", archived_at: null },
      select: { id: true, client_id: true, competence: true, triad_moviment: true },
      orderBy: { id: "asc" },
      skip: 4,
      take: 3,
    });
    // Sem campo de cliente pedido, não consulta clientes.
    expect(prisma.clients.findMany).not.toHaveBeenCalled();
  });
});

describe("InternalReportingService com as áreas da Triagem", () => {
  it("aplica os mesmos filtros de competência, serviço e cliente a quem envia movimento", async () => {
    const prisma = {
      controlContabil: { findMany: vi.fn() },
      responsibleContabil: { findMany: vi.fn() },
      relationshipContabil: { findMany: vi.fn() },
      client: { findMany: vi.fn().mockResolvedValue(clientRows) },
      clientClouds: { findMany: vi.fn() },
      triageMonthly: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ skip = 0, take }: { skip?: number; take: number }) =>
            [
              { id: "1", client_id: CLIENT_A, competence: "2026-09", triad_moviment: true },
              { id: "2", client_id: CLIENT_B, competence: "2026-09", triad_moviment: true },
              { id: "3", client_id: CLIENT_A, competence: "2026-10", triad_moviment: false },
            ].slice(skip, skip + take),
          ),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (read: (transaction: unknown) => Promise<unknown>) => read(prisma),
    );

    const result = await new InternalReportingService(prisma as never).extract({
      organizationId: ORG,
      source: "contabil.triage_movement",
      fields: ["legal_name", "competence"],
      limit: 50,
      query: {
        filters: [
          { field: "competence", operator: "eq", parameter: "competencia", value: "2026-09" },
          { field: "contabil", operator: "eq", parameter: "servico", value: true },
          { field: "sends_movement", operator: "eq", parameter: "envia", value: true },
        ],
      },
    });

    expect(result.rows).toEqual([{ legal_name: "Alfa Comércio Ltda", competence: "2026-09" }]);
  });

  it("recusa campo fora do catálogo das áreas da Triagem", async () => {
    const prisma = { clientClouds: { findMany: vi.fn() } };

    await expect(
      new InternalReportingService(prisma as never).extract({
        organizationId: ORG,
        source: "contabil.triage_clouds",
        fields: ["organization_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.clientClouds.findMany).not.toHaveBeenCalled();
  });
});
