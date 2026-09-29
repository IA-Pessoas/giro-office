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
    feedback_period_start: null,
    feedback_period_end: null,
    feedback: null,
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

  it("stores an optional valid feedback period", async () => {
    const periodStart = new Date("2026-10-01T09:00:00.000Z");
    const periodEnd = new Date("2026-10-30T18:00:00.000Z");
    const record = {
      ...storedEdition(),
      feedback_period_start: periodStart,
      feedback_period_end: periodEnd,
    };
    const prisma = {
      marketingEventEdition: { create: vi.fn().mockResolvedValue(record) },
    };

    const result = await new MarketingEventEditionsService(prisma as never).createEdition(
      organizationId,
      eventId,
      {
        ...input,
        feedbackPeriodStart: periodStart.toISOString(),
        feedbackPeriodEnd: periodEnd.toISOString(),
      } as never,
    );

    expect(result.feedbackPeriodStart).toBe(periodStart.toISOString());
    expect(result.feedbackPeriodEnd).toBe(periodEnd.toISOString());
    expect(prisma.marketingEventEdition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedback_period_start: periodStart,
          feedback_period_end: periodEnd,
        }),
      }),
    );
  });

  it("creates one rating and observation for an edition", async () => {
    const evaluatedAt = new Date("2026-11-01T12:30:00.000Z");
    const prisma = {
      marketingEventEdition: { findFirst: vi.fn().mockResolvedValue({ id: editionId }) },
      marketingEventEditionFeedback: {
        create: vi.fn().mockResolvedValue({
          id: "50000000-0000-4000-8000-000000000001",
          rating: 5,
          observation: "Ótima organização",
          evaluated_at: evaluatedAt,
        }),
      },
    };

    const result = await new MarketingEventEditionsService(prisma as never).createEditionFeedback(
      organizationId,
      eventId,
      editionId,
      { rating: 5, observation: "Ótima organização" },
    );

    expect(result).toMatchObject({
      rating: 5,
      observation: "Ótima organização",
      evaluatedAt: evaluatedAt.toISOString(),
    });
    expect(prisma.marketingEventEdition.findFirst).toHaveBeenCalledWith({
      where: { id: editionId, organization_id: organizationId, event_id: eventId },
      select: { id: true },
    });
    expect(prisma.marketingEventEditionFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organizationId,
        edition_id: editionId,
        rating: 5,
        observation: "Ótima organização",
      }),
    });
  });

  it("rejects a second evaluation with a domain conflict", async () => {
    const duplicateError = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const prisma = {
      marketingEventEdition: { findFirst: vi.fn().mockResolvedValue({ id: editionId }) },
      marketingEventEditionFeedback: { create: vi.fn().mockRejectedValue(duplicateError) },
    };

    await expect(
      new MarketingEventEditionsService(prisma as never).createEditionFeedback(
        organizationId,
        eventId,
        editionId,
        { rating: 4 },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("composes report with edition sections, budget, period, and available feedback", async () => {
    const record = {
      ...storedEdition(),
      feedback_period_start: new Date("2026-10-01T09:00:00.000Z"),
      feedback_period_end: new Date("2026-10-30T18:00:00.000Z"),
      feedback: {
        rating: 5,
        observation: "Ótima organização",
        evaluated_at: new Date("2026-11-01T12:30:00.000Z"),
      },
      event: {
        id: eventId,
        name: "Feira anual",
        logo: "",
        status: "Novo",
        priority: "Média",
        objective: "Apresentar serviços",
        audience: "Comunidade",
      },
    };
    const prisma = { marketingEventEdition: { findFirst: vi.fn().mockResolvedValue(record) } };

    const result = await new MarketingEventEditionsService(prisma as never).getEditionReport(
      organizationId,
      eventId,
      editionId,
    );

    expect(result).toMatchObject({
      event: { id: eventId, name: "Feira anual", objective: "Apresentar serviços" },
      edition: {
        id: editionId,
        budgetTotal: "1000000000.10",
        feedbackPeriodStart: "2026-10-01T09:00:00.000Z",
        feedbackPeriodEnd: "2026-10-30T18:00:00.000Z",
        feedback: { rating: 5, observation: "Ótima organização" },
        logistics: { fornecedores: ["Som"] },
        afterEvent: { followup: ["Pesquisa"] },
      },
    });
    expect(prisma.marketingEventEdition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: editionId, organization_id: organizationId, event_id: eventId },
      }),
    );
  });

  it("omits absent optional feedback from the report", async () => {
    const prisma = {
      marketingEventEdition: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...storedEdition(), event: { id: eventId, name: "Feira" } }),
      },
    };
    const result = await new MarketingEventEditionsService(prisma as never).getEditionReport(
      organizationId,
      eventId,
      editionId,
    );
    expect(result?.edition.feedback).toBeNull();
  });

  it("does not return a report across organizations or event ids", async () => {
    const prisma = { marketingEventEdition: { findFirst: vi.fn().mockResolvedValue(null) } };
    const result = await new MarketingEventEditionsService(prisma as never).getEditionReport(
      organizationId,
      "foreign-event-id",
      editionId,
    );
    expect(result).toBeNull();
    expect(prisma.marketingEventEdition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: editionId, organization_id: organizationId, event_id: "foreign-event-id" },
      }),
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
