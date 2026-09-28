import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MarketingEventEditionsService } from "../services/marketingEventEditionsService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const editionId = "30000000-0000-4000-8000-000000000001";

function storedEdition() {
  return {
    id: editionId,
    organization_id: organizationId,
    event_id: eventId,
    legacy_id: null,
    name: "Encontro anual",
    date: new Date("2026-11-12T00:00:00.000Z"),
    place: "Castelo Branco",
    partnerships: ["Patrocinador"],
    organizing_team: ["Coordenação"],
    logistics: { fornecedores: ["Som"] },
    marketing_communication: { abertura: ["Inscrições"] },
    during_event: { recepcao: ["Credenciamento"] },
    after_event: { followup: ["Pesquisa"] },
    notes: "Levar material impresso.",
    budgetItems: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        legacy_id: null,
        name: "Espaço",
        amount: "1000000000.01",
        position: 0,
      },
      {
        id: "40000000-0000-4000-8000-000000000002",
        legacy_id: null,
        name: "Água",
        amount: "0.09",
        position: 1,
      },
    ],
  };
}

const input = {
  name: "Encontro anual",
  date: "2026-11-12",
  place: "Castelo Branco",
  budgetItems: [
    { name: "Espaço", amount: "1000000000.01" },
    { name: "Água", amount: "0.09" },
  ],
  partnerships: ["Patrocinador"],
  organizingTeam: ["Coordenação"],
  logistics: {
    fornecedores: ["Som"],
    cronograma: [],
    registro: [],
    transporte: [],
    acomodacoes: [],
  },
  marketingCommunication: { abertura: ["Inscrições"], divulgacao: [], acessoria: [], site: [] },
  duringEvent: { recepcao: ["Credenciamento"], staff: [], programacao: [], feedback: [] },
  afterEvent: { avaliacao: [], agradecimento: [], relatorio: [], followup: ["Pesquisa"] },
  notes: "Levar material impresso.",
};

describe("MarketingEventEditionsService", () => {
  it("lists editions within the requested event and computes totals with exact cents", async () => {
    const prisma = {
      marketingEventEdition: {
        findMany: vi.fn().mockResolvedValue([storedEdition()]),
      },
    };

    const result = await new MarketingEventEditionsService(prisma as never).listEditions(
      organizationId,
      eventId,
    );

    expect(result).toMatchObject([
      { id: editionId, eventId, name: "Encontro anual", budgetTotal: "1000000000.10" },
    ]);
    expect(prisma.marketingEventEdition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId, event_id: eventId } }),
    );
  });

  it("creates the edition through a tenant-scoped parent connection and returns its total", async () => {
    const prisma = {
      marketingEventEdition: {
        create: vi.fn().mockResolvedValue(storedEdition()),
      },
    };

    const result = await new MarketingEventEditionsService(prisma as never).createEdition(
      organizationId,
      eventId,
      input as never,
    );

    expect(result.budgetTotal).toBe("1000000000.10");
    expect(prisma.marketingEventEdition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: {
            connect: { id_organization_id: { id: eventId, organization_id: organizationId } },
          },
          budgetItems: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ amount: "1000000000.01", position: 0 }),
            ]),
          }),
        }),
      }),
    );
  });

  it("does not update an edition unless both event and organization match", async () => {
    const tx = {
      marketingEventEdition: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const prisma = { $transaction: vi.fn((callback: (tx: typeof tx) => unknown) => callback(tx)) };

    await expect(
      new MarketingEventEditionsService(prisma as never).updateEdition(
        organizationId,
        eventId,
        editionId,
        input as never,
      ),
    ).resolves.toBeNull();
    expect(tx.marketingEventEdition.findFirst).toHaveBeenCalledWith({
      where: { id: editionId, organization_id: organizationId, event_id: eventId },
      select: { id: true },
    });
    expect(tx.marketingEventEdition.update).not.toHaveBeenCalled();
  });
});
