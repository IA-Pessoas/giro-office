import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { PayrollService } from "../services/payrollService.js";
import {
  clientId,
  createAuditMock,
  organizationId,
  responsibleId,
  unionId,
  userId,
} from "./pessoalCoreTestUtils.js";

function createPrismaMock() {
  return {
    client: { findFirst: vi.fn(async () => ({ id: clientId })) },
    user: { findFirst: vi.fn(async () => ({ id: responsibleId })) },
    unionPessoal: { findFirst: vi.fn(async () => ({ id: unionId })) },
    payroll: {
      findFirst: vi.fn(
        async ({
          where,
        }): Promise<{ id: string; client_id?: string; organization_id?: string } | null> =>
          where.client_id && !where.id ? null : { id: "payroll-1" },
      ),
      create: vi.fn(async ({ data }) => ({ id: "payroll-1", ...data })),
      update: vi.fn(async ({ data }) => ({ id: "payroll-1", ...data })),
    },
  };
}

const payrollBody = {
  client_id: clientId,
  responsible_id: responsibleId,
  advance: true,
  info: "Enviar ate dia 5",
  previous: false,
  onvio: true,
  group: "A",
  vt: true,
  va: true,
  assistance_fee: true,
  union_id: unionId,
  bem_mais: false,
  bsf: true,
  reinf: false,
  employees: 12,
};

describe("PayrollService", () => {
  it("bloqueia mutacoes de folha para Viewer antes de acessar a persistencia", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new PayrollService(prisma as never, audit);
    const viewerContext = { organizationId, userId, permission: 1 };
    const operations = [
      () => service.create(viewerContext, payrollBody),
      () => service.update(viewerContext, clientId, { info: "Novo prazo" }),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.payroll.findFirst).not.toHaveBeenCalled();
    expect(prisma.payroll.create).not.toHaveBeenCalled();
    expect(prisma.payroll.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("cria folha apos validar relacionamentos", async () => {
    const prisma = createPrismaMock();
    const service = new PayrollService(prisma as never, createAuditMock());

    await service.create({ organizationId, userId, permission: 2 }, payrollBody);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
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
    expect(prisma.unionPessoal.findFirst).toHaveBeenCalledWith({
      where: { id: unionId, organization_id: organizationId },
      select: { id: true },
    });
  });

  it("rejeita folha duplicada por cliente", async () => {
    const prisma = createPrismaMock();
    prisma.payroll.findFirst.mockResolvedValueOnce({ id: "payroll-existing" });
    const service = new PayrollService(prisma as never, createAuditMock());

    await expect(
      service.create({ organizationId, userId, permission: 2 }, payrollBody),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("retorna null ao detalhar cliente sem folha cadastrada", async () => {
    const prisma = createPrismaMock();
    prisma.payroll.findFirst.mockResolvedValueOnce(null);
    const service = new PayrollService(prisma as never, createAuditMock());

    await expect(service.detail({ organizationId }, clientId)).resolves.toBeNull();
  });

  it("atualiza folha escopada por cliente e organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.payroll.findFirst.mockResolvedValueOnce({
      id: "payroll-1",
      client_id: clientId,
      organization_id: organizationId,
    });
    const service = new PayrollService(prisma as never, createAuditMock());

    await service.update({ organizationId, userId, permission: 2 }, clientId, {
      info: "Novo prazo",
    });

    expect(prisma.payroll.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { client_id: clientId, organization_id: organizationId } }),
    );
    expect(prisma.payroll.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { client_id: clientId }, data: { info: "Novo prazo" } }),
    );
  });
});
