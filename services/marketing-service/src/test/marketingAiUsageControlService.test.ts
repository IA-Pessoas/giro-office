import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketingAiUsageControlService } from "../services/marketingAiUsageControlService.js";

const actorUserId = "00000000-0000-4000-8000-000000000009";
const blankAnswers = {
  knowledge: null,
  integration: null,
  frequency: null,
  purpose: null,
  perceived_gain: null,
};

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const competence = "2026-04";

function createPrisma() {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: userId }),
      findMany: vi.fn().mockResolvedValue([{ id: userId }, { id: "user-2" }]),
    },
    marketingAiUsageControl: {
      create: vi.fn().mockResolvedValue({ id: "control-1" }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: "control-1", ...blankAnswers }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(3),
    },
    marketingAiUsageImportReconciliation: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };
  return prisma;
}

describe("MarketingAiUsageControlService", () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: MarketingAiUsageControlService;
  let audit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = createPrisma();
    audit = vi.fn(async () => {});
    service = new MarketingAiUsageControlService(prisma as never, audit);
  });

  it("cria controle mensal somente para usuário ativo da organização", async () => {
    await service.createForUser(organizationId, userId, competence, actorUserId);

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

    await expect(
      service.createForUser(organizationId, userId, competence, actorUserId),
    ).rejects.toMatchObject({
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

  it("separa não respondeu de respondeu Não e ignora outra organização", async () => {
    type Row = Record<string, unknown> & { id: string };
    const april = new Date("2026-04-01T00:00:00.000Z");
    const rows: Row[] = [
      {
        id: "sem-resposta",
        organization_id: organizationId,
        competence: april,
        knowledge: null,
        integration: null,
      },
      {
        id: "respondeu-nao",
        organization_id: organizationId,
        competence: april,
        knowledge: false,
        integration: false,
      },
      {
        id: "respondeu-sim",
        organization_id: organizationId,
        competence: april,
        knowledge: true,
        integration: true,
      },
      {
        id: "outra-org",
        organization_id: "other-org",
        competence: april,
        knowledge: null,
        integration: false,
      },
      {
        id: "outro-mes",
        organization_id: organizationId,
        competence: new Date("2026-05-01T00:00:00.000Z"),
        knowledge: null,
        integration: false,
      },
    ];
    // Avalia o `where` do Prisma sobre linhas em memória (igualdade e OR).
    const matches = (where: Record<string, unknown>, row: Row): boolean =>
      Object.entries(where).every(([key, expected]) =>
        key === "OR"
          ? (expected as Record<string, unknown>[]).some((clause) => matches(clause, row))
          : expected instanceof Date
            ? (row[key] as Date).getTime() === expected.getTime()
            : row[key] === expected,
      );
    prisma.marketingAiUsageControl.findMany = vi.fn(async ({ where }) =>
      rows.filter((row) => matches(where, row)),
    );

    const report = await service.getReport(organizationId, competence);
    const ids = (list: Row[]) => list.map((row) => row.id);

    expect(ids(report.unanswered as Row[])).toEqual(["sem-resposta"]);
    expect(ids(report.withoutIntegration as Row[])).toEqual(["respondeu-nao"]);
    expect(ids(report.pending as Row[])).toEqual(["sem-resposta"]);
  });

  it("atualiza respostas dentro da organização autenticada", async () => {
    const control = { id: "control-1", ...blankAnswers, frequency: 10 };
    prisma.marketingAiUsageControl.findFirst
      .mockResolvedValueOnce({ id: "control-1", ...blankAnswers })
      .mockResolvedValueOnce(control);

    await expect(
      service.updateAnswers(organizationId, "control-1", { frequency: 10 }, actorUserId),
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

  it("não atualiza nem audita controle pertencente a outra organização", async () => {
    prisma.marketingAiUsageControl.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.updateAnswers(organizationId, "control-elsewhere", { knowledge: false }, actorUserId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.marketingAiUsageControl.findFirst).toHaveBeenCalledWith({
      where: { id: "control-elsewhere", organization_id: organizationId },
    });
    expect(prisma.marketingAiUsageControl.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("registra ator, organização, controle e resposta anterior/nova após a edição", async () => {
    prisma.marketingAiUsageControl.findFirst
      .mockResolvedValueOnce({ id: "control-1", ...blankAnswers, integration: true })
      .mockResolvedValueOnce({ id: "control-1", ...blankAnswers, integration: false });

    await service.updateAnswers(organizationId, "control-1", { integration: false }, actorUserId);

    expect(audit).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      action: "Edição",
      referring: "marketing.aiUsageControls",
      referringId: "control-1",
      changes: { integration: { from: true, to: false } },
    });
  });

  it("registra quem criou o controle mensal e para qual usuário e competência", async () => {
    await service.createForUser(organizationId, userId, competence, actorUserId);

    expect(audit).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      action: "Cadastro",
      referring: "marketing.aiUsageControls",
      referringId: "control-1",
      changes: {
        userId: { from: null, to: userId },
        competence: { from: null, to: competence },
      },
    });
  });

  it("falha a edição quando a trilha exigida não é gravada", async () => {
    audit.mockRejectedValueOnce(Object.assign(new Error("audit down"), { statusCode: 503 }));
    prisma.marketingAiUsageControl.findFirst
      .mockResolvedValueOnce({ id: "control-1", ...blankAnswers })
      .mockResolvedValueOnce({ id: "control-1", ...blankAnswers, knowledge: true });

    await expect(
      service.updateAnswers(organizationId, "control-1", { knowledge: true }, actorUserId),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejeita frequência fora da faixa sem gravar", async () => {
    await expect(
      service.updateAnswers(organizationId, "control-1", { frequency: 11 }, actorUserId),
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
