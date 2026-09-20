import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  type CommercialProspectingAuditDeps,
  type CommercialProspectingPrismaDeps,
  CommercialProspectingService,
} from "../services/prospectingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const PROSPECTING_ID = "d0000000-0000-4000-8000-000000000001";

const client = { id: CLIENT_ID, name: "Cliente", company_name: "Empresa", fantasy_name: null };
const item = {
  id: PROSPECTING_ID,
  client_id: CLIENT_ID,
  status: "Paralisado",
  status_date: new Date("2026-09-10T00:00:00.000Z"),
  description: "Retorno em outubro",
  client,
};

function createMockPrisma(): CommercialProspectingPrismaDeps {
  const prisma = {
    client: {
      findFirst: vi.fn(async () => client),
      findMany: vi.fn(async () => [client]),
    },
    commercialProspecting: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [item]),
      create: vi.fn(async () => item),
      updateMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => item),
    },
    commercialOutboxEvent: {
      create: vi.fn(async () => ({ id: "event-id" })),
    },
  } as unknown as CommercialProspectingPrismaDeps;
  prisma.$transaction = vi.fn(async (callback) => callback(prisma as never)) as never;
  return prisma;
}

function createAuditMock(): CommercialProspectingAuditDeps {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("CommercialProspectingService", () => {
  it("lista somente a organização autenticada", async () => {
    const prisma = createMockPrisma();
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await service.list(OTHER_ORGANIZATION_ID);

    expect(prisma.commercialProspecting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: OTHER_ORGANIZATION_ID, archived_at: null },
      }),
    );
  });

  it("lista somente clientes sem prospecção na organização autenticada", async () => {
    const prisma = createMockPrisma();
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await service.listClients(ORGANIZATION_ID);

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORGANIZATION_ID,
          commercialProspectings: { none: { organization_id: ORGANIZATION_ID } },
        },
      }),
    );
  });

  it("não permite cadastrar cliente de outra organização", async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst = vi.fn(async () => null);
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: OTHER_ORGANIZATION_ID,
        client_id: CLIENT_ID,
        status: "Análise Financeira",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.commercialProspecting.create).not.toHaveBeenCalled();
  });

  it("impede duas prospecções para o mesmo cliente na organização", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.findFirst = vi.fn(async () => ({
      id: PROSPECTING_ID,
      archived_at: new Date("2026-09-12T00:00:00.000Z"),
    }));
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        status: "Envio de Proposta",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("registra auditoria no cadastro com os dados do domínio comercial", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.findFirst = vi.fn(async () => null);
    const audit = createAuditMock();
    const service = new CommercialProspectingService(prisma, audit);

    await service.create({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      client_id: CLIENT_ID,
      status: "Análise Financeira",
    });

    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        referring: "commercial.prospecting",
      }),
    );
  });

  it("permite retomar uma prospecção paralisada e audita a atualização", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.findFirst = vi
      .fn()
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce({ ...item, status: "Análise/Agendamento" });
    const audit = createAuditMock();
    const service = new CommercialProspectingService(prisma, audit);

    await service.update({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      prospecting_id: PROSPECTING_ID,
      status: "Análise/Agendamento",
    });

    expect(prisma.commercialProspecting.updateMany).toHaveBeenCalledWith({
      where: { id: PROSPECTING_ID, organization_id: ORGANIZATION_ID, archived_at: null },
      data: { status: "Análise/Agendamento" },
    });
    expect(prisma.commercialOutboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: ORGANIZATION_ID,
          payload: expect.objectContaining({
            from_status: "Paralisado",
            to_status: "Análise/Agendamento",
          }),
        }),
      }),
    );
    expect(audit.logUpdateIfChanged).toHaveBeenCalled();
  });

  it("mantém Fechado como estado terminal", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.findFirst = vi.fn(async () => ({ ...item, status: "Fechado" }));
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await expect(
      service.update({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        prospecting_id: PROSPECTING_ID,
        status: "Paralisado",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.commercialProspecting.updateMany).not.toHaveBeenCalled();
  });

  it("arquiva sem excluir fisicamente e registra auditoria", async () => {
    const prisma = createMockPrisma();
    const audit = createAuditMock();
    const service = new CommercialProspectingService(prisma, audit);

    await expect(
      service.archive({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        prospecting_id: PROSPECTING_ID,
      }),
    ).resolves.toEqual({ id: PROSPECTING_ID, deleted: true });

    expect(prisma.commercialProspecting.updateMany).toHaveBeenCalledWith({
      where: { id: PROSPECTING_ID, organization_id: ORGANIZATION_ID, archived_at: null },
      data: { archived_at: expect.any(Date) },
    });
    expect(prisma.commercialProspecting.delete).not.toHaveBeenCalled();
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        action: "Arquivamento",
        referring: "commercial.prospecting",
        referringId: PROSPECTING_ID,
      }),
    );
    expect(prisma.commercialOutboxEvent.create).not.toHaveBeenCalled();
  });

  it("torna a arquivação idempotente e repete auditoria para recuperar falha anterior", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.updateMany = vi.fn(async () => ({ count: 0 }));
    prisma.commercialProspecting.findFirst = vi.fn(async () => ({
      id: PROSPECTING_ID,
      archived_at: new Date("2026-09-12T00:00:00.000Z"),
    }));
    const audit = createAuditMock();
    const service = new CommercialProspectingService(prisma, audit);

    await expect(
      service.archive({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        prospecting_id: PROSPECTING_ID,
      }),
    ).resolves.toEqual({ id: PROSPECTING_ID, deleted: true });

    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Arquivamento",
        referringId: PROSPECTING_ID,
      }),
    );
  });

  it("permite recuperar auditoria indisponível em uma nova tentativa idempotente", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.commercialProspecting.findFirst = vi.fn(async () => ({
      id: PROSPECTING_ID,
      archived_at: new Date("2026-09-12T00:00:00.000Z"),
    }));
    const audit = createAuditMock();
    audit.createLog = vi
      .fn()
      .mockRejectedValueOnce(new Error("audit indisponível"))
      .mockResolvedValue(undefined);
    const service = new CommercialProspectingService(prisma, audit);
    const request = {
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      prospecting_id: PROSPECTING_ID,
    };

    await expect(service.archive(request)).rejects.toMatchObject({ statusCode: 500 });
    await expect(service.archive(request)).resolves.toEqual({
      id: PROSPECTING_ID,
      deleted: true,
    });
    expect(audit.createLog).toHaveBeenCalledTimes(2);
  });

  it("retorna 404 ao arquivar prospecção ausente", async () => {
    const prisma = createMockPrisma();
    prisma.commercialProspecting.updateMany = vi.fn(async () => ({ count: 0 }));
    prisma.commercialProspecting.findFirst = vi.fn(async () => null);
    const service = new CommercialProspectingService(prisma, createAuditMock());

    await expect(
      service.archive({
        user_id: USER_ID,
        organization_id: OTHER_ORGANIZATION_ID,
        prospecting_id: PROSPECTING_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("não arquiva registro pertencente a outro tenant", async () => {
    const prisma = createMockPrisma();
    const otherTenantRow = {
      id: PROSPECTING_ID,
      organization_id: OTHER_ORGANIZATION_ID,
      archived_at: null,
    };
    prisma.commercialProspecting.updateMany = vi.fn(async ({ where }) => ({
      count: where.organization_id === otherTenantRow.organization_id ? 1 : 0,
    }));
    prisma.commercialProspecting.findFirst = vi.fn(async ({ where }) =>
      where.organization_id === otherTenantRow.organization_id ? otherTenantRow : null,
    );
    const audit = createAuditMock();
    const service = new CommercialProspectingService(prisma, audit);

    await expect(
      service.archive({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        prospecting_id: PROSPECTING_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(audit.createLog).not.toHaveBeenCalled();
  });
});
