import "./envBootstrap.js";

import { INTERNAL_ERROR_MESSAGE, ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { AUDIT_UNAVAILABLE_MESSAGE } from "../integrations/audit.js";
import { MarketingEventEditionsService } from "../services/marketingEventEditionsService.js";

const actorUserId = "00000000-0000-4000-8000-000000000009";

function serviceFor(prisma: object, audit = vi.fn(async () => {})) {
  const db = { ...prisma, $transaction: (run: (tx: unknown) => unknown) => run(db) };
  return new MarketingEventEditionsService(db as never, audit);
}

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

    const result = await serviceFor(prisma).listEditions(organizationId, eventId);

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

    const result = await serviceFor(prisma).createEdition(
      organizationId,
      eventId,
      {
        ...input,
        feedbackPeriodStart: periodStart.toISOString(),
        feedbackPeriodEnd: periodEnd.toISOString(),
      } as never,
      actorUserId,
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

  it("normalizes unexpected edition persistence failures to the internal error", async () => {
    const prisma = {
      marketingEventEdition: { create: vi.fn().mockRejectedValue(new Error("database detail")) },
    };

    await expect(
      serviceFor(prisma).createEdition(organizationId, eventId, input, actorUserId),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: INTERNAL_ERROR_MESSAGE,
    });
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

    const result = await serviceFor(prisma).createEditionFeedback(
      organizationId,
      eventId,
      editionId,
      { rating: 5, observation: "Ótima organização" },
      actorUserId,
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
      serviceFor(prisma).createEditionFeedback(
        organizationId,
        eventId,
        editionId,
        { rating: 4 },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("normalizes unexpected feedback persistence failures to the internal error", async () => {
    const prisma = {
      marketingEventEdition: { findFirst: vi.fn().mockResolvedValue({ id: editionId }) },
      marketingEventEditionFeedback: {
        create: vi.fn().mockRejectedValue(new Error("database detail")),
      },
    };

    await expect(
      serviceFor(prisma).createEditionFeedback(
        organizationId,
        eventId,
        editionId,
        { rating: 4 },
        actorUserId,
      ),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: INTERNAL_ERROR_MESSAGE,
    });
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

    const result = await serviceFor(prisma).getEditionReport(organizationId, eventId, editionId);

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
        findFirst: vi.fn().mockResolvedValue({
          ...storedEdition(),
          event: {
            id: eventId,
            name: "Feira",
            logo: null,
            status: "Novo",
            priority: "Média",
            objective: null,
            audience: null,
          },
        }),
      },
    };
    const result = await serviceFor(prisma).getEditionReport(organizationId, eventId, editionId);
    expect(result?.edition.feedback).toBeNull();
  });

  it("does not return a report across organizations or event ids", async () => {
    const prisma = { marketingEventEdition: { findFirst: vi.fn().mockResolvedValue(null) } };
    const result = await serviceFor(prisma).getEditionReport(
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

    const result = await serviceFor(prisma).createEdition(
      organizationId,
      eventId,
      input as never,
      actorUserId,
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
      new MarketingEventEditionsService(prisma as never, vi.fn()).updateEdition(
        organizationId,
        eventId,
        editionId,
        input as never,
        actorUserId,
      ),
    ).resolves.toBeNull();
    expect(tx.marketingEventEdition.findFirst).toHaveBeenCalledWith({
      where: { id: editionId, organization_id: organizationId, event_id: eventId },
      include: expect.anything(),
    });
    expect(tx.marketingEventEdition.update).not.toHaveBeenCalled();
  });

  it("records who planned a new edition, including budget and feedback period", async () => {
    const audit = vi.fn(async () => {});
    const record = {
      ...storedEdition(),
      feedback_period_start: new Date("2026-10-01T09:00:00.000Z"),
      feedback_period_end: new Date("2026-10-30T18:00:00.000Z"),
    };
    const prisma = { marketingEventEdition: { create: vi.fn().mockResolvedValue(record) } };

    await serviceFor(prisma, audit).createEdition(
      organizationId,
      eventId,
      input as never,
      actorUserId,
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId: actorUserId,
        action: "Cadastro",
        referring: "marketing.eventEditions",
        referringId: editionId,
        changes: expect.objectContaining({
          eventId: { from: null, to: eventId },
          budgetItems: {
            from: null,
            to: [
              { name: "Espaço", amount: "1000000000.01" },
              { name: "Água", amount: "0.09" },
            ],
          },
          feedbackPeriodEnd: { from: null, to: "2026-10-30T18:00:00.000Z" },
        }),
      }),
    );
  });

  it("records planning and feedback period changes of an edition with previous values", async () => {
    const audit = vi.fn(async () => {});
    const current = storedEdition();
    const updated = {
      ...storedEdition(),
      logistics: { fornecedores: ["Som", "Buffet"] },
      feedback_period_end: new Date("2026-12-01T18:00:00.000Z"),
      budgetItems: storedEdition().budgetItems.map((item) => ({ ...item, id: `${item.id}-new` })),
    };
    const prisma = {
      marketingEventEdition: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue(updated),
      },
    };

    await serviceFor(prisma, audit).updateEdition(
      organizationId,
      eventId,
      editionId,
      input as never,
      actorUserId,
    );

    expect(audit).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      action: "Edição",
      referring: "marketing.eventEditions",
      referringId: editionId,
      changes: {
        logistics: { from: { fornecedores: ["Som"] }, to: { fornecedores: ["Som", "Buffet"] } },
        feedbackPeriodEnd: { from: null, to: "2026-12-01T18:00:00.000Z" },
      },
    });
  });

  it("records who evaluated an edition", async () => {
    const audit = vi.fn(async () => {});
    const prisma = {
      marketingEventEdition: { findFirst: vi.fn().mockResolvedValue({ id: editionId }) },
      marketingEventEditionFeedback: {
        create: vi.fn().mockResolvedValue({
          rating: 4,
          observation: null,
          evaluated_at: new Date("2026-11-01T12:30:00.000Z"),
        }),
      },
    };

    await serviceFor(prisma, audit).createEditionFeedback(
      organizationId,
      eventId,
      editionId,
      { rating: 4 },
      actorUserId,
    );

    expect(audit).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      action: "Avaliação",
      referring: "marketing.eventEditionFeedback",
      referringId: editionId,
      changes: { rating: { from: null, to: 4 }, observation: { from: null, to: null } },
    });
  });

  it("does not evaluate nor audit an edition of another organization", async () => {
    const audit = vi.fn(async () => {});
    const prisma = {
      marketingEventEdition: { findFirst: vi.fn().mockResolvedValue(null) },
      marketingEventEditionFeedback: { create: vi.fn() },
    };

    await expect(
      serviceFor(prisma, audit).createEditionFeedback(
        organizationId,
        eventId,
        editionId,
        { rating: 4 },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.marketingEventEditionFeedback.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("keeps the audit unavailability error instead of reporting success", async () => {
    const audit = vi.fn(async () => {
      throw new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE);
    });
    const prisma = {
      marketingEventEdition: { create: vi.fn().mockResolvedValue(storedEdition()) },
    };

    await expect(
      serviceFor(prisma, audit).createEdition(organizationId, eventId, input as never, actorUserId),
    ).rejects.toMatchObject({ statusCode: 503, message: AUDIT_UNAVAILABLE_MESSAGE });
  });
});
