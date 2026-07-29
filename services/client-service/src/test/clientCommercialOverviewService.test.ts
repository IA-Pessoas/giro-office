import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientCommercialOverviewService } from "../services/clientCommercialOverviewService.js";

const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("ClientCommercialOverviewService", () => {
  it("monta overview comercial com dados reais de clientes e zera dominios sem fonte real", async () => {
    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_ORG_ID }),
      },
      client: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "660e8400-e29b-41d4-a716-446655440001",
            name: "Cliente Lead",
            company_name: "Empresa Lead",
            fantasy_name: null,
            cpf_cnpj: "123",
            email: "lead@example.com",
            number: "11999999999",
            indication: "Indicação",
            agent: "Maria",
            status: "Prospecção",
            prospecting_status: "Lead",
            contract: false,
            register_date_prospecting: new Date("2026-07-10T00:00:00.000Z"),
            date_status: new Date("2026-07-12T00:00:00.000Z"),
            description_prospecting: "Cliente interessado",
          },
          {
            id: "660e8400-e29b-41d4-a716-446655440002",
            name: "Cliente Fechado",
            company_name: null,
            fantasy_name: "Fechado LTDA",
            cpf_cnpj: "456",
            email: null,
            number: null,
            indication: null,
            agent: null,
            status: "Ativo",
            prospecting_status: "Fechado",
            contract: true,
            register_date_prospecting: new Date("2026-07-11T00:00:00.000Z"),
            date_status: null,
            description_prospecting: null,
          },
        ]),
      },
    } as unknown as PrismaClient;
    const service = new ClientCommercialOverviewService(prisma);

    const result = await service.getOverview(TEST_ORG_ID);

    expect(result.summary).toEqual({
      totalLeads: 2,
      activeLeads: 1,
      wonLeads: 1,
      totalValue: 0,
      conversionRate: 50,
      activeProposals: 0,
      activeContracts: 1,
    });
    expect(result.leads).toEqual([
      {
        id: "660e8400-e29b-41d4-a716-446655440001",
        name: "Cliente Lead",
        company: "Empresa Lead",
        cnpj: "123",
        email: "lead@example.com",
        phone: "11999999999",
        source: "Indicação",
        status: "new",
        value: 0,
        priority: "medium",
        assignee: "Maria",
        createdDate: "2026-07-10T00:00:00.000Z",
        lastContact: "2026-07-12T00:00:00.000Z",
        nextFollowUp: null,
        notes: "Cliente interessado",
      },
      {
        id: "660e8400-e29b-41d4-a716-446655440002",
        name: "Cliente Fechado",
        company: "Fechado LTDA",
        cnpj: "456",
        email: null,
        phone: null,
        source: "Não informado",
        status: "won",
        value: 0,
        priority: "medium",
        assignee: "Sem responsável",
        createdDate: "2026-07-11T00:00:00.000Z",
        lastContact: null,
        nextFollowUp: null,
        notes: null,
      },
    ]);
    expect(result.proposals).toEqual([]);
    expect(result.contracts).toEqual([]);
    expect(result.sources).toEqual([
      { name: "Indicação", value: 1, color: "#10b981" },
      { name: "Não informado", value: 1, color: "#64748b" },
    ]);
    expect(result.monthlyConversions).toContainEqual({ month: "Jul", leads: 2, won: 1, lost: 0 });
  });

  it("executa consultas em sequencia para evitar esgotar o pool de sessoes", async () => {
    let activeQueries = 0;
    let maxActiveQueries = 0;
    async function trackQuery<T>(result: T): Promise<T> {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      await Promise.resolve();
      activeQueries -= 1;

      return result;
    }
    const prisma = {
      organization: {
        findUnique: vi.fn(() => trackQuery({ id: TEST_ORG_ID })),
      },
      client: {
        count: vi.fn(() => trackQuery(0)),
        findMany: vi.fn(() => trackQuery([])),
      },
    } as unknown as PrismaClient;
    const service = new ClientCommercialOverviewService(prisma);

    await service.getOverview(TEST_ORG_ID);

    expect(maxActiveQueries).toBe(1);
  });
});
