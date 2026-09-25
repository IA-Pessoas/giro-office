import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { FiscalRateService } from "../services/fiscalRateService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";

function dependencies() {
  const prisma = {
    client: {
      findFirst: vi.fn(async () => ({
        id: clientId,
        name: "Empresa de Exemplo",
        company_name: "Empresa de Exemplo Ltda",
        cpf_cnpj: "12.345.678/0001-90",
      })),
    },
    fiscalRate: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "e0000000-0000-4000-8000-000000000001",
        ...data,
        createdAt: new Date("2026-09-25T12:00:00.000Z"),
      })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  };
  const audit = { createLog: vi.fn(async () => {}) };
  return { prisma, audit };
}

describe("FiscalRateService", () => {
  it("registra a alíquota manual com identidade e nome da empresa do mesmo tenant", async () => {
    const { prisma, audit } = dependencies();
    const service = new FiscalRateService(prisma as never, audit);

    const result = await service.create({
      organizationId,
      userId,
      client_id: clientId,
      competence: "2026-08",
      tax_type: "ISS",
      rate: "5,1250",
    });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId, type: "PJ" },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true },
    });
    expect(prisma.fiscalRate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organizationId,
        client_id: clientId,
        client_name: "Empresa de Exemplo Ltda",
        client_document: "12.345.678/0001-90",
        competence: new Date("2026-08-01T00:00:00.000Z"),
        tax_type: "ISS",
        rate: "5.1250",
        issued_by: userId,
      }),
    });
    expect(result.rate).toBe("5.1250");
    expect(audit.createLog).toHaveBeenCalledOnce();
  });

  it("recusa cliente fora da organização antes de gravar", async () => {
    const { prisma, audit } = dependencies();
    prisma.client.findFirst.mockResolvedValueOnce(null as never);
    const service = new FiscalRateService(prisma as never, audit);

    await expect(
      service.create({
        organizationId,
        userId,
        client_id: clientId,
        competence: "2026-08",
        tax_type: "ICMS",
        rate: "18.00",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.fiscalRate.create).not.toHaveBeenCalled();
  });

  it("busca PDF somente pelo id e tenant, sem recalcular", async () => {
    const { prisma, audit } = dependencies();
    const service = new FiscalRateService(prisma as never, audit);
    await expect(
      service.get("e0000000-0000-4000-8000-000000000001", organizationId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.fiscalRate.findFirst).toHaveBeenCalledWith({
      where: { id: "e0000000-0000-4000-8000-000000000001", organization_id: organizationId },
    });
  });
});
