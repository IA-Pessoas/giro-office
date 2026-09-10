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
  return {
    client: {
      findFirst: vi.fn(async () => client),
      findMany: vi.fn(async () => [client]),
    },
    commercialProspecting: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [item]),
      create: vi.fn(async () => item),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as unknown as CommercialProspectingPrismaDeps;
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
      expect.objectContaining({ where: { organization_id: OTHER_ORGANIZATION_ID } }),
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
    prisma.commercialProspecting.findFirst = vi.fn(async () => ({ id: PROSPECTING_ID }));
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
      where: { id: PROSPECTING_ID, organization_id: ORGANIZATION_ID },
      data: { status: "Análise/Agendamento" },
    });
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
});
