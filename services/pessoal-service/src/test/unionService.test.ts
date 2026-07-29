import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { UnionService } from "../services/unionService.js";
import {
  createAuditMock,
  organizationId,
  recordId,
  unionId,
  userId,
} from "./pessoalCoreTestUtils.js";

type UnionFindFirstResult = {
  id: string;
  name?: string;
  cnpj?: string;
  base_date?: Date | null;
  organization_id?: string;
};

function createPrismaMock() {
  return {
    unionPessoal: {
      findMany: vi.fn(async (): Promise<UnionFindFirstResult[]> => []),
      count: vi.fn(async () => 0),
      findFirst: vi.fn(
        async ({ where }): Promise<UnionFindFirstResult | null> =>
          typeof where.id === "string"
            ? {
                id: recordId,
                name: "Sindicato A",
                cnpj: "123",
                base_date: null,
                organization_id: organizationId,
              }
            : null,
      ),
      create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      update: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      delete: vi.fn(async () => undefined),
    },
    payroll: {
      count: vi.fn(async () => 0),
    },
  };
}

describe("UnionService", () => {
  it("lista sindicatos por organizacao", async () => {
    const prisma = createPrismaMock();
    const service = new UnionService(prisma as never, createAuditMock());

    await service.list(
      { organizationId },
      { search: "", page: 1, limit: 20, paginationRequested: false },
    );

    expect(prisma.unionPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId } }),
    );
  });

  it("busca por nome ou CNPJ antes de paginar", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.findMany.mockResolvedValueOnce([
      {
        id: "union-21",
        name: "Metalúrgicos",
        cnpj: "123",
        base_date: null,
        organization_id: organizationId,
      },
    ]);
    prisma.unionPessoal.count.mockResolvedValueOnce(21);
    const service = new UnionService(prisma as never, createAuditMock());

    const result = await service.list(
      { organizationId },
      { search: "metal", page: 2, limit: 20, paginationRequested: true },
    );

    const where = {
      organization_id: organizationId,
      OR: [
        { name: { contains: "metal", mode: "insensitive" } },
        { cnpj: { contains: "metal", mode: "insensitive" } },
      ],
    };
    expect(prisma.unionPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 20 }),
    );
    expect(prisma.unionPessoal.count).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({ total: 21, page: 2, limit: 20, hasMore: false });
  });

  it("rejeita sindicato duplicado na mesma organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.findFirst.mockResolvedValueOnce({ id: recordId });
    const service = new UnionService(prisma as never, createAuditMock());

    await expect(
      service.create({ organizationId, userId }, { name: "Sindicato A", cnpj: "123" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("atualiza sindicato escopado por organizacao", async () => {
    const prisma = createPrismaMock();
    const service = new UnionService(prisma as never, createAuditMock());

    await service.update({ organizationId, userId }, recordId, { name: "Sindicato B" });

    expect(prisma.unionPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId }, data: { name: "Sindicato B" } }),
    );
  });

  it("rejeita update que duplicaria outro sindicato da organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.findFirst
      .mockResolvedValueOnce({
        id: recordId,
        name: "Sindicato A",
        cnpj: "123",
        base_date: null,
        organization_id: organizationId,
      })
      .mockResolvedValueOnce({ id: unionId });
    const service = new UnionService(prisma as never, createAuditMock());

    await expect(
      service.update({ organizationId, userId }, recordId, { name: "Sindicato B" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.unionPessoal.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: organizationId,
        name: "Sindicato B",
        cnpj: "123",
        base_date: null,
        id: { not: recordId },
      },
      select: { id: true },
    });
    expect(prisma.unionPessoal.update).not.toHaveBeenCalled();
  });

  it("remove sindicato escopado por organizacao e audita o snapshot", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new UnionService(prisma as never, audit);

    const result = await service.delete(
      { organizationId, userId, permission: 1, requestId: "request-union-delete" },
      recordId,
    );

    expect(prisma.unionPessoal.findFirst).toHaveBeenCalledWith({
      where: { id: recordId, organization_id: organizationId },
      select: {
        id: true,
        name: true,
        cnpj: true,
        base_date: true,
        organization_id: true,
      },
    });
    expect(prisma.payroll.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, union_id: recordId },
    });
    expect(prisma.unionPessoal.delete).toHaveBeenCalledWith({ where: { id: recordId } });
    expect(audit.recordChange).toHaveBeenCalledWith({
      requestId: "request-union-delete",
      organizationId,
      userId,
      permission: 1,
      action: "Exclusao",
      referring: "pessoal.union",
      referringId: recordId,
      changes: {
        id: recordId,
        name: "Sindicato A",
        cnpj: "123",
        base_date: null,
        organization_id: organizationId,
      },
      path: `/pessoal/unions/${recordId}`,
    });
    expect(result).toEqual({
      id: recordId,
      name: "Sindicato A",
      cnpj: "123",
      base_date: null,
      organization_id: organizationId,
    });
  });

  it("nao remove sindicato de outra organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.findFirst.mockResolvedValueOnce(null);
    const audit = createAuditMock();
    const service = new UnionService(prisma as never, audit);

    await expect(service.delete({ organizationId, userId }, recordId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Sindicato nao encontrado.",
    });

    expect(prisma.payroll.count).not.toHaveBeenCalled();
    expect(prisma.unionPessoal.delete).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("rejeita exclusao de sindicato vinculado a folha", async () => {
    const prisma = createPrismaMock();
    prisma.payroll.count.mockResolvedValueOnce(1);
    const audit = createAuditMock();
    const service = new UnionService(prisma as never, audit);

    await expect(service.delete({ organizationId, userId }, recordId)).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Não é possível remover o sindicato porque ele está vinculado a uma ou mais configurações de folha. Altere esses vínculos antes de tentar novamente.",
    });

    expect(prisma.unionPessoal.delete).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("traduz conflito Prisma P2003 concorrente para o conflito de folha", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.delete.mockRejectedValueOnce({ code: "P2003" });
    const audit = createAuditMock();
    const service = new UnionService(prisma as never, audit);

    await expect(service.delete({ organizationId, userId }, recordId)).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Não é possível remover o sindicato porque ele está vinculado a uma ou mais configurações de folha. Altere esses vínculos antes de tentar novamente.",
    });

    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("traduz exclusao concorrente ja consumida pelo Prisma para sindicato nao encontrado", async () => {
    const prisma = createPrismaMock();
    prisma.unionPessoal.delete.mockRejectedValueOnce({ code: "P2025" });
    const audit = createAuditMock();
    const service = new UnionService(prisma as never, audit);

    await expect(service.delete({ organizationId, userId }, recordId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Sindicato nao encontrado.",
    });

    expect(audit.recordChange).not.toHaveBeenCalled();
  });
});
