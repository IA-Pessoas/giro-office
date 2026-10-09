import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketingAiUsageControlService } from "../services/marketingAiUsageControlService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const competence = "2026-04";

function createPrisma() {
  return {
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: userId }),
      findMany: vi.fn().mockResolvedValue([{ id: userId }, { id: "user-2" }]),
    },
    marketingAiUsageControl: {
      create: vi.fn().mockResolvedValue({ id: "control-1" }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(3),
    },
    marketingAiUsageImportReconciliation: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("MarketingAiUsageControlService", () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: MarketingAiUsageControlService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new MarketingAiUsageControlService(prisma as never);
  });

  it("cria controle mensal somente para usuário ativo da organização", async () => {
    await service.createForUser(organizationId, userId, competence);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: userId,
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
      },
      select: { id: true },
    });
    expect(prisma.marketingAiUsageControl.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        user_id: userId,
        competence: new Date("2026-04-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
  });

  it("converte duplicidade unitária em conflito de domínio", async () => {
    prisma.marketingAiUsageControl.create.mockRejectedValue({ code: "P2002" });

    await expect(service.createForUser(organizationId, userId, competence)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("cria controles em lote sem duplicar competência já existente", async () => {
    await expect(service.createForActiveUsers(organizationId, competence)).resolves.toEqual({
      created: 1,
      alreadyExisted: 1,
    });

    expect(prisma.marketingAiUsageControl.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          user_id: userId,
          competence: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          organization_id: organizationId,
          user_id: "user-2",
          competence: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
      skipDuplicates: true,
    });
  });

  it("lista usuários ativos somente pela organização ou departamento", async () => {
    await service.listEligibleUsers(organizationId);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
      },
      select: { id: true, name: true, full_name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("marca controles com qualquer resposta ausente e separa integração explicitamente negativa", async () => {
    const pending = [{ id: "pending-1", user: { id: userId, name: "Ana" } }];
    const unanswered = [{ id: "unanswered-1", user: { id: userId, name: "Ana" } }];
    const withoutIntegration = [{ id: "no-integration", user: { id: "user-2", name: "Bia" } }];
    prisma.marketingAiUsageControl.findMany
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(unanswered)
      .mockResolvedValueOnce(withoutIntegration);

    await expect(service.getReport(organizationId, competence)).resolves.toEqual({
      pending,
      unanswered,
      withoutIntegration,
    });

    expect(prisma.marketingAiUsageControl.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        organization_id: organizationId,
        competence: new Date("2026-04-01T00:00:00.000Z"),
        OR: [
          { knowledge: null },
          { integration: null },
          { frequency: null },
          { purpose: null },
          { perceived_gain: null },
        ],
      },
      include: { user: { select: { id: true, name: true, full_name: true } } },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    });
    // Legado: "sem resposta" é conhecimento=0 (nulo aqui); "sem integração" é integracao=1 ("Não").
    expect(prisma.marketingAiUsageControl.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: organizationId,
        competence: new Date("2026-04-01T00:00:00.000Z"),
        knowledge: null,
      },
      include: { user: { select: { id: true, name: true, full_name: true } } },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    });
    expect(prisma.marketingAiUsageControl.findMany).toHaveBeenNthCalledWith(3, {
      where: {
        organization_id: organizationId,
        competence: new Date("2026-04-01T00:00:00.000Z"),
        integration: false,
      },
      include: { user: { select: { id: true, name: true, full_name: true } } },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    });
  });

  it("atualiza respostas dentro da organização autenticada", async () => {
    const control = { id: "control-1", frequency: 10 };
    prisma.marketingAiUsageControl.findFirst = vi.fn().mockResolvedValue(control);

    await expect(
      service.updateAnswers(organizationId, "control-1", { frequency: 10 }),
    ).resolves.toEqual(control);

    expect(prisma.marketingAiUsageControl.updateMany).toHaveBeenCalledWith({
      where: { id: "control-1", organization_id: organizationId },
      data: { frequency: 10 },
    });
    expect(prisma.marketingAiUsageControl.findFirst).toHaveBeenCalledWith({
      where: { id: "control-1", organization_id: organizationId },
      include: { user: { select: { id: true, name: true, full_name: true } } },
    });
  });

  it("não atualiza controle pertencente a outra organização", async () => {
    prisma.marketingAiUsageControl.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateAnswers(organizationId, "control-elsewhere", { knowledge: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.marketingAiUsageControl.updateMany).toHaveBeenCalledWith({
      where: { id: "control-elsewhere", organization_id: organizationId },
      data: { knowledge: false },
    });
  });

  it("rejeita frequência fora da faixa sem gravar", async () => {
    await expect(
      service.updateAnswers(organizationId, "control-1", { frequency: 11 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.marketingAiUsageControl.updateMany).not.toHaveBeenCalled();
  });

  it("recusa competência malformada antes de consultar o banco", async () => {
    await expect(service.getReport(organizationId, "2026-13")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.marketingAiUsageControl.findMany).not.toHaveBeenCalled();
  });

  it("importa apenas usuário e competência exatos e encaminha os demais à reconciliação", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: userId }] as never);
    prisma.marketingAiUsageControl.createMany.mockResolvedValue({ count: 1 });

    await expect(
      service.importLegacyRecords(organizationId, [
        {
          legacyUserId: userId,
          competence: "2026-04",
          knowledge: true,
          integration: false,
          frequency: 5,
          purpose: "Pesquisa",
          perceived_gain: null,
        },
        {
          legacyUserId: "legacy-ambiguous",
          competence: "2026-04",
          knowledge: null,
          integration: null,
          frequency: null,
          purpose: null,
          perceived_gain: null,
        },
      ]),
    ).resolves.toEqual({ imported: 1, alreadyExisted: 0, reconciliation: 1 });

    expect(prisma.marketingAiUsageControl.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          user_id: userId,
          competence: new Date("2026-04-01T00:00:00.000Z"),
          knowledge: true,
          integration: false,
          frequency: 5,
          purpose: "Pesquisa",
          perceived_gain: null,
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.marketingAiUsageImportReconciliation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organization_id: organizationId,
          legacy_user_id: "legacy-ambiguous",
          legacy_competence: "2026-04",
          status: "pending",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("deduplica registros de reconciliação repetidos no mesmo lote", async () => {
    const unmatchedRecord = {
      legacyUserId: "legacy-ambiguous",
      competence: "2026-04",
      knowledge: null,
      integration: null,
      frequency: null,
      purpose: null,
      perceived_gain: null,
    };

    await service.importLegacyRecords(organizationId, [unmatchedRecord, unmatchedRecord]);

    expect(prisma.marketingAiUsageImportReconciliation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organization_id: organizationId,
          legacy_user_id: "legacy-ambiguous",
          legacy_competence: "2026-04",
          status: "pending",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
