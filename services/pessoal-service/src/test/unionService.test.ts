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
      findMany: vi.fn(async () => []),
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
    },
  };
}

describe("UnionService", () => {
  it("lista sindicatos por organizacao", async () => {
    const prisma = createPrismaMock();
    const service = new UnionService(prisma as never, createAuditMock());

    await service.list({ organizationId });

    expect(prisma.unionPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId } }),
    );
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
});
