import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { ObligationService } from "../services/obligationService.js";
import {
  clientId,
  createAuditMock,
  organizationId,
  otherClientId,
  recordId,
  responsibleId,
  userId,
} from "./pessoalCoreTestUtils.js";

function payrollRow(id: string, policy = "NORMAL", archivedAt: Date | null = null) {
  return {
    id: `payroll-${id}`,
    client_id: id,
    responsible_id: responsibleId,
    advance: true,
    assistance_fee: true,
    bem_mais: false,
    bsf: true,
    va: true,
    vt: false,
    group: {
      id: `group-${id}`,
      name: `Grupo ${id}`,
      policy,
      archived_at: archivedAt,
      organization_id: organizationId,
    },
  };
}

function createPrismaMock() {
  return {
    client: {
      findFirst: vi.fn(async () => ({ id: clientId })),
      findMany: vi.fn(async () => [{ id: clientId }, { id: otherClientId }]),
    },
    payroll: {
      findFirst: vi.fn(async () => payrollRow(clientId)),
      findMany: vi.fn(async () => [payrollRow(clientId), payrollRow(otherClientId)]),
    },
    user: {
      findFirst: vi.fn(async (): Promise<{ id: string } | null> => ({ id: responsibleId })),
    },
    obrigationsPessoal: {
      findFirst: vi.fn(
        async (): Promise<{ id: string; client_id?: string; organization_id?: string } | null> =>
          null,
      ),
      findMany: vi.fn(async () => [{ client_id: otherClientId }]),
      create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      update: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

describe("ObligationService", () => {
  it("bloqueia mutacoes de obrigacoes para Viewer antes de acessar a persistencia", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new ObligationService(prisma as never, audit);
    const viewerContext = { organizationId, userId, permission: 1 };
    const operations = [
      () =>
        service.create(viewerContext, {
          client_id: clientId,
          competence: "2026-06",
        }),
      () => service.updateField(viewerContext, recordId, { payroll: true }),
      () => service.generateForCompetence(viewerContext, "2026-06"),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.obrigationsPessoal.findFirst).not.toHaveBeenCalled();
    expect(prisma.obrigationsPessoal.create).not.toHaveBeenCalled();
    expect(prisma.obrigationsPessoal.update).not.toHaveBeenCalled();
    expect(prisma.obrigationsPessoal.createMany).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("cria obrigacao de forma idempotente", async () => {
    const prisma = createPrismaMock();
    const service = new ObligationService(prisma as never, createAuditMock());

    const created = await service.create(
      { organizationId, userId, permission: 2 },
      { client_id: clientId, competence: "2026-06" },
    );

    expect(prisma.obrigationsPessoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          competence: "2026-06",
          organization_id: organizationId,
          advance: false,
          payroll: false,
          charges: false,
          assistance_fee: false,
          responsavel_id: responsibleId,
          bsf: false,
          va: false,
          vt: null,
          group_snapshot_id: `group-${clientId}`,
          group_snapshot_name: `Grupo ${clientId}`,
          group_snapshot_policy: "NORMAL",
        }),
      }),
    );
    expect(created).toMatchObject({ created: true, obligation: { id: recordId } });

    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce({
      id: recordId,
      client_id: clientId,
    });
    const existing = await service.create(
      { organizationId, userId, permission: 2 },
      { client_id: clientId, competence: "2026-06" },
    );

    expect(existing).toMatchObject({ created: false, obligation: { id: recordId } });
  });

  it("retorna obrigacao existente quando corrida de criacao viola unicidade", async () => {
    const prisma = createPrismaMock();
    const uniqueError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    prisma.obrigationsPessoal.create.mockRejectedValueOnce(uniqueError);
    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: recordId,
      client_id: clientId,
      organization_id: organizationId,
    });
    const audit = createAuditMock();
    const service = new ObligationService(prisma as never, audit);

    const result = await service.create(
      { organizationId, userId, permission: 2 },
      { client_id: clientId, competence: "2026-06" },
    );

    expect(result).toMatchObject({ created: false, obligation: { id: recordId } });
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("retorna null ao detalhar competencia sem obrigacao cadastrada", async () => {
    const prisma = createPrismaMock();
    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce(null);
    const service = new ObligationService(prisma as never, createAuditMock());

    await expect(
      service.detail({ organizationId }, { client_id: clientId, competence: "2026-07" }),
    ).resolves.toBeNull();
  });

  it("atualiza exatamente um campo da obrigacao", async () => {
    const prisma = createPrismaMock();
    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce({
      id: recordId,
      organization_id: organizationId,
    });
    const service = new ObligationService(prisma as never, createAuditMock());

    await service.updateField({ organizationId, userId, permission: 2 }, recordId, {
      payroll: true,
    });

    expect(prisma.obrigationsPessoal.update).toHaveBeenCalledWith({
      where: { id: recordId },
      data: { payroll: true },
      select: expect.any(Object),
    });
  });

  it("valida responsavel na organizacao antes de atualizar a obrigacao", async () => {
    const prisma = createPrismaMock();
    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce({
      id: recordId,
      organization_id: organizationId,
    });
    const service = new ObligationService(prisma as never, createAuditMock());

    await service.updateField({ organizationId, userId, permission: 2 }, recordId, {
      responsavel_id: responsibleId,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: responsibleId,
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
        permissions: { some: { organization_id: organizationId, pessoal: { gt: 0 } } },
      },
      select: { id: true },
    });
    expect(prisma.obrigationsPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { responsavel_id: responsibleId },
      }),
    );
  });

  it("rejeita responsavel fora da organizacao ao atualizar a obrigacao", async () => {
    const prisma = createPrismaMock();
    prisma.obrigationsPessoal.findFirst.mockResolvedValueOnce({
      id: recordId,
      organization_id: organizationId,
    });
    prisma.user.findFirst.mockResolvedValueOnce(null);
    const service = new ObligationService(prisma as never, createAuditMock());

    await expect(
      service.updateField({ organizationId, userId, permission: 2 }, recordId, {
        responsavel_id: responsibleId,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.obrigationsPessoal.update).not.toHaveBeenCalled();
  });

  it("gera competencia em lote com Map Set e chunks", async () => {
    const prisma = createPrismaMock();
    const service = new ObligationService(prisma as never, createAuditMock());

    const result = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-06",
    );

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, status: "Ativo", pessoal: true },
      }),
    );
    expect(prisma.payroll.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, client_id: { in: [clientId, otherClientId] } },
      }),
    );
    expect(prisma.obrigationsPessoal.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.obrigationsPessoal.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
    expect(result).toEqual({
      clients: 2,
      payrollRows: 2,
      existing: 1,
      created: 1,
      skippedExisting: 1,
      skippedArchivedGroup: 0,
      skippedNoObligations: 0,
      skippedNoGroup: 0,
      skippedNoPayroll: 0,
    });
  });

  it("contabiliza obrigacoes puladas por concorrencia no createMany", async () => {
    const prisma = createPrismaMock();
    prisma.obrigationsPessoal.findMany.mockResolvedValueOnce([]);
    prisma.obrigationsPessoal.createMany.mockResolvedValueOnce({ count: 1 });
    const service = new ObligationService(prisma as never, createAuditMock());

    const result = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-06",
    );

    expect(prisma.obrigationsPessoal.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ client_id: clientId }),
        expect.objectContaining({ client_id: otherClientId }),
      ]),
      skipDuplicates: true,
    });
    expect(result).toMatchObject({
      existing: 0,
      created: 1,
      skippedExisting: 1,
      skippedNoPayroll: 0,
    });
  });

  it("ignora folhas NO_OBLIGATIONS sem criar obrigacao", async () => {
    const prisma = createPrismaMock();
    prisma.payroll.findMany.mockResolvedValueOnce([
      payrollRow(clientId, "NO_OBLIGATIONS"),
      payrollRow(otherClientId),
    ]);
    prisma.obrigationsPessoal.findMany.mockResolvedValueOnce([]);
    const service = new ObligationService(prisma as never, createAuditMock());

    const result = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-07",
    );

    expect(prisma.obrigationsPessoal.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ client_id: otherClientId })],
      skipDuplicates: true,
    });
    expect(result).toMatchObject({ created: 1, skippedNoObligations: 1 });
  });

  it("usa politica e nome atuais somente na proxima competencia", async () => {
    const prisma = createPrismaMock();
    const first = payrollRow(clientId, "NORMAL");
    const changed = {
      ...payrollRow(clientId, "NO_OBLIGATIONS"),
      group: {
        id: `group-${clientId}`,
        name: "Grupo Renomeado",
        policy: "NO_OBLIGATIONS",
        archived_at: null,
        organization_id: organizationId,
      },
    };
    prisma.client.findMany
      .mockResolvedValueOnce([{ id: clientId }])
      .mockResolvedValueOnce([{ id: clientId }]);
    prisma.payroll.findMany.mockResolvedValueOnce([first]).mockResolvedValueOnce([changed]);
    prisma.obrigationsPessoal.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const service = new ObligationService(prisma as never, createAuditMock());

    await service.generateForCompetence({ organizationId, userId, permission: 2 }, "2026-07");
    const second = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-08",
    );

    expect(prisma.obrigationsPessoal.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          group_snapshot_name: `Grupo ${clientId}`,
          group_snapshot_policy: "NORMAL",
        }),
      ],
      skipDuplicates: true,
    });
    expect(second).toMatchObject({ created: 0, skippedNoObligations: 1 });
  });

  it("ignora grupo arquivado somente nas novas competencias", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientId }]);
    prisma.payroll.findMany.mockResolvedValueOnce([
      payrollRow(clientId, "NORMAL", new Date("2026-07-01T00:00:00.000Z")),
    ]);
    prisma.obrigationsPessoal.findMany.mockResolvedValueOnce([]);
    const service = new ObligationService(prisma as never, createAuditMock());

    const result = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-08",
    );

    expect(prisma.obrigationsPessoal.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, skippedArchivedGroup: 1 });
  });

  it("ignora grupo de outra organizacao sem gravar snapshot", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientId }]);
    prisma.payroll.findMany.mockResolvedValueOnce([
      {
        ...payrollRow(clientId),
        group: { ...payrollRow(clientId).group, organization_id: "other-organization" },
      },
    ]);
    prisma.obrigationsPessoal.findMany.mockResolvedValueOnce([]);
    const service = new ObligationService(prisma as never, createAuditMock());

    const result = await service.generateForCompetence(
      { organizationId, userId, permission: 2 },
      "2026-08",
    );

    expect(prisma.obrigationsPessoal.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, skippedNoGroup: 1 });
  });
});
